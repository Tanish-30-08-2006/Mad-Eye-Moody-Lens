/**
 * background/handlers/commands.ts – Keyboard shortcut: scan the post nearest the middle of the screen.
 */

import { createLogger } from '../../core/logger';

const log = createLogger('commands');

export const SCAN_NEAREST_COMMAND = 'scan-nearest';

/** Forwards the shortcut to the page's content script; the page does the rest through the normal scan path. */
export async function handleCommand(command: string, tab?: chrome.tabs.Tab): Promise<void> {
  if (command !== SCAN_NEAREST_COMMAND || tab?.id === undefined) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_NEAREST' });
  } catch {
    log.debug('No Moody Lens content script on this tab; shortcut ignored.');
  }
}
