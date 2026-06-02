(function (root) {
  "use strict";

  const shared = root.RedirectSourceBannerShared;
  const settingsNamespace = root.RedirectSourceBannerSettings;
  const namespace = root.RedirectSourceBannerBackground;

  if (!shared || !settingsNamespace || !namespace) {
    return;
  }

  function isHttpUrl(rawUrl) {
    return typeof rawUrl === "string" && /^https?:\/\//i.test(rawUrl);
  }

  function isSupportedUrl(rawUrl) {
    if (!isHttpUrl(rawUrl)) {
      return false;
    }

    try {
      return settingsNamespace.isShopifyHostname(new URL(rawUrl).hostname);
    } catch {
      return false;
    }
  }

  async function buildActionIcon(letter, backgroundColor, foregroundColor) {
    const imageData = {};

    for (const size of [16, 32, 48]) {
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        continue;
      }

      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, size, size);

      ctx.fillStyle = foregroundColor;
      ctx.font = `bold ${Math.floor(size * 0.62)}px system-ui, -apple-system, Segoe UI, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(letter, size / 2, size / 2 + size * 0.04);

      imageData[size] = ctx.getImageData(0, 0, size, size);
    }

    return imageData;
  }

  namespace.createActionStateService = function createActionStateService(api) {
    if (!api || !api.action) {
      return null;
    }

    let enabledIconPromise;
    let disabledIconPromise;

    function getEnabledIcon() {
      enabledIconPromise = enabledIconPromise || buildActionIcon("S", "#95BF48", "#ffffff");
      return enabledIconPromise;
    }

    function getDisabledIcon() {
      disabledIconPromise = disabledIconPromise || buildActionIcon("S", "#9ca3af", "#ffffff");
      return disabledIconPromise;
    }

    async function setPopup(tabId, popup) {
      if (typeof api.action.setPopup !== "function") {
        return;
      }

      await api.action.setPopup({ tabId, popup });
    }

    async function setTitle(tabId, title) {
      if (typeof api.action.setTitle !== "function") {
        return;
      }

      await api.action.setTitle({ tabId, title });
    }

    async function setIcon(tabId, imageData) {
      if (typeof api.action.setIcon !== "function") {
        return;
      }

      await api.action.setIcon({ tabId, imageData });
    }

    async function updateActionForTab(tabId, rawUrl) {
      if (!Number.isInteger(tabId) || tabId < 0) {
        return;
      }

      const isSupported = isSupportedUrl(rawUrl);
      const popup = isSupported ? namespace.ACTION_POPUP_PATH : "";
      const title = isSupported
        ? namespace.ACTION_TITLE_ENABLED
        : namespace.ACTION_TITLE_DISABLED;
      const icon = isSupported ? await getEnabledIcon() : await getDisabledIcon();

      await Promise.allSettled([
        setPopup(tabId, popup),
        setTitle(tabId, title),
        setIcon(tabId, icon)
      ]);
    }

    async function refreshTabAction(tabId) {
      const tab = await shared.callTabsGet(api, tabId);
      await updateActionForTab(tabId, tab && tab.url);
    }

    async function refreshAllTabs() {
      const tabs = await shared.callTabsQuery(api, {});
      await Promise.all(tabs.map((tab) => refreshTabAction(tab.id)));
    }

    function registerListeners() {
      if (api.tabs && api.tabs.onActivated) {
        api.tabs.onActivated.addListener((activeInfo) => {
          refreshTabAction(activeInfo && activeInfo.tabId).catch(() => undefined);
        });
      }

      if (api.tabs && api.tabs.onUpdated) {
        api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
          if (!changeInfo || (!("url" in changeInfo) && changeInfo.status !== "complete")) {
            return;
          }

          updateActionForTab(tabId, (changeInfo && changeInfo.url) || (tab && tab.url)).catch(() => undefined);
        });
      }

      if (api.windows && api.windows.onFocusChanged) {
        api.windows.onFocusChanged.addListener(() => {
          shared.callTabsQuery(api, { active: true, currentWindow: true })
            .then((tabs) => {
              const tab = tabs && tabs[0];
              return refreshTabAction(tab && tab.id);
            })
            .catch(() => undefined);
        });
      }
    }

    return {
      refreshTabAction,
      refreshAllTabs,
      registerListeners
    };
  };
})(globalThis);
