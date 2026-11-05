/**
 * core/scan-meta.ts – Extension-side facts about a scan that the backend job does not carry (provenance hints, notes).
 */

export type HintKind = 'c2pa' | 'ai_metadata' | 'png_text' | 'tool_name';

/** A metadata observation found in the fetched bytes. Never proof; Reddit often strips metadata. */
export interface ProvenanceHint {
  kind: HintKind;
  text: string;
}

export interface ScanMeta {
  /** The video had (or may have had) sound that could not be fetched, so only the picture was scanned. */
  audioNotScanned?: boolean;
  /** Provenance hints from the media bytes; an empty array means "looked, found none". */
  hints?: ProvenanceHint[];
  /** Nothing was uploaded; only local metadata hints were computed. */
  localOnly?: boolean;
  /** The verdict came from the backend's cache by media hash, so nothing was uploaded. */
  fromHashCache?: boolean;
  /** Gallery: images that could not be downloaded and were left out. */
  galleryMissing?: number;
}
