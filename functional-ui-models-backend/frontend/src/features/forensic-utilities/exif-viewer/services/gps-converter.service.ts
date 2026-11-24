/**
 * GPS coordinate conversion and validation service for forensic image metadata.
 * Converts Degrees/Minutes/Seconds or decimal representations to standardized coordinates.
 */

export interface GpsCoordinates {
  latitude: number; // Decimal degrees, -90 to +90
  longitude: number; // Decimal degrees, -180 to +180
  latitudeRef: "N" | "S";
  longitudeRef: "E" | "W";
  altitude: number | null;
  altitudeRef: string | null;
  humanReadable: string; // e.g. "37° 46' 29.64\" N, 122° 25' 9.84\" W"
  googleMapsUrl: string;
  openStreetMapUrl: string;
  dateStamp?: string;
  timeStamp?: string;
  processingMethod?: string;
  direction?: number;
  directionRef?: string;
}

export interface GpsConversionResult {
  valid: boolean;
  coordinates: GpsCoordinates | null;
  error?: string;
}

/**
 * Resolves a coordinate value that may be a raw number or a rational pair [numerator, denominator].
 */
export function resolveCoordinateComponent(val: unknown): number | null {
  if (typeof val === "number") {
    return isFinite(val) ? val : null;
  }
  if (Array.isArray(val) && val.length === 2) {
    const [num, den] = val;
    if (typeof num === "number" && typeof den === "number" && den !== 0) {
      const res = num / den;
      return isFinite(res) ? res : null;
    }
  }
  return null;
}

/**
 * Converts Degrees, Minutes, Seconds to Decimal Degrees:
 * Decimal = Degrees + (Minutes / 60) + (Seconds / 3600)
 */
export function dmsToDecimal(
  degrees: number,
  minutes: number,
  seconds: number,
  ref: "N" | "S" | "E" | "W"
): number | null {
  if (!isFinite(degrees) || !isFinite(minutes) || !isFinite(seconds)) {
    return null;
  }
  if (degrees < 0 || minutes < 0 || seconds < 0) {
    return null;
  }
  if (minutes >= 60 || seconds >= 60) {
    return null;
  }

  let decimal = degrees + minutes / 60 + seconds / 3600;

  if (ref === "S" || ref === "W") {
    decimal = -decimal;
  } else if (ref !== "N" && ref !== "E") {
    return null;
  }

  return Number(decimal.toFixed(7));
}

/**
 * Formats decimal degrees into human-readable DMS notation.
 */
export function formatDms(decimal: number, isLatitude: boolean): string {
  const abs = Math.abs(decimal);
  const degrees = Math.floor(abs);
  const minutesFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Number(((minutesFloat - minutes) * 60).toFixed(2));

  let ref = "";
  if (isLatitude) {
    ref = decimal >= 0 ? "N" : "S";
  } else {
    ref = decimal >= 0 ? "E" : "W";
  }

  return `${degrees}° ${minutes}' ${seconds.toFixed(2)}" ${ref}`;
}

/**
 * Extracts, validates, and normalizes raw GPS tags from EXIF into structured GpsCoordinates.
 */
export function parseAndValidateGps(rawGps: {
  latitude?: number;
  longitude?: number;
  GPSLatitude?: unknown;
  GPSLatitudeRef?: string;
  GPSLongitude?: unknown;
  GPSLongitudeRef?: string;
  GPSAltitude?: unknown;
  GPSAltitudeRef?: unknown;
  GPSDateStamp?: string;
  GPSTimeStamp?: unknown;
  GPSProcessingMethod?: string;
  GPSImgDirection?: number;
  GPSImgDirectionRef?: string;
}): GpsConversionResult {
  if (!rawGps) {
    return { valid: false, coordinates: null, error: "No GPS metadata provided." };
  }

  // 1. Determine Latitude
  let latDecimal: number | null = null;
  let latRef: "N" | "S" | null = null;

  const rawLatRef = (rawGps.GPSLatitudeRef || "").toString().trim().toUpperCase();
  if (rawLatRef === "N" || rawLatRef === "S") {
    latRef = rawLatRef as "N" | "S";
  }

  if (Array.isArray(rawGps.GPSLatitude) && rawGps.GPSLatitude.length >= 3) {
    const d = resolveCoordinateComponent(rawGps.GPSLatitude[0]);
    const m = resolveCoordinateComponent(rawGps.GPSLatitude[1]);
    const s = resolveCoordinateComponent(rawGps.GPSLatitude[2]);
    if (d !== null && m !== null && s !== null && latRef !== null) {
      latDecimal = dmsToDecimal(d, m, s, latRef);
    }
  } else if (typeof rawGps.latitude === "number" && isFinite(rawGps.latitude)) {
    latDecimal = Number(rawGps.latitude.toFixed(7));
    if (!latRef) {
      latRef = latDecimal >= 0 ? "N" : "S";
    }
  } else if (typeof rawGps.GPSLatitude === "number" && isFinite(rawGps.GPSLatitude)) {
    const absLat = Math.abs(rawGps.GPSLatitude);
    if (latRef === "S") {
      latDecimal = -absLat;
    } else {
      latDecimal = absLat;
      if (!latRef) latRef = "N";
    }
  }

  // 2. Determine Longitude
  let lonDecimal: number | null = null;
  let lonRef: "E" | "W" | null = null;

  const rawLonRef = (rawGps.GPSLongitudeRef || "").toString().trim().toUpperCase();
  if (rawLonRef === "E" || rawLonRef === "W") {
    lonRef = rawLonRef as "E" | "W";
  }

  if (Array.isArray(rawGps.GPSLongitude) && rawGps.GPSLongitude.length >= 3) {
    const d = resolveCoordinateComponent(rawGps.GPSLongitude[0]);
    const m = resolveCoordinateComponent(rawGps.GPSLongitude[1]);
    const s = resolveCoordinateComponent(rawGps.GPSLongitude[2]);
    if (d !== null && m !== null && s !== null && lonRef !== null) {
      lonDecimal = dmsToDecimal(d, m, s, lonRef);
    }
  } else if (typeof rawGps.longitude === "number" && isFinite(rawGps.longitude)) {
    lonDecimal = Number(rawGps.longitude.toFixed(7));
    if (!lonRef) {
      lonRef = lonDecimal >= 0 ? "E" : "W";
    }
  } else if (typeof rawGps.GPSLongitude === "number" && isFinite(rawGps.GPSLongitude)) {
    const absLon = Math.abs(rawGps.GPSLongitude);
    if (lonRef === "W") {
      lonDecimal = -absLon;
    } else {
      lonDecimal = absLon;
      if (!lonRef) lonRef = "E";
    }
  }

  // Strict Validation: Both latitude and longitude must be present and valid
  if (latDecimal === null || lonDecimal === null || latRef === null || lonRef === null) {
    return {
      valid: false,
      coordinates: null,
      error: "Incomplete or malformed GPS coordinates in metadata.",
    };
  }

  // Range validation
  if (latDecimal < -90 || latDecimal > 90) {
    return {
      valid: false,
      coordinates: null,
      error: `Latitude out of range (-90 to +90): ${latDecimal}`,
    };
  }
  if (lonDecimal < -180 || lonDecimal > 180) {
    return {
      valid: false,
      coordinates: null,
      error: `Longitude out of range (-180 to +180): ${lonDecimal}`,
    };
  }

  // Altitude
  let altitude: number | null = null;
  if (typeof rawGps.GPSAltitude === "number" && isFinite(rawGps.GPSAltitude)) {
    altitude = Number(rawGps.GPSAltitude.toFixed(2));
    const altRef = rawGps.GPSAltitudeRef;
    if (altRef === 1 || altRef === "1" || altRef === "below-sea-level") {
      altitude = -Math.abs(altitude);
    }
  }

  // Format strings
  const latStr = formatDms(latDecimal, true);
  const lonStr = formatDms(lonDecimal, false);
  const humanReadable = `${latStr}, ${lonStr}`;

  // Safe external map links without leaking user or image data
  const googleMapsUrl = `https://www.google.com/maps?q=${latDecimal},${lonDecimal}`;
  const openStreetMapUrl = `https://www.openstreetmap.org/?mlat=${latDecimal}&mlon=${lonDecimal}#map=16/${latDecimal}/${lonDecimal}`;

  const coords: GpsCoordinates = {
    latitude: latDecimal,
    longitude: lonDecimal,
    latitudeRef: latRef,
    longitudeRef: lonRef,
    altitude,
    altitudeRef: rawGps.GPSAltitudeRef ? String(rawGps.GPSAltitudeRef) : null,
    humanReadable,
    googleMapsUrl,
    openStreetMapUrl,
    dateStamp: rawGps.GPSDateStamp,
    timeStamp: Array.isArray(rawGps.GPSTimeStamp) ? rawGps.GPSTimeStamp.join(":") : (rawGps.GPSTimeStamp ? String(rawGps.GPSTimeStamp) : undefined),
    processingMethod: rawGps.GPSProcessingMethod,
    direction: typeof rawGps.GPSImgDirection === "number" ? Number(rawGps.GPSImgDirection.toFixed(1)) : undefined,
    directionRef: rawGps.GPSImgDirectionRef,
  };

  return {
    valid: true,
    coordinates: coords,
  };
}
