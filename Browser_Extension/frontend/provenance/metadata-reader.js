// Pure, bounded container inspection. It never validates a signature or fetches a URL.
export const LIMITS = Object.freeze({ file: 8 * 1024 * 1024, chunk: 65536, totalText: 262144, chunks: 4096, hints: 12, text: 240, inflations: 12 });
const decoder = new TextDecoder();
const latin = new TextDecoder('latin1');
const families = Object.freeze([
  ['OpenAI', /\bopenai\b|chatgpt|dall[ -]?e|gpt-image/i], ['Google', /gemini|imagen|nano banana/i],
  ['ComfyUI', /comfyui/i], ['Stable Diffusion', /stable\s*diffusion|automatic1111|invokeai|fooocus/i],
  ['NovelAI', /novelai/i], ['Midjourney', /midjourney/i], ['Adobe Firefly', /firefly/i],
  ['Black Forest Labs', /black forest|\bflux\b/i], ['ByteDance', /bytedance|seedream/i], ['Recraft', /recraft/i]
]);
export const familyFor = value => typeof value === 'string' ? families.find(([, pattern]) => pattern.test(value))?.[0] || null : null;
export const DIGITAL_SOURCE_TYPES = Object.freeze(['trainedAlgorithmicMedia', 'compositeWithTrainedAlgorithmicMedia', 'compositeSynthetic', 'algorithmicMedia']);
export const capText = (value, max = LIMITS.text) => typeof value === 'string' ? value.slice(0, max) : '';

async function inflate(bytes) {
  if (typeof DecompressionStream !== 'function') return null;
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > LIMITS.chunk) { await reader.cancel(); return null; }
      parts.push(value);
    }
    const out = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export async function readMetadata(input) {
  const result = { format: null, marker: 'unknown', metadataHints: [], remoteManifestNotFetched: false, warnings: [] };
  let budget = LIMITS.totalText;
  let inflations = 0;
  const boundedInflate = bytes => ++inflations <= LIMITS.inflations && budget > 0 ? inflate(bytes) : null;
  function hint(label, value, family = familyFor(value), declared = false) {
    if (result.metadataHints.length >= LIMITS.hints || !value) return;
    const item = { label: capText(label, 80), value: capText(value), unsigned: true, family, declared };
    if (!result.metadataHints.some(existing => existing.label === item.label && existing.value === item.value)) result.metadataHints.push(item);
  }
  function text(bytes, encoding = decoder) {
    if (bytes.length > LIMITS.chunk || bytes.length > budget) return '';
    budget -= bytes.length;
    return encoding.decode(bytes);
  }
  function inspectText(value, label = 'Software') {
    // Never retain a whole XMP/JSON payload or a prompt. Only named scalar tool
    // fields, source declarations and fixed marker-presence messages escape.
    const family = familyFor(value);
    if (/^(Software|Source|CreatorTool|Generator)$/i.test(label) && !value.includes('<')) hint(label, value);
    else if (family) hint(label, `${family} marker present (contents not retained)`, family);
    if (/(?:dcterms:provenance|c2pa:manifest|c2pa:provenance)[\s\S]{0,512}?https?:/i.test(value)) result.remoteManifestNotFetched = true;
    const fields = /(?:<(?:[\w-]+:)?(CreatorTool|Software|DigitalSourceType|AISystemUsed|AISystemVersionUsed)\b[^>]*>([^<]{1,1024})|(?:[\w-]+:)?(CreatorTool|Software|DigitalSourceType|AISystemUsed|AISystemVersionUsed)\s*=\s*["']([^"']{1,1024}))/gi;
    for (const match of value.matchAll(fields)) {
      const key = match[1] || match[3], scalar = match[2] || match[4];
      if (/^(CreatorTool|Software)$/i.test(key)) hint('Software / XMP', scalar);
      else if (/^DigitalSourceType$/i.test(key)) {
        const base = 'http://cv.iptc.org/newscodes/digitalsourcetype/';
        if (DIGITAL_SOURCE_TYPES.some(type => scalar === base + type)) hint('IPTC DigitalSourceType', scalar, null, true);
      } else hint(/^AISystemUsed$/i.test(key) ? 'IPTC AI System Used' : 'IPTC AI System Version Used', scalar, familyFor(scalar), true);
    }
    if (/^Software \/ EXIF$/.test(label)) hint(label, value);
    if (/midjourney/i.test(value)) {
      const job = value.match(/(?:job[ _-]?(?:id)?)[\s:=\"']{1,12}([a-f0-9]{8}-[a-f0-9-]{27,40})/i);
      if (job) hint('Midjourney job id', job[1], 'Midjourney');
    }
  }
  function exif(bytes) {
    if (bytes.length > LIMITS.chunk || bytes.length < 8) return;
    let start = bytes[0] === 0x45 && bytes[1] === 0x78 ? 6 : 0;
    if (start + 8 > bytes.length) return;
    const dv = new DataView(bytes.buffer, bytes.byteOffset + start, bytes.length - start);
    const little = dv.getUint16(0) === 0x4949;
    if (!little && dv.getUint16(0) !== 0x4d4d) return;
    if (dv.getUint16(2, little) !== 42) return;
    const visited = new Set();
    function ifd(offset, depth) {
      if (depth > 3 || visited.has(offset) || offset + 2 > dv.byteLength) return;
      visited.add(offset);
      const count = Math.min(dv.getUint16(offset, little), 128);
      for (let i = 0; i < count; i++) {
        const entry = offset + 2 + 12 * i;
        if (entry + 12 > dv.byteLength) return;
        const tag = dv.getUint16(entry, little), type = dv.getUint16(entry + 2, little), size = dv.getUint32(entry + 4, little);
        if (tag === 0x8769 && type === 4) ifd(dv.getUint32(entry + 8, little), depth + 1);
        if (![0x0131, 0x010e, 0x9286].includes(tag) || ![2, 7].includes(type) || size > LIMITS.chunk) continue;
        const pos = size <= 4 ? entry + 8 : dv.getUint32(entry + 8, little);
        if (pos + size > dv.byteLength) continue;
        const value = text(bytes.subarray(start + pos, start + pos + size), latin).replace(/\0/g, '');
        inspectText(value, tag === 0x0131 ? 'Software / EXIF' : 'EXIF description / comment');
      }
    }
    ifd(dv.getUint32(4, little), 0);
  }
  try {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (!bytes.length || bytes.length > LIMITS.file) return result;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ascii = (offset, size) => latin.decode(bytes.subarray(offset, offset + size));
    if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 7) === 'PNG\r\n\x1a\n') {
      result.format = 'image/png';
      let offset = 8;
      for (let count = 0; count < LIMITS.chunks && offset + 12 <= bytes.length; count++) {
        const size = dv.getUint32(offset), type = ascii(offset + 4, 4), end = offset + 12 + size;
        if (end > bytes.length) break;
        if (type === 'caBX') result.marker = 'present';
        if (['tEXt', 'iTXt', 'zTXt'].includes(type) && size <= LIMITS.chunk) {
          const data = bytes.subarray(offset + 8, offset + 8 + size);
          const zero = data.indexOf(0);
          if (zero > 0 && zero <= 79) {
            const key = ascii(offset + 8, zero);
            let body = data.subarray(zero + 1);
            if (type === 'zTXt') body = body[0] === 0 ? await boundedInflate(body.subarray(1)) : null;
            if (type === 'iTXt') {
              const compressed = body[0], method = body[1];
              let pos = body.indexOf(0, 2);
              pos = pos < 0 ? -1 : body.indexOf(0, pos + 1);
              body = pos < 0 || method !== 0 || compressed > 1 ? null : compressed ? await boundedInflate(body.subarray(pos + 1)) : body.subarray(pos + 1);
            }
            if (body) {
              const value = text(body, type === 'tEXt' ? latin : decoder);
              if (/^(parameters|prompt|workflow)$/i.test(key)) hint(key === 'parameters' ? 'Stable Diffusion parameters' : `ComfyUI ${key}`, 'Present (prompt/workflow content not retained)', key === 'parameters' ? 'Stable Diffusion' : 'ComfyUI');
              else inspectText(value, key);
            }
          }
        }
        offset = end;
        if (type === 'IEND') { if (result.marker !== 'present' && offset === bytes.length) result.marker = 'absent'; return result; }
      }
    } else if (bytes.length >= 2 && dv.getUint16(0) === 0xffd8) {
      result.format = 'image/jpeg';
      let offset = 2, count = 0;
      while (offset < bytes.length && count++ < LIMITS.chunks) {
        if (bytes[offset++] !== 0xff) continue; // entropy-coded data after SOS
        while (bytes[offset] === 0xff) offset++;
        const marker = bytes[offset++];
        if (marker === 0xd9) { if (result.marker !== 'present' && offset === bytes.length) result.marker = 'absent'; return result; }
        if (marker === 0 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (offset + 2 > bytes.length) break;
        const size = dv.getUint16(offset);
        if (size < 2 || offset + size > bytes.length) break;
        if (marker === 0xeb) result.marker = 'present'; // any APP11 is conservatively authoritative-SDK work
        if (marker === 0xe1 && size <= LIMITS.chunk) {
          const data = bytes.subarray(offset + 2, offset + size);
          if (ascii(offset + 2, 6) === 'Exif\0\0') exif(data);
          else inspectText(text(data), 'Software / XMP');
        }
        offset += size;
      }
    } else if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
      result.format = 'image/webp';
      const end = dv.getUint32(4, true) + 8;
      if (end !== bytes.length) return result;
      let offset = 12, count = 0;
      while (offset + 8 <= end && count++ < LIMITS.chunks) {
        const type = ascii(offset, 4), size = dv.getUint32(offset + 4, true), next = offset + 8 + size + (size & 1);
        if (next > end) return result;
        const data = bytes.subarray(offset + 8, offset + 8 + size);
        if (type === 'C2PA') result.marker = 'present';
        if (type === 'EXIF') exif(data);
        if (type === 'XMP ') inspectText(text(data), 'Software / XMP');
        offset = next;
      }
      if (offset === end && result.marker !== 'present') result.marker = 'absent';
      return result;
    }
    if (result.format) result.warnings.push('Container is truncated or ambiguous; defer to SDK.');
  } catch { result.warnings.push('Could not safely parse container; defer to SDK.'); }
  return result;
}
