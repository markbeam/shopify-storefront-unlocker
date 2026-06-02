(function (root) {
  "use strict";

  const namespace = (root.RedirectSourceBannerShared = root.RedirectSourceBannerShared || {});

  function getApi() {
    return root.browser || root.chrome || null;
  }

  function callRuntime(api, message) {
    if (!api || !api.runtime || typeof api.runtime.sendMessage !== "function") {
      return Promise.reject(new Error("Runtime messaging is unavailable"));
    }

    if (root.browser && api === root.browser) {
      return api.runtime.sendMessage(message);
    }

    return new Promise((resolve, reject) => {
      api.runtime.sendMessage(message, (response) => {
        if (api.runtime.lastError) {
          reject(new Error(api.runtime.lastError.message));
          return;
        }

        resolve(response);
      });
    });
  }

  function callTabsQuery(api, queryInfo) {
    if (!api || !api.tabs || typeof api.tabs.query !== "function") {
      return Promise.resolve([]);
    }

    if (root.browser && api === root.browser) {
      return api.tabs.query(queryInfo);
    }

    return new Promise((resolve) => {
      api.tabs.query(queryInfo, (tabs) => {
        resolve(tabs || []);
      });
    });
  }

  function callTabsGet(api, tabId) {
    if (!api || !api.tabs || typeof api.tabs.get !== "function") {
      return Promise.resolve(null);
    }

    if (root.browser && api === root.browser) {
      return api.tabs.get(tabId).catch(() => null);
    }

    return new Promise((resolve) => {
      api.tabs.get(tabId, (tab) => {
        if (api.runtime && api.runtime.lastError) {
          resolve(null);
          return;
        }

        resolve(tab || null);
      });
    });
  }

  function callStorage(area, method, ...args) {
    if (!area || typeof area[method] !== "function") {
      return Promise.resolve(undefined);
    }

    if (root.browser && root.browser.storage) {
      const browserStorage = root.browser.storage;
      if (area === browserStorage.local || area === browserStorage.session) {
        return area[method](...args);
      }
    }

    return new Promise((resolve) => {
      area[method](...args, (result) => {
        resolve(result);
      });
    });
  }

  namespace.getApi = getApi;
  namespace.callRuntime = callRuntime;
  namespace.callTabsQuery = callTabsQuery;
  namespace.callTabsGet = callTabsGet;
  namespace.callStorage = callStorage;
})(globalThis);
