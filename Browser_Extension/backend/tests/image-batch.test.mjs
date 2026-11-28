import assert from "node:assert/strict";
import test from "node:test";
import {
  BATCH_IMAGE_LIMIT,
  BATCH_IMAGE_MAX_BYTES,
  checkImageProvider,
  createImageBatch,
  formatBatchCsv,
} from "../../frontend/image-batch.mjs";

const provider = { id: "bitmind", label: "BitMind Oracle" };
const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const image = (name, bytes = png) => new File([bytes], name);
const reply = (response = {}, cached = false) => ({
  ok: true,
  cached,
  response: { isAI: false, confidence: 0.89, providerName: "Test detector", model: "Test model", ...response },
});

function makeBatch(overrides = {}) {
  const calls = [];
  const batch = createImageBatch({
    checkProvider: async () => {},
    analyzeFile: async (file, mime, id) => {
      calls.push({ name: file.name, mime, id });
      return reply();
    },
    ...overrides,
  });
  return { batch, calls };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("intake is local, capped at 20 entries, and keeps files with the same name distinct", () => {
  const { batch, calls } = makeBatch();
  const files = Array.from({ length: BATCH_IMAGE_LIMIT + 2 }, () => image("same-name.png"));
  assert.deepEqual(batch.add(files), { added: BATCH_IMAGE_LIMIT, omitted: 2 });
  const { rows } = batch.snapshot();
  assert.equal(new Set(rows.map(row => row.id)).size, BATCH_IMAGE_LIMIT);
  assert.ok(rows.every(row => row.name === "same-name.png" && row.status === "queued"));
  assert.deepEqual(calls, []);

  assert.equal(batch.remove(rows[0].id), true);
  assert.equal(batch.remove(rows[0].id), false);
  assert.deepEqual(batch.add([image("replacement.png")]), { added: 1, omitted: 0 });
  assert.equal(batch.snapshot().rows.at(-1).name, "replacement.png");
  assert.equal(batch.clear(), true);
  assert.deepEqual(batch.snapshot(), { busy: false, progress: null, rows: [] });
});

test("empty, oversized, and unsupported files are skipped before the detector request", async () => {
  const { batch, calls } = makeBatch();
  batch.add([
    image("empty.png", ""),
    { name: "oversized.png", size: BATCH_IMAGE_MAX_BYTES + 1 },
    image("renamed.png", "plain text"),
    image("image.jpeg", Uint8Array.of(0xff, 0xd8, 0xff)),
    image("photo.unknown", png),
    image("animated.gif", "GIF89a"),
    image("another.gif", "GIF87a"),
    image("web.webp", "RIFF\0\0\0\0WEBP"),
  ]);
  assert.deepEqual(calls, []);
  assert.deepEqual(batch.snapshot().rows.slice(0, 2).map(row => row.status), ["invalid", "invalid"]);

  await batch.run(provider);
  assert.deepEqual(calls.map(call => call.mime), [
    "image/jpeg", "image/png", "image/gif", "image/gif", "image/webp",
  ]);
  const { rows, progress } = batch.snapshot();
  assert.deepEqual(rows.map(row => row.status), [
    "invalid", "invalid", "invalid", "complete", "complete", "complete", "complete", "complete",
  ]);
  assert.match(rows[2].error, /Choose a JPEG/);
  assert.equal(rows[2].provider, "");
  assert.equal(progress.processed, 6);
});

test("checks readiness for the requested provider and preserves the queue when setup is required", async () => {
  const messages = [];
  let state = "invalid";
  const send = async message => {
    messages.push(message);
    return { bitmindReadiness: { state: "verified" }, zeroTrueReadiness: { state } };
  };
  const { batch, calls } = makeBatch({ checkProvider: id => checkImageProvider(send, id) });
  const zeroTrue = { id: "zerotrue", label: "ZeroTrue Cloud AI" };
  batch.add([image("sample.png")]);
  await batch.run(zeroTrue);
  assert.deepEqual(messages, [{ type: "GET_PUBLIC_STATUS" }]);
  assert.deepEqual(calls, []);
  assert.equal(batch.snapshot().rows[0].status, "queued");
  assert.equal(batch.snapshot().busy, false);
  assert.match(batch.snapshot().progress.error, /under Settings/);

  state = "unverified";
  await batch.run(zeroTrue);
  assert.deepEqual(calls.map(call => call.id), ["zerotrue"]);
  assert.equal(batch.snapshot().rows[0].status, "complete");
  await assert.rejects(checkImageProvider(async () => ({ error: "Unavailable" }), "bitmind"), /Could not check/);
});

test("a local file read failure leaves the following images available for analysis", async () => {
  const { batch, calls } = makeBatch();
  const unreadable = {
    name: "moved.png",
    size: 64,
    slice() { throw new Error("The local image could not be read."); },
  };
  batch.add([unreadable, image("available.png")]);
  await batch.run(provider);

  const { rows, progress } = batch.snapshot();
  assert.equal(rows[0].status, "failed");
  assert.match(rows[0].error, /could not be read/);
  assert.equal(rows[0].provider, "");
  assert.equal(rows[1].status, "complete");
  assert.deepEqual(calls.map(call => call.name), ["available.png"]);
  assert.equal(progress.processed, 2);
});

test("stopping during provider setup leaves files queued and sends zero images", async () => {
  const gate = deferred();
  const { batch, calls } = makeBatch({ checkProvider: () => gate.promise });
  batch.add([image("sample.png")]);

  const running = batch.run(provider);
  assert.equal(batch.snapshot().progress.phase, "checking");
  assert.equal(batch.stop(), true);
  gate.resolve();
  await running;

  assert.equal(batch.snapshot().progress.phase, "stopped");
  assert.equal(batch.snapshot().rows[0].status, "queued");
  assert.deepEqual(calls, []);
});

test("scans sequentially, finishes the current image on stop, and can resume", async () => {
  const firstStarted = deferred();
  const finishFirst = deferred();
  const calls = [];
  const { batch } = makeBatch({
    async analyzeFile(file) {
      calls.push(file.name);
      if (file.name === "first.png") {
        firstStarted.resolve();
        await finishFirst.promise;
      }
      return reply();
    },
  });
  batch.add([image("first.png"), image("next.png")]);

  const running = batch.run(provider);
  await firstStarted.promise;
  assert.deepEqual(calls, ["first.png"]);
  assert.equal(batch.snapshot().rows[0].status, "scanning");
  assert.equal(await batch.run(provider), false);
  assert.equal(batch.remove(batch.snapshot().rows[1].id), false);
  assert.deepEqual(batch.add([image("extra.png")]), { added: 0, omitted: 1 });
  assert.equal(batch.clear(), false);
  assert.equal(batch.stop(), true);
  assert.equal(batch.stop(), false);
  finishFirst.resolve();
  await running;

  assert.deepEqual(batch.snapshot().rows.map(row => row.status), ["complete", "queued"]);
  assert.equal(batch.snapshot().progress.processed, 1);
  assert.equal(batch.snapshot().progress.phase, "stopped");
  await batch.run(provider);
  assert.deepEqual(calls, ["first.png", "next.png"]);
  assert.equal(batch.snapshot().progress.phase, "finished");
});

test("captures the selected provider for a run and retries only failed files", async () => {
  const calls = [];
  const selection = { ...provider };
  const { batch } = makeBatch({
    async analyzeFile(file, _mime, id) {
      calls.push([file.name, id]);
      if (id === "bitmind" && file.name === "busy.png") {
        selection.id = "zerotrue";
        selection.label = "ZeroTrue Cloud AI";
        return { ok: false, error: "Provider busy" };
      }
      if (id === "bitmind" && file.name === "offline.png") throw new Error("Service worker unavailable");
      return reply();
    },
  });
  batch.add([image("busy.png"), image("offline.png"), image("good.png"), image("fake.png", "text")]);
  await batch.run(selection);
  assert.deepEqual(calls, [["busy.png", "bitmind"], ["offline.png", "bitmind"], ["good.png", "bitmind"]]);
  assert.deepEqual(batch.snapshot().rows.map(row => row.status), ["failed", "failed", "complete", "invalid"]);
  assert.equal(batch.snapshot().rows[0].error, "Provider busy");
  assert.equal(batch.snapshot().rows[1].error, "Service worker unavailable");

  batch.add([image("still-queued.png")]);
  await batch.run(selection, "failed");
  assert.deepEqual(calls.slice(3), [["busy.png", "zerotrue"], ["offline.png", "zerotrue"]]);
  assert.deepEqual(batch.snapshot().rows.map(row => row.status), ["complete", "complete", "complete", "invalid", "queued"]);
});

test("saved row summaries preserve confidence and verdicts and exclude raw provider payloads", async () => {
  const responses = [
    reply({ isAI: true, confidence: 0, rawResponse: { token: "fixture-secret" } }, true),
    reply({ isAI: true, confidence: "87", verdict: "uncertain" }),
    reply({ isAI: null, confidence: null }),
    reply({ isAI: true, confidence: 4e10 }),
    { ok: true },
  ];
  const { batch } = makeBatch({ analyzeFile: async () => responses.shift() });
  batch.add(Array.from({ length: responses.length }, (_, index) => image("file-" + index + ".png")));
  await batch.run(provider);
  const { rows } = batch.snapshot();

  assert.deepEqual(rows.slice(0, 4).map(row => [row.result.verdict, row.result.confidence]), [
    ["Uncertain", 0], ["Uncertain", 87], ["Inconclusive", null], ["Likely AI-generated", null],
  ]);
  assert.equal(rows[0].result.cached, true);
  assert.equal(rows.at(-1).status, "failed");
  assert.ok(rows.every(row => !Object.hasOwn(row, "file")));
  assert.doesNotMatch(JSON.stringify(rows), /fixture-secret|rawResponse/);

  rows[0].result.verdict = "Modified snapshot";
  assert.equal(batch.snapshot().rows[0].result.verdict, "Uncertain");
});

test("CSV keeps per-file outcomes, quotes fields, and makes formula-like values inert", () => {
  const csv = formatBatchCsv([
    {
      name: '=SUM(1,2).png',
      status: "complete",
      result: { verdict: "Uncertain", confidence: 0, provider: " @Remote", model: 'Model "A"', cached: false },
    },
    { name: "new\nline.png", status: "failed", provider: "BitMind", error: "private payload" },
    { name: "image.png", status: "queued" },
  ]);
  assert.equal(csv, [
    '"File","Status","Verdict","Confidence (%)","Provider","Model","Cached"',
    "\"'=SUM(1,2).png\",\"complete\",\"Uncertain\",\"0.0\",\"' @Remote\",\"Model \"\"A\"\"\",\"no\"",
    '"new\nline.png","failed","","","BitMind","",""',
    '"image.png","queued","","","","",""',
    "",
  ].join("\r\n"));
  assert.doesNotMatch(csv, /private payload/);
});
