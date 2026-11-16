export const MAX_DRAFT_BYTES = 12 * 1024 * 1024;
export const MAX_DRAFT_BASE64 = 4 * Math.ceil(MAX_DRAFT_BYTES / 3);

export function draftMime(mime: string): 'image' | 'video' | 'audio' | null {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(mime)) return 'image';
  if (['video/mp4', 'video/webm', 'video/quicktime'].includes(mime)) return 'video';
  if (['audio/mpeg', 'audio/wav', 'audio/mp4'].includes(mime)) return 'audio';
  return null;
}

// Chromium runtime messages serialize JSON, so send a bounded base64 file without its name.
export function encodeDraft(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string' || !result.includes(',')) reject(new Error('Could not read this file.'));
      else resolve(result.split(',', 2)[1]!);
    };
    reader.onerror = () => reject(new Error('Could not read this file.'));
    reader.readAsDataURL(file);
  });
}
