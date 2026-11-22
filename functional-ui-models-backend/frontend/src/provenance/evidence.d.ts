import type { OriginResult } from './engine';
export const EVIDENCE_LABELS: readonly string[];
export function evidenceIndex(result: OriginResult): number | null;
export function absenceExplanation(result: OriginResult): string | null;
export function makerLinks(result: OriginResult): { label: string; url: string; family: string }[];
