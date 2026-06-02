(function (root) {
  "use strict";

  const namespace =
    (root.RedirectSourceBannerBackground = root.RedirectSourceBannerBackground || {});

  namespace.TAB_STATE_KEY_PREFIX = "redirect_source_banner_tab_state:";
  namespace.TRACK_TTL_MS = 30000;
  namespace.DISPLAY_TTL_MS = 120000;
  namespace.MAX_REQUESTS_PER_TAB = 12;
  namespace.tabStateKey = function tabStateKey(domain, tabId) {
    return `${namespace.TAB_STATE_KEY_PREFIX}${domain}:${tabId}`;
  };
})(globalThis);
