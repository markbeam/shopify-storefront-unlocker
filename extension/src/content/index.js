(function (root) {
  "use strict";

  const shared = root.RedirectSourceBannerShared;
  const api = shared && shared.getApi ? shared.getApi() : null;
  const namespace = root.RedirectSourceBannerContent;
  const AUTO_LOGIN_CONTAINER_CLASS = "redirect-source-auto-login";
  let autoSubmitAttempted = false;
  let submitInterceptionInstalled = false;
  let activePayload = null;
  let submitInFlight = false;

  if (!shared || !api || !api.runtime || !namespace || typeof namespace.renderBanner !== "function") {
    return;
  }

  function log(event, details) {
    console.log("[RedirectSourceBanner][content]", event, details || {});
  }

  function isPasswordPage() {
    try {
      return /\.myshopify\.com$/i.test(location.hostname) && location.pathname === "/password";
    } catch {
      return false;
    }
  }

  function findUnlockForm() {
    const forms = Array.from(document.forms || []);
    return forms.length === 1 ? forms[0] : null;
  }

  function getPasswordInput(form) {
    return form ? form.querySelector('input[name="password"]') : null;
  }

  function getSubmitControl(form) {
    if (!form) {
      return null;
    }

    return form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
  }

  function ensureAutoLoginStyles() {
    if (document.getElementById("redirect-source-auto-login-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "redirect-source-auto-login-style";
    style.textContent = `
      .${AUTO_LOGIN_CONTAINER_CLASS} {
        margin-top: 12px;
      }

      .${AUTO_LOGIN_CONTAINER_CLASS} label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
      }
    `;

    document.head.appendChild(style);
  }

  function ensureAutoLoginToggle(form) {
    const submitControl = getSubmitControl(form);
    if (!submitControl || !submitControl.parentNode) {
      return null;
    }

    let container = form.querySelector(`.${AUTO_LOGIN_CONTAINER_CLASS}`);
    if (container) {
      return container.querySelector('input[type="checkbox"]');
    }

    ensureAutoLoginStyles();

    container = document.createElement("div");
    container.className = AUTO_LOGIN_CONTAINER_CLASS;

    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = false;

    const text = document.createElement("span");
    text.textContent = "Auto login";

    label.append(checkbox, text);
    container.appendChild(label);
    submitControl.parentNode.insertBefore(container, submitControl);
    return checkbox;
  }

  function clearPasswordError(input) {
    if (!input) {
      return;
    }

    input.classList.remove("with-error");
    const next = input.nextElementSibling;
    if (next && next.classList.contains("error-container")) {
      next.remove();
    }
  }

  function showPasswordError(input) {
    if (!input) {
      return;
    }

    clearPasswordError(input);
    ensureAutoLoginStyles();
    input.classList.add("with-error");

    const container = document.createElement("div");
    container.className = "error-container";
    container.innerHTML = `
      <p class="notification">
        <span class="error-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M10,18 C5.581722,18 2,14.418278 2,10 C2,5.581722 5.581722,2 10,2 C14.418278,2 18,5.581722 18,10 C18,14.418278 14.418278,18 10,18 Z M9,9.9996 L11,9.9996 L11,5.9996 L9,5.9996 L9,9.9996 Z M9,13.9996 L11,13.9996 L11,11.9996 L9,11.9996 L9,13.9996 Z"></path></svg>
        </span>
        <span class="error-message">Password incorrect, please try again.</span>
      </p>
    `;

    input.insertAdjacentElement("afterend", container);
  }

  function isRedirectResponse(response) {
    if (!response) {
      return false;
    }

    if (response.type === "opaqueredirect") {
      return true;
    }

    return response.status >= 300 && response.status < 400;
  }

  function resolveRedirectTarget(payload) {
    return payload && payload.fromUrl ? payload.fromUrl : "";
  }

  async function persistLoginSuccess(password, options) {
    const response = await shared.callRuntime(api, {
      type: "shopify-settings:complete-login",
      hostname: location.hostname,
      password,
      persistPassword: Boolean(options && options.persistPassword),
      isAutoLogin: Boolean(options && options.isAutoLogin)
    }).catch((error) => {
      log("completeLogin:config_error", {
        message: error && error.message ? error.message : String(error)
      });
      return null;
    });

    if (!response || !response.ok) {
      log("completeLogin:config_rejected", {
        error: response && response.error ? response.error : "unknown_error"
      });
    }
  }

  async function submitUnlockForm(form, input, password, payload, options) {
    const checkbox = options && options.autoLoginCheckbox ? options.autoLoginCheckbox : null;
    const isAutoLogin = Boolean(options && options.isAutoLogin);
    const persistPassword = Boolean(checkbox && checkbox.checked);
    const normalizedPassword = String(password || "").trim();
    if (!form || !input || !normalizedPassword) {
      return false;
    }

    clearPasswordError(input);
    input.value = normalizedPassword;
    submitInFlight = true;

    const method = (form.getAttribute("method") || "post").toUpperCase();
    const action = form.getAttribute("action") || location.href;
    const formData = new FormData(form);
    formData.set("password", normalizedPassword);
    const requestUrl = new URL(action, location.href);

    if (method === "GET") {
      const params = new URLSearchParams(formData);
      requestUrl.search = params.toString();
    }

    const targetUrl = requestUrl.toString();

    log("autoUnlock:submit", {
      method,
      targetUrl,
      redirectTo: resolveRedirectTarget(payload),
      mode: isAutoLogin ? "auto" : "manual",
      persistPassword
    });

    try {
      const submitResponse = await fetch(targetUrl, {
        method,
        body: method === "GET" ? undefined : formData,
        credentials: "same-origin",
        redirect: "manual",
        headers: method === "GET" ? undefined : {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (isRedirectResponse(submitResponse)) {
        await persistLoginSuccess(normalizedPassword, {
          persistPassword,
          isAutoLogin
        });

        log("autoUnlock:success", {
          status: submitResponse.status,
          type: submitResponse.type,
          redirectTo: resolveRedirectTarget(payload),
          mode: isAutoLogin ? "auto" : "manual",
          persistPassword
        });

        if (resolveRedirectTarget(payload)) {
          location.href = resolveRedirectTarget(payload);
          return;
        }

        location.reload();
        return;
      }

      showPasswordError(input);
      log("autoUnlock:non_redirect_response", {
        status: submitResponse.status,
        type: submitResponse.type
      });
    } catch (error) {
      showPasswordError(input);
      log("autoUnlock:error", {
        message: error && error.message ? error.message : String(error)
      });
    } finally {
      submitInFlight = false;
    }

    return false;
  }

  function ensureSubmitInterception(payload) {
    if (payload) {
      activePayload = payload;
    }

    if (submitInterceptionInstalled || !isPasswordPage()) {
      return;
    }

    const form = findUnlockForm();
    const input = getPasswordInput(form);
    if (!form || !input) {
      return;
    }

    submitInterceptionInstalled = true;
    form.addEventListener("submit", async (event) => {
      const autoLoginCheckbox = ensureAutoLoginToggle(form);
      const password = String(input.value || "").trim();

      if (!password || submitInFlight) {
        if (submitInFlight) {
          event.preventDefault();
        }
        return;
      }

      event.preventDefault();
      await submitUnlockForm(form, input, password, activePayload, {
        autoLoginCheckbox,
        isAutoLogin: false
      });
    });
  }

  async function autoUnlock(payload) {
    if (!isPasswordPage()) {
      return;
    }

    ensureSubmitInterception(payload);

    if (autoSubmitAttempted) {
      return;
    }

    const form = findUnlockForm();
    if (!form) {
      log("autoUnlock:skip", { reason: "expected_exactly_one_form", forms: document.forms.length });
      return;
    }

    const input = getPasswordInput(form);
    if (!input) {
      log("autoUnlock:skip", { reason: "missing_password_input" });
      return;
    }

    const autoLoginCheckbox = ensureAutoLoginToggle(form);
    const response = await shared.callRuntime(api, {
      type: "shopify-settings:get-effective-for-tab",
      hostname: location.hostname
    }).catch((error) => {
      log("autoUnlock:config_error", {
        message: error && error.message ? error.message : String(error)
      });
      return null;
    });

    const effective = response && response.ok ? response.payload : null;
    if (!effective || !effective.shouldAttempt || !String(effective.password || "").trim()) {
      log("autoUnlock:skip", {
        reason: "no_effective_password",
        source: effective && effective.source
      });
      return;
    }

    autoLoginCheckbox.checked = effective.source !== "manual";
    autoSubmitAttempted = true;
    await submitUnlockForm(form, input, effective.password, payload, {
      autoLoginCheckbox,
      isAutoLogin: true
    });
  }

  function handlePayload(payload) {
    if (payload) {
      activePayload = payload;
    }
    namespace.renderBanner(payload);
    ensureSubmitInterception(payload);
  }

  function requestBannerPayload() {
    return shared.callRuntime(api, {
      type: "redirect-source-banner:get",
      finalUrl: location.href
    }).catch(() => null);
  }

  api.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "redirect-source-banner:render") {
      return false;
    }

    handlePayload(message.payload);
    return false;
  });

  async function initialize() {
    const payload = await requestBannerPayload();
    handlePayload(payload);
    await autoUnlock(payload);
  }

  initialize().catch((error) => {
    log("initialize:error", {
      message: error && error.message ? error.message : String(error)
    });
  });
})(globalThis);
