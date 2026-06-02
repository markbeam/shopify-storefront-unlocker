(function (root) {
  "use strict";

  const api = root.browser || root.chrome;
  const namespace = root.RedirectSourceBannerBackground;
  const settingsNamespace = root.RedirectSourceBannerSettings;

  if (!api || !namespace || typeof namespace.createStateManager !== "function" || !settingsNamespace) {
    return;
  }

  function log(event, details) {
    console.log("[RedirectSourceBanner]", event, details || {});
  }

  function sendTabMessage(tabId, message) {
    if (!api.tabs || typeof api.tabs.sendMessage !== "function") {
      return Promise.resolve();
    }

    if (root.browser && api === root.browser) {
      return api.tabs.sendMessage(tabId, message).catch(() => undefined);
    }

    return new Promise((resolve) => {
      api.tabs.sendMessage(tabId, message, () => {
        if (api.runtime && api.runtime.lastError) {
          // The content script may not be ready yet. It asks again on load.
        }
        resolve();
      });
    });
  }

  let stateManager;
  const settingsService = typeof namespace.createSettingsService === "function"
    ? namespace.createSettingsService(api)
    : null;
  const actionStateService = typeof namespace.createActionStateService === "function"
    ? namespace.createActionStateService(api)
    : null;

  async function sendRenderMessage(tabId) {
    const payload = await stateManager.getDisplayForTab(tabId);
    log("sendRenderMessage", {
      tabId,
      hasPayload: Boolean(payload),
      finalUrl: payload && payload.finalUrl
    });
    if (payload) {
      await sendTabMessage(tabId, {
        type: "redirect-source-banner:render",
        payload
      });
    }
  }

  stateManager = namespace.createStateManager(api, sendRenderMessage);
  if (actionStateService) {
    actionStateService.registerListeners();
    actionStateService.refreshAllTabs().catch(() => undefined);
  }

  if (api.declarativeNetRequest && api.declarativeNetRequest.onRuleMatchedDebug) {
    api.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
      const request = info && info.request;
      if (!request || request.type !== "main_frame") {
        return;
      }

      log("listener:dnr.onRuleMatchedDebug", {
        tabId: request.tabId,
        url: request.url,
        requestId: request.requestId
      });
      stateManager.rememberNavigationRequest(request.tabId, {
        url: request.url,
        requestId: request.requestId,
        source: "dnr"
      });
    });
  }

  if (api.webNavigation && api.webNavigation.onBeforeNavigate) {
    api.webNavigation.onBeforeNavigate.addListener((details) => {
      if (!details || details.frameId !== 0) {
        return;
      }

      log("listener:webNavigation.onBeforeNavigate", {
        tabId: details.tabId,
        url: details.url,
        frameId: details.frameId
      });
      stateManager.rememberNavigationRequest(details.tabId, {
        url: details.url,
        requestId: "",
        source: "webNavigation"
      });
    });
  }

  if (api.webRequest && api.webRequest.onHeadersReceived) {
    api.webRequest.onHeadersReceived.addListener(
      (details) => {
        if (!details || details.type !== "main_frame" || details.statusCode !== 302) {
          return;
        }

        log("listener:webRequest.onHeadersReceived", {
          tabId: details.tabId,
          url: details.url,
          requestId: details.requestId,
          statusCode: details.statusCode
        });
        stateManager.rememberNavigationRequest(details.tabId, {
          url: details.url,
          requestId: details.requestId,
          source: "webRequest302",
          statusCode: 302
        });
      },
      {
        urls: ["https://*.myshopify.com/*"],
        types: ["main_frame"]
      }
    );
  }

  if (api.webNavigation && api.webNavigation.onCommitted) {
    api.webNavigation.onCommitted.addListener((details) => {
      log("listener:webNavigation.onCommitted", {
        tabId: details.tabId,
        url: details.url,
        frameId: details.frameId,
        qualifiers: details.transitionQualifiers || []
      });
      stateManager.rememberCommittedRedirect(details);
    });
  }

  if (api.tabs && api.tabs.onRemoved) {
    api.tabs.onRemoved.addListener((tabId) => {
      log("listener:tabs.onRemoved", { tabId });
      stateManager.resetTab(tabId);
    });
  }

  if (api.runtime && api.runtime.onMessage) {
    api.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (settingsService && settingsService.handleMessage(message, sender, sendResponse)) {
        return true;
      }

      if (!message || message.type !== "redirect-source-banner:get") {
        return false;
      }

      const tabId = sender && sender.tab && sender.tab.id;
      log("listener:runtime.onMessage", {
        tabId,
        type: message.type,
        finalUrl: message.finalUrl
      });
      stateManager
        .getDisplayForTab(tabId, message.finalUrl)
        .then((payload) => {
          log("runtime.onMessage:response", {
            tabId,
            hasPayload: Boolean(payload),
            finalUrl: payload && payload.finalUrl
          });
          sendResponse(payload || null);
        })
        .catch(() => {
          log("runtime.onMessage:error", { tabId, finalUrl: message.finalUrl });
          sendResponse(null);
        });

      return true;
    });
  }
})(globalThis);
