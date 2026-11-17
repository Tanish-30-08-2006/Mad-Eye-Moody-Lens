/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_BAND_LOW?: string;
  readonly VITE_BAND_HIGH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
