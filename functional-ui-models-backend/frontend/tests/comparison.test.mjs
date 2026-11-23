import test from "node:test";
import assert from "node:assert/strict";
import { compareHashStrings } from "../src/features/forensic-utilities/sha256/utils/hash-validation.ts";

const HASH_A = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const HASH_B = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

test("Comparison: identical hashes match", () => {
  const res = compareHashStrings(HASH_A, HASH_A);
  assert.equal(res.valid, true);
  assert.equal(res.match, true);
  assert.equal(res.normalizedA, HASH_A);
  assert.equal(res.normalizedB, HASH_A);
});

test("Comparison: case-insensitive match (uppercase vs lowercase)", () => {
  const res = compareHashStrings(HASH_A.toUpperCase(), HASH_A.toLowerCase());
  assert.equal(res.valid, true);
  assert.equal(res.match, true);
});

test("Comparison: ignores surrounding whitespace and 0x prefix", () => {
  const res = compareHashStrings("  0x" + HASH_A + "  ", "\n" + HASH_A + " \t");
  assert.equal(res.valid, true);
  assert.equal(res.match, true);
});

test("Comparison: different hashes report non-match", () => {
  const res = compareHashStrings(HASH_A, HASH_B);
  assert.equal(res.valid, true);
  assert.equal(res.match, false);
});

test("Comparison: invalid hash A returns valid=false with specific error", () => {
  const res = compareHashStrings("not-a-valid-hash", HASH_B);
  assert.equal(res.valid, false);
  assert.equal(res.match, false);
  assert.match(res.error, /Hash A/i);
});

test("Comparison: invalid hash B returns valid=false with specific error", () => {
  const res = compareHashStrings(HASH_A, "12345");
  assert.equal(res.valid, false);
  assert.equal(res.match, false);
  assert.match(res.error, /Hash B/i);
});

test("Comparison: empty inputs return validation error", () => {
  const res = compareHashStrings("", HASH_B);
  assert.equal(res.valid, false);
  assert.match(res.error, /Hash A cannot be empty/i);
});
