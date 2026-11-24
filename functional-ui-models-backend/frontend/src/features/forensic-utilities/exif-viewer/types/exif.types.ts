/**
 * EXIF and metadata type definitions for the Image Metadata & EXIF Viewer.
 */

export interface RawExifTags {
  Make?: string;
  Model?: string;
  LensMake?: string;
  LensModel?: string;
  Software?: string;
  ProcessingSoftware?: string;
  Artist?: string;
  Copyright?: string;
  ImageDescription?: string;
  UserComment?: string;
  
  // Exposure & Optics
  ExposureTime?: number;
  FNumber?: number;
  ApertureValue?: number;
  ISO?: number;
  ISOSpeedRatings?: number;
  PhotographicSensitivity?: number;
  FocalLength?: number;
  FocalLengthIn35mmFormat?: number;
  Flash?: number | string;
  WhiteBalance?: number | string;
  MeteringMode?: number | string;
  ExposureProgram?: number | string;
  ExposureMode?: number | string;
  ExposureBiasValue?: number;
  ColorSpace?: number | string;
  
  // Dimensions & Orientation
  ImageWidth?: number;
  ImageHeight?: number;
  ExifImageWidth?: number;
  ExifImageHeight?: number;
  Orientation?: number | string;
  BitsPerSample?: number | number[];
  
  // Timestamps
  DateTimeOriginal?: Date | string;
  CreateDate?: Date | string;
  DateTimeDigitized?: Date | string;
  ModifyDate?: Date | string;
  DateTime?: Date | string;
  SubSecTimeOriginal?: string;
  OffsetTime?: string;
  OffsetTimeOriginal?: string;
  OffsetTimeDigitized?: string;
  
  // GPS
  latitude?: number;
  longitude?: number;
  GPSLatitude?: number[] | [number, number, number] | number;
  GPSLatitudeRef?: string;
  GPSLongitude?: number[] | [number, number, number] | number;
  GPSLongitudeRef?: string;
  GPSAltitude?: number;
  GPSAltitudeRef?: number | string;
  GPSDateStamp?: string;
  GPSTimeStamp?: number[] | string;
  GPSProcessingMethod?: string;
  GPSImgDirection?: number;
  GPSImgDirectionRef?: string;

  // Catch-all for extra tags
  [key: string]: unknown;
}

export type SupportedImageFormat = "JPEG" | "PNG" | "WEBP" | "TIFF" | "UNKNOWN";
