(function (root) {
  "use strict";

  const namespace = root.RedirectSourceBannerBackground;

  function now() {
    return Date.now();
  }

  function isHttpUrl(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url);
  }

  function parseUrl(url) {
    if (!isHttpUrl(url)) {
      return null;
    }

    try {
      return new URL(url);
    } catch {
      return null;
    }
  }

  function isMyShopifyUrl(url) {
    const parsed = parseUrl(url);
    return Boolean(parsed && /\.myshopify\.com$/i.test(parsed.hostname));
  }

  function isPasswordPageUrl(url) {
    const parsed = parseUrl(url);
    return Boolean(parsed && parsed.pathname === "/password");
  }

  function domainFromUrl(url) {
    const parsed = parseUrl(url);
    return parsed ? parsed.hostname.toLowerCase() : "";
  }

  function storageArea(api) {
    if (api.storage && api.storage.session) {
      return api.storage.session;
    }

    return api.storage && api.storage.local;
  }

  function callStorage(api, method, ...args) {
    const area = storageArea(api);
    if (!area || typeof area[method] !== "function") {
      return Promise.resolve(undefined);
    }

    if (root.browser && area === root.browser.storage?.session) {
      return area[method](...args);
    }

    if (root.browser && area === root.browser.storage?.local) {
      return area[method](...args);
    }

    return new Promise((resolve) => {
      area[method](...args, (result) => {
        resolve(result);
      });
    });
  }

  namespace.createStateManager = function createStateManager(api, sendRenderMessage) {
    const memoryTrackedByTab = new Map();
    const tabWriteChains = new Map();

    function emptyTabState() {
      return {
        tracked: { requests: [] },
        display: null
      };
    }

    async function readTabState(domain, tabId) {
      const storageKey = namespace.tabStateKey(domain, tabId);
      const data = await callStorage(api, "get", storageKey);
      return (data && data[storageKey]) || emptyTabState();
    }

    function pruneTabState(state) {
      const nextState = state || emptyTabState();
      const trackedCutoff = now() - namespace.TRACK_TTL_MS;
      const displayCutoff = now() - namespace.DISPLAY_TTL_MS;
      const tracked = nextState.tracked || { requests: [] };
      const freshRequests = (tracked.requests || []).filter((item) => item.time >= trackedCutoff);

      nextState.tracked = {
        requests: freshRequests.slice(-namespace.MAX_REQUESTS_PER_TAB)
      };

      if (!nextState.display || nextState.display.time < displayCutoff) {
        nextState.display = null;
      }

      return nextState;
    }

    function rememberInMemory(tabId, request) {
      const existing = memoryTrackedByTab.get(tabId) || [];
      existing.push(request);
      memoryTrackedByTab.set(tabId, existing.slice(-namespace.MAX_REQUESTS_PER_TAB));
    }

    function mergedRequests(tabId, storedRequests) {
      const merged = [...(storedRequests || []), ...(memoryTrackedByTab.get(tabId) || [])];
      const deduped = [];
      const seen = new Set();

      for (const item of merged.sort((left, right) => left.time - right.time)) {
        const key = `${item.requestId || ""}:${item.url}:${item.time}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(item);
        }
      }

      return deduped
        .filter((item) => item.time >= now() - namespace.TRACK_TTL_MS)
        .slice(-namespace.MAX_REQUESTS_PER_TAB);
    }

    function isEmptyTabState(state) {
      return (!state.display && !(state.tracked && state.tracked.requests && state.tracked.requests.length));
    }

    async function writeTabState(domain, tabId, state) {
      const storageKey = namespace.tabStateKey(domain, tabId);
      const nextState = pruneTabState(state);

      if (isEmptyTabState(nextState)) {
        await callStorage(api, "remove", storageKey);
        return;
      }

      await callStorage(api, "set", {
        [storageKey]: nextState
      });
    }

    async function updateTabState(domain, tabId, mutator) {
      const tabKey = `${domain}:${tabId}`;
      const previousChain = tabWriteChains.get(tabKey) || Promise.resolve();
      const nextChain = previousChain
        .catch(() => undefined)
        .then(async () => {
          const state = pruneTabState(await readTabState(domain, tabId));
          await mutator(state);
          await writeTabState(domain, tabId, state);
        });

      tabWriteChains.set(tabKey, nextChain);

      try {
        await nextChain;
      } finally {
        if (tabWriteChains.get(tabKey) === nextChain) {
          tabWriteChains.delete(tabKey);
        }
      }
    }

    async function rememberNavigationRequest(tabId, request) {
      if (!Number.isInteger(tabId) || tabId < 0 || !isMyShopifyUrl(request.url)) {
        return;
      }

      const domain = domainFromUrl(request.url);
      if (!domain) {
        return;
      }

      const item = {
        url: request.url,
        requestId: request.requestId || "",
        time: now(),
        source: request.source || "dnr",
        statusCode: request.statusCode || null
      };

      rememberInMemory(tabId, item);

      await updateTabState(domain, tabId, async (state) => {
        const tracked = state.tracked || { requests: [] };
        tracked.requests.push(item);
        tracked.requests = tracked.requests.slice(-namespace.MAX_REQUESTS_PER_TAB);
        state.tracked = tracked;
      });
    }

    function redirectSourceFromRequests(requests, finalUrl) {
      const eligible = (requests || []).filter((item) => {
        return item && isHttpUrl(item.url) && item.url !== finalUrl && item.time >= now() - namespace.TRACK_TTL_MS;
      });

      if (!eligible.length) {
        return null;
      }

      const exact302 = eligible.filter((item) => item.statusCode === 302);
      const preferred = exact302.length ? exact302 : eligible;
      return preferred[preferred.length - 1];
    }

    function canDisplayForUrl(display, finalUrl) {
      if (!display) {
        return false;
      }

      if (!isHttpUrl(finalUrl)) {
        return true;
      }

      return isMyShopifyUrl(finalUrl) && isPasswordPageUrl(finalUrl);
    }

    async function rememberCommittedRedirect(details) {
      if (!details || details.frameId !== 0 || !isHttpUrl(details.url)) {
        return;
      }

      const qualifiers = details.transitionQualifiers || [];
      const isServerRedirect = qualifiers.includes("server_redirect");
      const isEligibleTarget = isMyShopifyUrl(details.url) && isPasswordPageUrl(details.url);
      const domain = domainFromUrl(details.url);

      if (!domain) {
        return;
      }

      if (!isServerRedirect || !isEligibleTarget) {
        await updateTabState(domain, details.tabId, async (state) => {
          state.tracked = { requests: [] };
        });
        memoryTrackedByTab.delete(details.tabId);
        return;
      }

      await updateTabState(domain, details.tabId, async (state) => {
        const tracked = state.tracked || { requests: [] };
        tracked.requests = mergedRequests(details.tabId, tracked.requests);
        const source = redirectSourceFromRequests(tracked.requests, details.url);
        state.tracked = tracked;

        if (!source) {
          return;
        }

        state.display = {
          fromUrl: source.url,
          finalUrl: details.url,
          statusCode: source.statusCode || null,
          time: now(),
          detectedBy: source.source
        };
        state.tracked = { requests: [] };
      });

      memoryTrackedByTab.delete(details.tabId);

      await sendRenderMessage(details.tabId);
    }

    async function getDisplayForTab(tabId, finalUrl) {
      if (!Number.isInteger(tabId) || tabId < 0) {
        return null;
      }

      const domain = domainFromUrl(finalUrl);
      if (!domain) {
        return null;
      }

      const state = pruneTabState(await readTabState(domain, tabId));
      const display = state.display;

      if (!display || display.time < now() - namespace.DISPLAY_TTL_MS) {
        return null;
      }

      if (!canDisplayForUrl(display, finalUrl)) {
        return null;
      }

      return {
        fromUrl: display.fromUrl,
        finalUrl: display.finalUrl,
        statusCode: display.statusCode || null,
        detectedBy: display.detectedBy || "dnr"
      };
    }

    async function resetTab(tabId) {
      memoryTrackedByTab.delete(tabId);
      const data = await callStorage(api, "get", null);
      const allKeys = Object.keys(data || {});
      const removableKeys = allKeys.filter((key) => {
        return key.startsWith(namespace.TAB_STATE_KEY_PREFIX) && key.endsWith(`:${tabId}`);
      });

      if (removableKeys.length) {
        await callStorage(api, "remove", removableKeys);
      }
    }

    return {
      getDisplayForTab,
      rememberCommittedRedirect,
      rememberNavigationRequest,
      resetTab
    };
  };
})(globalThis);
