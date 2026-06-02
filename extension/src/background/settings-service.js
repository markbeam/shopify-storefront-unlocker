(function (root) {
  "use strict";

  const shared = root.RedirectSourceBannerShared;
  const settingsNamespace = root.RedirectSourceBannerSettings;
  const namespace = root.RedirectSourceBannerBackground;

  if (!shared || !settingsNamespace || !namespace) {
    return;
  }

  function hostnameFromUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl) {
      return "";
    }

    try {
      return new URL(rawUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  namespace.createSettingsService = function createSettingsService(api) {
    const store = settingsNamespace.createStore(api);

    async function getActiveTab() {
      const tabs = await shared.callTabsQuery(api, { active: true, currentWindow: true });
      return tabs.find((tab) => typeof (tab && tab.id) === "number") || tabs[0] || null;
    }

    async function getHostnameForMessage(message, sender) {
      if (message && typeof message.hostname === "string" && message.hostname) {
        return message.hostname.toLowerCase();
      }

      if (message && Number.isInteger(message.tabId)) {
        const tab = await shared.callTabsGet(api, message.tabId);
        return hostnameFromUrl(tab && tab.url);
      }

      return hostnameFromUrl(sender && sender.tab && sender.tab.url);
    }

    async function getPopupState() {
      const [settings, activeTab] = await Promise.all([
        store.loadSettings(),
        getActiveTab()
      ]);

      const activeHostname = hostnameFromUrl(activeTab && activeTab.url);
      const isShopifyHostname = settingsNamespace.isShopifyHostname(activeHostname);

      return {
        settings,
        activeHostname,
        isShopifyHostname,
        effectiveSiteView: isShopifyHostname
          ? store.getEffectiveSiteView(settings, activeHostname)
          : null
      };
    }

    async function getEffectiveForMessage(message, sender) {
      const settings = await store.loadSettings();
      const hostname = await getHostnameForMessage(message, sender);

      if (!settingsNamespace.isShopifyHostname(hostname)) {
        return {
          source: "global",
          password: null,
          shouldAttempt: false,
          siteConfig: null
        };
      }

      return store.getEffectiveSiteView(settings, hostname);
    }

    function handleMessage(message, sender, sendResponse) {
      if (!message || typeof message.type !== "string" || !message.type.startsWith("shopify-settings:")) {
        return false;
      }

      let task;

      switch (message.type) {
        case "shopify-settings:get-popup-state":
          task = getPopupState();
          break;
        case "shopify-settings:save-global":
          task = store.saveGlobalConfig(message.defaultPassword);
          break;
        case "shopify-settings:save-site":
          task = store.saveSiteConfig({
            hostname: message.hostname,
            source: message.source,
            customPassword: message.customPassword
          });
          break;
        case "shopify-settings:get-effective-for-tab":
          task = getEffectiveForMessage(message, sender);
          break;
        case "shopify-settings:record-auto-login":
          task = store.recordAutoLogin({
            hostname: message.hostname,
            source: message.source,
            customPassword: message.customPassword
          });
          break;
        case "shopify-settings:complete-login":
          task = store.completeLogin({
            hostname: message.hostname,
            password: message.password,
            persistPassword: message.persistPassword,
            isAutoLogin: message.isAutoLogin
          });
          break;
        default:
          return false;
      }

      Promise.resolve(task)
        .then((payload) => {
          sendResponse({ ok: true, payload: payload || null });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: error && error.message ? error.message : String(error)
          });
        });

      return true;
    }

    return {
      handleMessage
    };
  };
})(globalThis);
