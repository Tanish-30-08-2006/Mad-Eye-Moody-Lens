// Pure, bounded container inspection. It never validates a signature or fetches a URL.
export const LIMITS = Object.freeze({ file: 8 * 1024 * 1024, chunk: 65536, totalText: 262144, chunks: 4096, hints: 12, text: 240 });
const decoder = new TextDecoder();
const latin = new TextDecoder('latin1');
const tools = /stable\s*diffusion|automatic1111|comfyui|midjourney|dall[ -]?e|firefly|invokeai|novelai|fooocus|adobe photoshop|generative/i;
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
  function hint(label, value) {
    if (result.metadataHints.length >= LIMITS.hints || !value) return;
    result.metadataHints.push({ label: capText(label, 80), value: capText(value), unsigned: true });
  }
  function text(bytes, encoding = decoder) {
    if (bytes.length > LIMITS.chunk || bytes.length > budget) return '';
    budget -= bytes.length;
    return encoding.decode(bytes);
  }
  function inspectText(value, label = 'Software') {
    if (tools.test(value)) hint(label, value);
    // Only record existence; never expose or dereference this attacker-controlled link.
    if (/(?:dcterms:provenance|c2pa:manifest|c2pa:provenance)[^\r\n]{0,512}https?:/i.test(value)) result.remoteManifestNotFetched = true;
    for (const match of value.matchAll(/(?:<[^>]*(?:CreatorTool|Software)[^>]*>([^<]{1,1024})|(?:CreatorTool|Software)\s*=\s*["']([^"']{1,1024}))/gi)) {
      const tool = match[1] || match[2];
      if (tools.test(tool)) hint('Software / XMP', tool);
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
        inspectText(value, 'Software / EXIF');
      }
    }
    ifd(dv.getUint32(4, little), 0);
  }
  try {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (!bytes.length || bytes.length > LIMITS.file) return result;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ascii = (offset, size) => latin.decode(bytes.subarray(offset, offset + size));
    if (bytes.length >= 8 && ascii(0, 8) === '\x89PNG\r\n\x1a\n') {
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
            if (type === 'zTXt') body = body[0] === 0 ? await inflate(body.subarray(1)) : null;
            if (type === 'iTXt') {
              const compressed = body[0], method = body[1];
              let pos = body.indexOf(0, 2);
              pos = pos < 0 ? -1 : body.indexOf(0, pos + 1);
              body = pos < 0 || method !== 0 || compressed > 1 ? null : compressed ? await inflate(body.subarray(pos + 1)) : body.subarray(pos + 1);
            }
            if (body) {
              const value = text(body, type === 'tEXt' ? latin : decoder);
              if (/^(parameters|prompt|workflow)$/i.test(key)) hint(key === 'parameters' ? 'Stable Diffusion parameters' : `ComfyUI ${key}`, value);
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
