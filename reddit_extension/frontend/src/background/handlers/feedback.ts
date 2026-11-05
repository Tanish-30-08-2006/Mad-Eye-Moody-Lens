/**
 * background/handlers/feedback.ts – Sends a thumbs up/down to the backend (cache key and labels only).
 */

import { sendFeedback } from '../../core/api-client';
import { getConsent } from '../../core/consent';
import type { ExtensionResponse, SendFeedbackRequest } from '../../core/messaging';
import { ScanError, toFriendlyError } from '../errors';

export async function handleFeedback(request: SendFeedbackRequest): Promise<ExtensionResponse> {
  try {
    // Consent for sending data to the backend also covers feedback.
    if (!(await getConsent())) throw new ScanError('', 'CONSENT_REQUIRED');
    await sendFeedback(request.payload);
    return { type: 'OK' };
  } catch (err) {
    const f = toFriendlyError(err);
    return { type: 'ERROR', error: f.message, code: f.code };
  }
}
