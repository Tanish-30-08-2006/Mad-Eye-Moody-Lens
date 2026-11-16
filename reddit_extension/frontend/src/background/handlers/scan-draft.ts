import { submitDetection } from '../../core/api-client';
import { getConsent } from '../../core/consent';
import { draftMime, MAX_DRAFT_BYTES } from '../../core/draft-media';
import type { ExtensionMessage, ExtensionResponse } from '../../core/messaging';
import { loadSettings } from '../../core/settings';
import { toFriendlyError } from '../errors';
import { pollJobUntilComplete } from '../job-poller';
import { startKeepalive, stopKeepalive } from '../keepalive';
import { scanQueue } from '../scan-queue';

type Upload = Extract<ExtensionMessage, { type: 'SCAN_DRAFT' }>['payload'];

export async function scanDraft({ mime, base64, apiUrl }: Upload): Promise<ExtensionResponse> {
  const gated = async () => {
    const settings = await loadSettings();
    if (settings.localOnly || settings.apiUrl !== apiUrl) {
      return { type: 'ERROR', error: 'Upload settings changed or Local only is enabled. No attachment was sent.' } as const;
    }
    if (!(await getConsent())) return { type: 'ERROR', code: 'CONSENT_REQUIRED', error: 'Allow media uploads to scan this attachment.' } as const;
    return null;
  };
  const mediaType = draftMime(mime);
  if (!mediaType) return { type: 'ERROR', error: 'This file type cannot be scanned.' };
  try {
    const blocked = await gated();
    if (blocked) return blocked;
    return await scanQueue.run('draft:' + crypto.randomUUID(), async () => {
      const changed = await gated();
      if (changed) return changed;
      const decoded = atob(base64);
      const bytes = new Uint8Array(decoded.length);
      for (let i = 0; i < bytes.length; i++) bytes[i] = decoded.charCodeAt(i);
      if (!bytes.length || bytes.length > MAX_DRAFT_BYTES) return { type: 'ERROR', error: 'This attachment exceeds the scan size limit.' };
      const blob = new Blob([bytes], { type: mime });
      startKeepalive();
      try {
        const { job_id } = await submitDetection(blob, undefined, { mediaType }, apiUrl);
        const result = await pollJobUntilComplete(job_id, { mediaType, destination: apiUrl });
        return { type: 'JOB_STATUS', status: result.status, result };
      } finally {
        stopKeepalive();
      }
    });
  } catch (err) {
    const friendly = toFriendlyError(err);
    return { type: 'ERROR', error: friendly.message, code: friendly.code };
  }
}
