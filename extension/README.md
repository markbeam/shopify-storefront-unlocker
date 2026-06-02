# Shopify Storefront Unlocker

一个面向 Shopify 店铺的浏览器扩展，帮助你更快处理密码页、自动登录和跳转后的来源查看。

## Project Layout

The source is organized by extension layer:

- `src/background/` contains the redirect-tracking service-worker modules.
- `src/content/` contains the page-injection banner modules.
- `manifests/` contains browser-specific manifest templates.
- `rules/` contains `declarativeNetRequest` rule resources.
- `scripts/` contains the build pipeline.

## 功能

- 统一设置默认密码，适用于大多数共用密码的店铺。
- 为单个店铺单独设置密码，互不影响。
- 支持手动处理模式，适合不想自动尝试密码的场景。
- 在支持的页面上自动填入并登录密码页。
- 记录跳转前的来源地址，方便核对页面来源。

## 使用

1. 运行构建。
2. 在浏览器中加载对应平台的 `dist` 目录。
3. 打开扩展弹窗，按需设置默认密码或单店密码。

构建命令：

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

## GitHub Actions 发布

推送 `vX.Y.Z` 格式的 tag 后，GitHub Actions 会自动：

- 构建 Chrome、Edge、Firefox 三个版本
- 分别打包为可直接下载的 `.zip`
- 自动上传到对应的 GitHub Release 附件

发布前请先同步更新 [package.json](extension/package.json:1) 中的 `version`，并确保它和 tag 版本一致。

## 使用到的技术 API

- `declarativeNetRequest`
- `declarativeNetRequest.onRuleMatchedDebug`
- `webNavigation`
- `webRequest`
- `tabs`
- `storage`
- `runtime.sendMessage`
- `action.setPopup`
- `action.setTitle`
- `action.setIcon`
