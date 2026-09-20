import assert from "node:assert/strict";
import test from "node:test";

await import("../src/shared/browser-api.js");
await import("../src/background/constants.js");
await import("../src/background/state.js");

function createStorageArea() {
  const values = new Map();

  return {
    get(key, callback) {
      if (key === null) {
        callback(Object.fromEntries(values));
        return;
      }

      callback(values.has(key) ? { [key]: values.get(key) } : {});
    },
    set(items, callback) {
      for (const [key, value] of Object.entries(items)) {
        values.set(key, value);
      }
      callback();
    },
    remove(keys, callback) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        values.delete(key);
      }
      callback();
    },
    values
  };
}

test("keeps the original page across root and localized password redirects", async () => {
  const storage = createStorageArea();
  const api = { storage: { session: storage } };
  const manager = globalThis.RedirectSourceBannerBackground.createStateManager(api, async () => {});
  const tabId = 7;
  const hostname = "shine-info.myshopify.com";
  const sourceUrl = `https://${hostname}/products/example`;
  const rootPasswordUrl = `https://${hostname}/password`;
  const localizedPasswordUrl = `https://${hostname}/en-cn/password`;

  await manager.rememberNavigationRequest(tabId, {
    url: sourceUrl,
    requestId: "source",
    source: "webNavigation"
  });
  await manager.rememberNavigationRequest(tabId, {
    url: rootPasswordUrl,
    requestId: "root-password",
    source: "webNavigation"
  });
  await manager.rememberNavigationRequest(tabId, {
    url: localizedPasswordUrl,
    requestId: "localized-password",
    source: "webNavigation"
  });

  const storageKey = globalThis.RedirectSourceBannerBackground.tabStateKey(hostname, tabId);
  assert.deepEqual(
    storage.values.get(storageKey).tracked.requests.map((request) => request.url),
    [sourceUrl]
  );

  await manager.rememberCommittedRedirect({
    tabId,
    frameId: 0,
    url: localizedPasswordUrl,
    transitionQualifiers: ["server_redirect"]
  });

  const display = await manager.getDisplayForTab(tabId, localizedPasswordUrl);
  assert.equal(display.fromUrl, sourceUrl);
});
