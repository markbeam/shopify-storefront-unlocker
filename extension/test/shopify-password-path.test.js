import assert from "node:assert/strict";
import test from "node:test";

await import("../src/shared/browser-api.js");

const { isShopifyPasswordPath } = globalThis.RedirectSourceBannerShared;

test("recognizes Shopify password paths with an optional locale prefix", () => {
  assert.equal(isShopifyPasswordPath("/password"), true);
  assert.equal(isShopifyPasswordPath("/password/"), true);
  assert.equal(isShopifyPasswordPath("/en-cn/password"), true);
  assert.equal(isShopifyPasswordPath("/zh-CN/password/"), true);
});

test("rejects unrelated or deeply nested paths", () => {
  assert.equal(isShopifyPasswordPath("/products/password"), false);
  assert.equal(isShopifyPasswordPath("/en-cn/products/password"), false);
  assert.equal(isShopifyPasswordPath("/password/reset"), false);
  assert.equal(isShopifyPasswordPath("/"), false);
});
