export const MAX_BYTES = 8 * 1024 * 1024;
export const BYTE_TIMEOUT_MS = 12000;
export class AcquisitionError extends Error {
  constructor(message, code = 'bytes_unavailable') { super(message); this.code = code; }
}
const uploadMessage = 'Could not read the original image bytes. Upload the original file instead.';

// Isolated copy of background.js rules, extended to reject single-label and non-public ranges.
export function isPrivateOrLocalHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host === '::1' || host === '::') return true;
  if (host.includes(':')) return host.startsWith('fc') || host.startsWith('fd') || /^fe[89ab]/i.test(host) || host.startsWith('::') || host.startsWith('ff') || host.startsWith('2001:db8');
  const parts = host.split('.');
  if (parts.length === 4 && parts.every(part => /^\d+$/.test(part) && Number(part) <= 255)) {
    const [a, b, c] = parts.map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0) || (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) || a >= 224;
  }
  return !host.includes('.');
}

export function decodeDataImage(source) {
  if (source.length > MAX_BYTES * 4 + 1024) throw new AcquisitionError('Image exceeds the 8 MB limit.', 'size_limit_exceeded');
  const comma = source.indexOf(',');
  const header = source.slice(0, comma);
  if (comma < 0 || !/^data:image\/[a-z0-9.+-]+(?:;[^,]*)?$/i.test(header)) throw new AcquisitionError(uploadMessage);
  const mimeType = header.slice(5).split(';')[0].toLowerCase();
  const encoded = source.slice(comma + 1);
  let bytes;
  try {
    if (/;base64$/i.test(header)) {
      const base64 = encoded.replace(/\s/g, '');
      if (base64.length > Math.ceil(MAX_BYTES / 3) * 4) throw new AcquisitionError('Image exceeds the 8 MB limit.', 'size_limit_exceeded');
      if (!/^[a-z0-9+/]*={0,2}$/i.test(base64)) throw new Error();
      const raw = atob(base64);
      if (raw.length > MAX_BYTES) throw new AcquisitionError('Image exceeds the 8 MB limit.', 'size_limit_exceeded');
      bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    } else {
      const out = new Uint8Array(Math.min(encoded.length, MAX_BYTES));
      let size = 0;
      for (let i = 0; i < encoded.length; i++) {
        if (size >= MAX_BYTES) throw new AcquisitionError('Image exceeds the 8 MB limit.', 'size_limit_exceeded');
        if (encoded[i] === '%') {
          const hex = encoded.slice(i + 1, i + 3);
          if (!/^[a-f0-9]{2}$/i.test(hex)) throw new Error();
          out[size++] = parseInt(hex, 16); i += 2;
        } else {
          if (encoded.charCodeAt(i) > 127) throw new Error();
          out[size++] = encoded.charCodeAt(i);
        }
      }
      bytes = out.subarray(0, size);
    }
  } catch (error) { if (error instanceof AcquisitionError) throw error; throw new AcquisitionError(uploadMessage); }
  if (!bytes.length) throw new AcquisitionError(uploadMessage);
  return { bytes, mimeType };
}

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new AcquisitionError(uploadMessage));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function acquireBytes(source, { fetchImpl = globalThis.fetch, signal, timeoutMs = BYTE_TIMEOUT_MS } = {}) {
  if (signal?.aborted) throw new AcquisitionError(uploadMessage);
  if (typeof source !== 'string') throw new AcquisitionError(uploadMessage);
  if (source.startsWith('data:')) return decodeDataImage(source);
  let url;
  try { url = new URL(source); } catch { throw new AcquisitionError(uploadMessage); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || isPrivateOrLocalHostname(url.hostname)) throw new AcquisitionError('Only public HTTP(S) image URLs can be checked. Upload the original file instead.', 'source_rejected');
  const controller = new AbortController();
  const relay = () => controller.abort();
  signal?.addEventListener('abort', relay, { once: true });
  const timer = setTimeout(relay, timeoutMs);
  let reader;
  try {
    // Reject all redirects: no redirect can silently reach a private host or leak a referrer.
    const response = await abortable(fetchImpl(url.href, {
      method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error',
      referrerPolicy: 'no-referrer', signal: controller.signal
    }), controller.signal);
    if (!response.ok || response.redirected || !response.body) throw new AcquisitionError(uploadMessage);
    if (response.url && isPrivateOrLocalHostname(new URL(response.url).hostname)) throw new AcquisitionError(uploadMessage);
    if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new AcquisitionError('Image exceeds the 8 MB limit. Upload a smaller original file.', 'size_limit_exceeded');
    reader = response.body.getReader();
    const parts = [];
    let size = 0;
    while (true) {
      const { done, value } = await abortable(reader.read(), controller.signal);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new AcquisitionError('Image exceeds the 8 MB limit. Upload a smaller original file.', 'size_limit_exceeded');
      parts.push(value);
    }
    if (!size) throw new AcquisitionError(uploadMessage);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    return { bytes, mimeType: (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() };
  } catch (error) {
    controller.abort();
    if (error instanceof AcquisitionError) throw error;
    throw new AcquisitionError(uploadMessage);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', relay);
    if (reader) { void reader.cancel().catch(() => {}); }
  }
}
