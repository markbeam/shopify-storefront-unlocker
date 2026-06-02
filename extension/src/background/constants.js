(function (root) {
  "use strict";

  const namespace =
    (root.RedirectSourceBannerBackground = root.RedirectSourceBannerBackground || {});

  namespace.TAB_STATE_KEY_PREFIX = "redirect_source_banner_tab_state:";
  namespace.TRACK_TTL_MS = 30000;
  namespace.DISPLAY_TTL_MS = 120000;
  namespace.MAX_REQUESTS_PER_TAB = 12;
  namespace.SHOPIFY_SETTINGS_MESSAGE_PREFIX = "shopify-settings:";
  namespace.ACTION_POPUP_PATH = "popup.html";
  namespace.ACTION_TITLE_ENABLED = "Shopify 密码配置";
  namespace.ACTION_TITLE_DISABLED = "当前站点暂不支持 Shopify 密码配置";
  namespace.tabStateKey = function tabStateKey(domain, tabId) {
    return `${namespace.TAB_STATE_KEY_PREFIX}${domain}:${tabId}`;
  };
})(globalThis);
