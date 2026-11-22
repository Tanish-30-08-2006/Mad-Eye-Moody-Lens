export interface OriginResult {
  status: string; message: string; signatureStatus: string; signerTrust: string;
  diagnosticCode?: string | null;
  reasonCode?: string | null; reason?: string | null; signer?: string | null;
  claimGenerator?: string | null; claimedSigningTime?: string | null; claimedDigitalSourceType?: string | null;
  aiDeclaration: string; actions: { code?: string; label: string }[]; ingredientCount: number;
  metadataHints: { label: string; value: string; family?: string | null; declared?: boolean; unsigned?: boolean }[];
  metadataInspected: boolean; remoteManifestNotFetched: boolean; reasons: string[];
  format?: string | null; reencodedPlatform?: string | null; actionsTruncated?: boolean;
}
export interface SelectionState { file: File | null; checking: boolean; result: OriginResult | null; }
export function checkFile(file: File, options?: { signal?: AbortSignal }): Promise<OriginResult>;
export function createSelectionRunner(check: typeof checkFile, emit: (state: SelectionState) => void): { run(file: File | null): Promise<void>; dispose(): void };
