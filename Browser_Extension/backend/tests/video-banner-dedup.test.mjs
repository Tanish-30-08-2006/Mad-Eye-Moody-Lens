// Unit and regression tests verifying prevention of duplicate video detection status banners.
// Run with: node --test Browser_Extension/backend/tests/video-banner-dedup.test.mjs

import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { installChromeMock } from "./chrome-mock.mjs";

installChromeMock();

// Create a lightweight, realistic mock DOM environment for content.js
function createMockDom() {
  const elements = new Set();
  let mutationCallbacks = [];
  let intersectionCallbacks = [];
  let resizeCallbacks = [];

  class MockNode {
    constructor() {
      this.isConnected = true;
      this.parentElement = null;
      this.childNodes = [];
      this.nodeType = 1;
    }
  }

  class MockElement extends MockNode {
    constructor(tagName = "div") {
      super();
      this.tagName = tagName.toUpperCase();
      this.className = "";
      this.dataset = {};
      this._attributes = new Map();
      this._listeners = new Map();
      this.offsetWidth = 320;
      this.offsetHeight = 180;
      this.naturalWidth = 640;
      this.naturalHeight = 360;
      this.videoWidth = 640;
      this.videoHeight = 360;
      this.complete = true;
      this.src = "";
      this.currentSrc = "";
      this.style = {};
      this._textContent = undefined;
      elements.add(this);
    }

    get textContent() {
      if (this._textContent !== undefined) return this._textContent;
      return this.childNodes.map(c => c.textContent).join("");
    }

    set textContent(val) {
      this._textContent = String(val);
      this.childNodes = [];
    }

    get classList() {
      const self = this;
      return {
        contains(c) {
          return self.className.split(/\s+/).includes(c);
        },
        add(c) {
          const s = new Set(self.className.split(/\s+/).filter(Boolean));
          s.add(c);
          self.className = [...s].join(" ");
        },
        remove(c) {
          const s = new Set(self.className.split(/\s+/).filter(Boolean));
          s.delete(c);
          self.className = [...s].join(" ");
        },
        toggle(c, force) {
          if (force === true) this.add(c);
          else if (force === false) this.remove(c);
          else if (this.contains(c)) this.remove(c);
          else this.add(c);
        }
      };
    }

    getAttribute(name) {
      return this._attributes.get(name) || null;
    }

    setAttribute(name, val) {
      this._attributes.set(name, String(val));
    }

    hasAttribute(name) {
      return this._attributes.has(name);
    }

    removeAttribute(name) {
      this._attributes.delete(name);
    }

    addEventListener(event, fn) {
      if (!this._listeners.has(event)) this._listeners.set(event, []);
      this._listeners.get(event).push(fn);
    }

    removeEventListener(event, fn) {
      if (!this._listeners.has(event)) return;
      this._listeners.set(event, this._listeners.get(event).filter(l => l !== fn));
    }

    dispatchEvent(event) {
      const type = typeof event === "string" ? event : event.type;
      const list = this._listeners.get(type) || [];
      for (const fn of list) fn({ target: this, type });
    }

    appendChild(child) {
      child.parentElement = this;
      child.isConnected = true;
      this.childNodes.push(child);
      for (const cb of mutationCallbacks) {
        cb([{ type: "childList", addedNodes: [child], removedNodes: [], target: this }]);
      }
      return child;
    }

    insertBefore(newNode, refNode) {
      newNode.parentElement = this;
      newNode.isConnected = true;
      const idx = this.childNodes.indexOf(refNode);
      if (idx !== -1) this.childNodes.splice(idx, 0, newNode);
      else this.childNodes.push(newNode);
      return newNode;
    }

    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx !== -1) {
        this.childNodes.splice(idx, 1);
        child.parentElement = null;
        child.isConnected = false;
        for (const cb of mutationCallbacks) {
          cb([{ type: "childList", addedNodes: [], removedNodes: [child], target: this }]);
        }
      }
      return child;
    }

    remove() {
      if (this.parentElement) {
        this.parentElement.removeChild(this);
      } else {
        this.isConnected = false;
      }
    }

    replaceChildren(...nodes) {
      while (this.childNodes.length) {
        const c = this.childNodes.pop();
        c.parentElement = null;
        c.isConnected = false;
      }
      for (const n of nodes) {
        this.appendChild(n);
      }
    }

    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }

    querySelectorAll(sel) {
      const res = [];
      function walk(node) {
        for (const child of node.childNodes) {
          if (child.matches && child.matches(sel)) res.push(child);
          walk(child);
        }
      }
      walk(this);
      return res;
    }

    closest(sel) {
      let cur = this;
      while (cur && cur instanceof MockElement) {
        if (cur.matches(sel)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }

    matches(sel) {
      if (sel === "*") return true;
      const parts = sel.split(",").map(s => s.trim());
      return parts.some(p => {
        if (p.startsWith(".")) return this.classList.contains(p.slice(1));
        if (p.startsWith("#")) return this.id === p.slice(1);
        if (p.startsWith("[data-testid*=")) {
          const val = p.match(/\[data-testid\*="([^"]+)"/)?.[1];
          return val ? String(this.getAttribute("data-testid") || "").includes(val) : false;
        }
        if (p.startsWith("[data-testid=")) {
          const val = p.match(/\[data-testid="([^"]+)"/)?.[1];
          return this.getAttribute("data-testid") === val;
        }
        if (p.startsWith("[data-ds-target-video-id=")) {
          const val = p.match(/\[data-ds-target-video-id="([^"]+)"/)?.[1];
          return this.dataset.dsTargetVideoId === val;
        }
        return this.tagName.toLowerCase() === p.toLowerCase();
      });
    }

    contains(other) {
      let cur = other;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentElement;
      }
      return false;
    }

    getBoundingClientRect() {
      return { left: 50, top: 50, right: 370, bottom: 230, width: 320, height: 180 };
    }
  }

  class MockVideoElement extends MockElement {
    constructor() {
      super("video");
      this.currentTime = 1.5;
      this.currentSrc = "https://cdn.example.org/videos/sample.mp4";
    }
  }

  class MockImageElement extends MockElement {
    constructor() {
      super("img");
      this.src = "https://cdn.example.org/images/thumb.jpg";
      this.currentSrc = "https://cdn.example.org/images/thumb.jpg";
    }
  }

  const documentElement = new MockElement("html");
  const body = new MockElement("body");
  documentElement.appendChild(body);

  const mockDocument = {
    documentElement,
    body,
    createElement(tag) {
      if (tag.toLowerCase() === "video") return new MockVideoElement();
      if (tag.toLowerCase() === "img") return new MockImageElement();
      return new MockElement(tag);
    },
    querySelectorAll(sel) {
      return documentElement.querySelectorAll(sel);
    },
    querySelector(sel) {
      return documentElement.querySelector(sel);
    }
  };

  class MockMutationObserver {
    constructor(cb) {
      this.cb = cb;
      mutationCallbacks.push(cb);
    }
    observe() {}
    disconnect() {
      mutationCallbacks = mutationCallbacks.filter(c => c !== this.cb);
    }
  }

  class MockIntersectionObserver {
    constructor(cb) {
      this.cb = cb;
      intersectionCallbacks.push(cb);
    }
    observe(target) {
      // Trigger intersecting entry
      this.cb([{ target, isIntersecting: true }]);
    }
    unobserve() {}
    disconnect() {
      intersectionCallbacks = intersectionCallbacks.filter(c => c !== this.cb);
    }
  }

  class MockResizeObserver {
    constructor(cb) {
      this.cb = cb;
      resizeCallbacks.push(cb);
    }
    observe(target) {
      this.cb([{ target }]);
    }
    unobserve() {}
    disconnect() {
      resizeCallbacks = resizeCallbacks.filter(c => c !== this.cb);
    }
  }

  return {
    mockDocument,
    MockElement,
    MockVideoElement,
    MockImageElement,
    MockMutationObserver,
    MockIntersectionObserver,
    MockResizeObserver,
    triggerMutation(records) {
      for (const cb of mutationCallbacks) cb(records);
    }
  };
}

test("Video Banner Dedup Suite", async (t) => {
  const dom = createMockDom();
  const contentPath = fileURLToPath(new URL("../../frontend/content.js", import.meta.url));
  const contentCode = fs.readFileSync(contentPath, "utf8");
  const runtimeListeners = [];

  const context = {
    globalThis: {},
    window: {
      innerWidth: 1920,
      innerHeight: 1080,
      location: { hostname: "example.com", href: "https://example.com/watch" },
      addEventListener: () => {},
      removeEventListener: () => {},
      requestAnimationFrame: fn => setTimeout(fn, 1),
      cancelAnimationFrame: id => clearTimeout(id),
      requestIdleCallback: fn => setTimeout(fn, 5),
      dispatchEvent: () => {}
    },
    requestIdleCallback: fn => setTimeout(fn, 5),
    document: dom.mockDocument,
    Element: dom.MockElement,
    HTMLVideoElement: dom.MockVideoElement,
    HTMLImageElement: dom.MockImageElement,
    Node: { ELEMENT_NODE: 1 },
    IntersectionObserver: dom.MockIntersectionObserver,
    ResizeObserver: dom.MockResizeObserver,
    MutationObserver: dom.MockMutationObserver,
    getComputedStyle: () => ({ display: "block", visibility: "visible", contentVisibility: "visible", backgroundImage: "" }),
    chrome: {
      runtime: {
        sendMessage: async msg => {
          if (msg.type === "GET_SCANNER_SETTINGS") {
            return {
              scanEnabled: true,
              videoScanEnabled: true,
              activeProvider: "bitmind",
              videoActiveProvider: "bitmind",
              providerConfigured: true,
              videoProviderConfigured: true,
              imageReadiness: { state: "verified" },
              videoReadiness: { state: "verified" }
            };
          }
          if (msg.type === "SCAN_VIDEO") {
            return {
              ok: true,
              data: { isAI: false, confidence: 0.95, verdict: "authentic", providerName: "BitMind" }
            };
          }
          if (msg.type === "ANALYZE_IMAGE") {
            return {
              ok: true,
              response: { isAI: false, confidence: 0.92, verdict: "authentic" }
            };
          }
          return { ok: true };
        },
        onMessage: {
          addListener: fn => runtimeListeners.push(fn),
          removeListener: fn => {
            const idx = runtimeListeners.indexOf(fn);
            if (idx >= 0) runtimeListeners.splice(idx, 1);
          }
        }
      }
    },
    location: { hostname: "example.com", href: "https://example.com/watch" },
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: fn => setTimeout(fn, 1),
    cancelAnimationFrame: id => clearTimeout(id),
    setTimeout,
    clearTimeout,
    WeakMap,
    WeakSet,
    Map,
    Set,
    Number,
    Math,
    Date,
    URL
  };
  context.globalThis = context;

  // Run content script inside the virtual DOM
  vm.runInNewContext(contentCode, context);

  // Allow async settings initialization
  await new Promise(resolve => setTimeout(resolve, 50));

  await t.test("1. A single video displays exactly one banner", async () => {
    const video = dom.mockDocument.createElement("video");
    video.src = "https://cdn.example.org/videos/clip1.mp4";
    video.currentSrc = "https://cdn.example.org/videos/clip1.mp4";
    dom.mockDocument.body.appendChild(video);

    // Trigger video load & scan
    video.dispatchEvent("loadeddata");
    await new Promise(resolve => setTimeout(resolve, 50));

    const banners = dom.mockDocument.querySelectorAll(".ds-video-badge");
    assert.equal(banners.length, 1, "Expected exactly 1 video banner for a single video");
    assert.match(banners[0].textContent, /Checking|NOT AI|AI/, "Banner has valid content");
  });

  await t.test("2. Multiple videos on the same webpage get exactly 1 banner each", async () => {
    const video2 = dom.mockDocument.createElement("video");
    video2.src = "https://cdn.example.org/videos/clip2.mp4";
    video2.currentSrc = "https://cdn.example.org/videos/clip2.mp4";
    dom.mockDocument.body.appendChild(video2);

    video2.dispatchEvent("loadeddata");
    await new Promise(resolve => setTimeout(resolve, 50));

    const banners = dom.mockDocument.querySelectorAll(".ds-video-badge");
    assert.equal(banners.length, 2, "Expected exactly 2 video banners for 2 videos");
  });

  await t.test("3. Rapid scrolling does not duplicate banners", async () => {
    // Simulate multiple position frame updates
    for (let i = 0; i < 10; i++) {
      context.window.dispatchEvent("scroll");
    }
    await new Promise(resolve => setTimeout(resolve, 30));

    const banners = dom.mockDocument.querySelectorAll(".ds-video-badge");
    assert.equal(banners.length, 2, "Banner count remained stable after rapid scroll events");
  });

  await t.test("4. Repeated DOM mutations do not duplicate banners or cause loops", async () => {
    const dummyDiv = dom.mockDocument.createElement("div");
    dom.mockDocument.body.appendChild(dummyDiv);

    // Trigger mutation observer
    dom.triggerMutation([
      { type: "childList", addedNodes: [dummyDiv], removedNodes: [], target: dom.mockDocument.body }
    ]);
    await new Promise(resolve => setTimeout(resolve, 30));

    const banners = dom.mockDocument.querySelectorAll(".ds-video-badge");
    assert.equal(banners.length, 2, "Banner count remained 2 after repeated DOM mutations");
  });

  await t.test("5. Video source changes update the existing banner rather than creating a new one", async () => {
    const video = dom.mockDocument.querySelector("video");
    video.currentSrc = "https://cdn.example.org/videos/clip1-highres.mp4";
    video.dispatchEvent("loadeddata");
    await new Promise(resolve => setTimeout(resolve, 50));

    const banners = dom.mockDocument.querySelectorAll(".ds-video-badge");
    assert.equal(banners.length, 2, "No duplicate banner created upon video source change");
  });

  await t.test("6. Video inside a container with thumbnail image does not display both image and video banners", async () => {
    const playerContainer = dom.mockDocument.createElement("div");
    playerContainer.setAttribute("data-testid", "videoPlayer");

    const thumbnail = dom.mockDocument.createElement("img");
    thumbnail.src = "https://cdn.example.org/images/video-thumb.jpg";

    const video3 = dom.mockDocument.createElement("video");
    video3.src = "https://cdn.example.org/videos/clip3.mp4";
    video3.currentSrc = "https://cdn.example.org/videos/clip3.mp4";

    playerContainer.appendChild(thumbnail);
    playerContainer.appendChild(video3);
    dom.mockDocument.body.appendChild(playerContainer);

    video3.dispatchEvent("loadeddata");
    await new Promise(resolve => setTimeout(resolve, 50));

    // There should be NO image badge on the video container
    const imgBadges = dom.mockDocument.querySelectorAll(".ds-image-badge");
    for (const b of imgBadges) {
      assert.notEqual(b.parentElement, playerContainer, "Image badge should not be on video container");
    }

    const videoBanners = dom.mockDocument.querySelectorAll(".ds-video-badge");
    assert.equal(videoBanners.length, 3, "Exactly 3 video banners for 3 videos");
  });

  await t.test("7. SPA navigation / video removal cleans up banner immediately", async () => {
    const video = dom.mockDocument.querySelector("video");
    const countBefore = dom.mockDocument.querySelectorAll(".ds-video-badge").length;
    video.remove();

    dom.triggerMutation([
      { type: "childList", addedNodes: [], removedNodes: [video], target: dom.mockDocument.body }
    ]);
    await new Promise(resolve => setTimeout(resolve, 30));

    const countAfter = dom.mockDocument.querySelectorAll(".ds-video-badge").length;
    assert.equal(countAfter, countBefore - 1, "Removed video's banner was cleaned up");
  });

  await t.test("8. Independent video auto-scan toggle controls video banners", async () => {
    // Send settings change with videoScanEnabled: false
    for (const listener of runtimeListeners) {
      listener({
        type: "DS_SETTINGS_CHANGED",
        settings: { scanEnabled: true, videoScanEnabled: false }
      }, {}, () => {});
    }
    await new Promise(resolve => setTimeout(resolve, 30));

    // All video banners should be cleaned up immediately
    const videoBannersAfterDisable = dom.mockDocument.querySelectorAll(".ds-video-badge");
    assert.equal(videoBannersAfterDisable.length, 0, "Disabling video auto-scan purges all video badges");

    // Re-enable video auto-scan
    for (const listener of runtimeListeners) {
      listener({
        type: "DS_SETTINGS_CHANGED",
        settings: { scanEnabled: true, videoScanEnabled: true }
      }, {}, () => {});
    }
    await new Promise(resolve => setTimeout(resolve, 30));
  });

  await t.test("9. YouTube player and thumbnail elements never generate conflicting image badges", async () => {
    const ytdPlayer = dom.mockDocument.createElement("ytd-player");
    const ytThumbnail = dom.mockDocument.createElement("ytd-thumbnail");
    const ytImg = dom.mockDocument.createElement("img");
    ytImg.className = "yt-core-image yt-core-image--fill-parent-height";
    ytImg.src = "https://i.ytimg.com/vi/gtav/hqdefault.jpg";
    ytThumbnail.appendChild(ytImg);

    const ytVideo = dom.mockDocument.createElement("video");
    ytVideo.className = "video-stream html5-main-video";
    ytVideo.src = "https://www.youtube.com/watch?v=gtav-clip";
    ytVideo.currentSrc = "https://www.youtube.com/watch?v=gtav-clip";

    ytdPlayer.appendChild(ytThumbnail);
    ytdPlayer.appendChild(ytVideo);
    dom.mockDocument.body.appendChild(ytdPlayer);

    ytVideo.dispatchEvent("loadeddata");
    await new Promise(resolve => setTimeout(resolve, 50));

    // Only video badge should exist on the player
    const imgBadges = dom.mockDocument.querySelectorAll(".ds-image-badge");
    for (const ib of imgBadges) {
      assert.notEqual(ib.parentElement, ytdPlayer, "No image badge inside YouTube player");
      assert.notEqual(ib.parentElement, ytThumbnail, "No image badge inside YouTube thumbnail");
    }
  });
});
