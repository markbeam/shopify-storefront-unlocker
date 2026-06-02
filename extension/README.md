# 302 Redirect Source Banner

Browser extension for Chrome, Edge, and Firefox Manifest V3. It records the URL seen before a server-side redirect and inserts that URL into the redirected page as a floating top banner.

## Project Layout

The source is organized by extension layer:

- `src/background/` contains the redirect-tracking service-worker modules.
- `src/content/` contains the page-injection banner modules.
- `manifests/` contains browser-specific manifest templates.
- `rules/` contains `declarativeNetRequest` rule resources.
- `scripts/` contains the build pipeline.

## Build

```sh
npm run build
```

The build creates browser-specific bundles under:

- `dist/chrome`
- `dist/edge`
- `dist/firefox`

Each output keeps the modular source tree for inspection and also generates the extension entry points that the manifest loads.

## Load unpacked

Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked and select `extension/dist/chrome`.

Edge:

1. Open `edge://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked and select `extension/dist/edge`.

Firefox:

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose Load Temporary Add-on.
3. Select `extension/dist/firefox/manifest.json`.

## How it works

- `rules/main-frame-tracker.json` declares a Manifest V3 `declarativeNetRequest` rule for top-level HTTP and HTTPS navigations.
- `src/background/index.js` listens for `declarativeNetRequest.onRuleMatchedDebug` to record matched navigation URLs.
- `webRequest.onHeadersReceived` is used in read-only mode to mark exact `302` main-frame responses when the browser exposes the status code.
- `webNavigation.onCommitted` is used to confirm that the final page was committed with the `server_redirect` qualifier.
- `src/content/index.js` injects a Shadow DOM banner into `document.body` at the top of the redirected page.

`declarativeNetRequest` does not expose response status codes or `Location` response headers to extension JavaScript. The DNR rule provides the URL capture point, while `webNavigation` provides the browser signal that the committed page came from a server redirect.

`declarativeNetRequest.onRuleMatchedDebug` requires the `declarativeNetRequestFeedback` permission and is intended for debugging or unpacked-extension workflows in Chromium browsers. For broader production distribution, you may need a store-policy review or a non-DNR fallback strategy.

## Source Entry Points

- `src/background/index.js`
- `src/content/index.js`
