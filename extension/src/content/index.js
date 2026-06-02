(function (root) {
  "use strict";

  const api = root.browser || root.chrome;
  const namespace = root.RedirectSourceBannerContent;
  const AUTO_PASSWORD = "1";
  const AUTO_LOGIN_CONTAINER_CLASS = "redirect-source-auto-login";
  let autoSubmitAttempted = false;

  if (!api || !api.runtime || !namespace || typeof namespace.renderBanner !== "function") {
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
    checkbox.checked = true;

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

  async function autoUnlock(payload) {
    if (autoSubmitAttempted || !payload || !payload.fromUrl || !isPasswordPage()) {
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
    clearPasswordError(input);
    autoSubmitAttempted = true;

    const method = (form.getAttribute("method") || "post").toUpperCase();
    const action = form.getAttribute("action") || location.href;
    const formData = new FormData(form);
    if (!String(formData.get("password") || "").trim()) {
      formData.set("password", AUTO_PASSWORD);
    }
    const requestUrl = new URL(action, location.href);

    if (method === "GET") {
      const params = new URLSearchParams(formData);
      requestUrl.search = params.toString();
    }

    const targetUrl = requestUrl.toString();

    log("autoUnlock:submit", {
      method,
      targetUrl,
      redirectTo: payload.fromUrl
    });

    try {
      const response = await fetch(targetUrl, {
        method,
        body: method === "GET" ? undefined : formData,
        credentials: "same-origin",
        redirect: "manual",
        headers: method === "GET" ? undefined : {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (isRedirectResponse(response)) {
        alert(`Auto login checked: ${Boolean(autoLoginCheckbox && autoLoginCheckbox.checked)}`);
        log("autoUnlock:success", {
          status: response.status,
          type: response.type,
          redirectTo: payload.fromUrl
        });
        location.href = payload.fromUrl;
        return;
      }

      alert(`Auto login checked: ${Boolean(autoLoginCheckbox && autoLoginCheckbox.checked)}`);
      showPasswordError(input);
      log("autoUnlock:non_redirect_response", {
        status: response.status,
        type: response.type
      });
    } catch (error) {
      alert(`Auto login checked: ${Boolean(autoLoginCheckbox && autoLoginCheckbox.checked)}`);
      showPasswordError(input);
      log("autoUnlock:error", {
        message: error && error.message ? error.message : String(error)
      });
    }
  }

  function handlePayload(payload) {
    namespace.renderBanner(payload);
    autoUnlock(payload);
  }

  function requestPayload() {
    const message = {
      type: "redirect-source-banner:get",
      finalUrl: location.href
    };

    if (root.browser && api === root.browser) {
      api.runtime.sendMessage(message).then(handlePayload).catch(() => undefined);
      return;
    }

    api.runtime.sendMessage(message, (payload) => {
      if (api.runtime.lastError) {
        return;
      }
      handlePayload(payload);
    });
  }

  api.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "redirect-source-banner:render") {
      return false;
    }

    handlePayload(message.payload);
    return false;
  });

  requestPayload();
})(globalThis);
