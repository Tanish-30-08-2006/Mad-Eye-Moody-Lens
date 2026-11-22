import type { OriginResult } from './engine';
export const STATUS_LABELS: Record<string, string>;
export function makeResult(status: string): OriginResult;
export function unavailableResult(code?: string): OriginResult;
