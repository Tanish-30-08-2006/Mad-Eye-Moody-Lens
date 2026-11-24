import test from "node:test";
import assert from "node:assert/strict";
import {
  dmsToDecimal,
  formatDms,
  parseAndValidateGps,
  resolveCoordinateComponent,
} from "../src/features/forensic-utilities/exif-viewer/services/gps-converter.service.ts";

test("GPS Conversion: resolveCoordinateComponent resolves numbers and rationals", () => {
  assert.equal(resolveCoordinateComponent(42), 42);
  assert.equal(resolveCoordinateComponent([37, 1]), 37);
  assert.equal(resolveCoordinateComponent([150, 10]), 15);
  assert.equal(resolveCoordinateComponent([1, 0]), null); // divide by zero
  assert.equal(resolveCoordinateComponent("invalid"), null);
  assert.equal(resolveCoordinateComponent(null), null);
});

test("GPS Conversion: North latitude produces positive decimal", () => {
  // 37° 46' 30" N = 37 + 46/60 + 30/3600 = 37.775
  const dec = dmsToDecimal(37, 46, 30, "N");
  assert.equal(dec, 37.775);
});

test("GPS Conversion: South latitude produces negative decimal", () => {
  // 33° 51' 54" S = -(33 + 51/60 + 54/3600) = -33.865
  const dec = dmsToDecimal(33, 51, 54, "S");
  assert.equal(dec, -33.865);
});

test("GPS Conversion: East longitude produces positive decimal", () => {
  // 151° 12' 36" E = 151 + 12/60 + 36/3600 = 151.21
  const dec = dmsToDecimal(151, 12, 36, "E");
  assert.equal(dec, 151.21);
});

test("GPS Conversion: West longitude produces negative decimal", () => {
  // 122° 25' 12" W = -(122 + 25/60 + 12/3600) = -122.42
  const dec = dmsToDecimal(122, 25, 12, "W");
  assert.equal(dec, -122.42);
});

test("GPS Conversion: rejects invalid minute and second ranges", () => {
  assert.equal(dmsToDecimal(37, 60, 10, "N"), null); // minutes >= 60
  assert.equal(dmsToDecimal(37, 10, 60, "N"), null); // seconds >= 60
  assert.equal(dmsToDecimal(-5, 10, 10, "N"), null); // negative degrees
});

test("GPS Conversion: rejects missing or invalid direction references", () => {
  // @ts-expect-error Testing invalid ref
  assert.equal(dmsToDecimal(37, 46, 30, "X"), null);
  // @ts-expect-error Testing null ref
  assert.equal(dmsToDecimal(37, 46, 30, null), null);
});

test("GPS Formatting: formatDms formats latitude and longitude accurately", () => {
  assert.equal(formatDms(37.775, true), '37° 46\' 30.00" N');
  assert.equal(formatDms(-33.865, true), '33° 51\' 54.00" S');
  assert.equal(formatDms(151.21, false), '151° 12\' 36.00" E');
  assert.equal(formatDms(-122.42, false), '122° 25\' 12.00" W');
});

test("GPS Validation: parseAndValidateGps parses rational DMS arrays and generates map links", () => {
  const rawGps = {
    GPSLatitude: [[37, 1], [46, 1], [2964, 100]],
    GPSLatitudeRef: "N",
    GPSLongitude: [[122, 1], [25, 1], [984, 100]],
    GPSLongitudeRef: "W",
    GPSAltitude: 45.5,
    GPSAltitudeRef: 0,
    GPSDateStamp: "2026:10:15",
  };

  const res = parseAndValidateGps(rawGps);
  assert.equal(res.valid, true);
  assert.ok(res.coordinates);
  assert.equal(res.coordinates.latitudeRef, "N");
  assert.equal(res.coordinates.longitudeRef, "W");
  assert.equal(res.coordinates.latitude, 37.7749);
  assert.equal(res.coordinates.longitude, -122.4194);
  assert.equal(res.coordinates.altitude, 45.5);
  assert.ok(res.coordinates.googleMapsUrl.includes("37.7749,-122.4194"));
  assert.ok(res.coordinates.openStreetMapUrl.includes("mlat=37.7749&mlon=-122.4194"));
});

test("GPS Validation: parseAndValidateGps parses pre-computed decimal coordinates", () => {
  const rawGps = {
    latitude: -33.8688,
    longitude: 151.2093,
    GPSLatitudeRef: "S",
    GPSLongitudeRef: "E",
  };

  const res = parseAndValidateGps(rawGps);
  assert.equal(res.valid, true);
  assert.ok(res.coordinates);
  assert.equal(res.coordinates.latitude, -33.8688);
  assert.equal(res.coordinates.longitude, 151.2093);
  assert.equal(res.coordinates.latitudeRef, "S");
  assert.equal(res.coordinates.longitudeRef, "E");
});

test("GPS Validation: rejects out-of-bounds latitude and longitude", () => {
  const outOfBoundsLat = parseAndValidateGps({
    latitude: 95.5,
    longitude: 40.0,
    GPSLatitudeRef: "N",
    GPSLongitudeRef: "E",
  });
  assert.equal(outOfBoundsLat.valid, false);
  assert.match(outOfBoundsLat.error || "", /Latitude out of range/i);

  const outOfBoundsLon = parseAndValidateGps({
    latitude: 40.0,
    longitude: -185.0,
    GPSLatitudeRef: "N",
    GPSLongitudeRef: "W",
  });
  assert.equal(outOfBoundsLon.valid, false);
  assert.match(outOfBoundsLon.error || "", /Longitude out of range/i);
});

test("GPS Validation: safely handles zero coordinates with valid refs", () => {
  const zeroGps = parseAndValidateGps({
    latitude: 0,
    longitude: 0,
    GPSLatitudeRef: "N",
    GPSLongitudeRef: "E",
  });
  assert.equal(zeroGps.valid, true);
  assert.equal(zeroGps.coordinates?.latitude, 0);
  assert.equal(zeroGps.coordinates?.longitude, 0);
});

test("GPS Validation: handles negative altitude reference (below sea level)", () => {
  const belowSeaLevel = parseAndValidateGps({
    latitude: 31.5,
    longitude: 35.5,
    GPSLatitudeRef: "N",
    GPSLongitudeRef: "E",
    GPSAltitude: 414,
    GPSAltitudeRef: 1, // Below sea level
  });
  assert.equal(belowSeaLevel.valid, true);
  assert.equal(belowSeaLevel.coordinates?.altitude, -414);
});
