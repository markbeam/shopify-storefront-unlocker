(function (root) {
  "use strict";

  const settingsNamespace = root.RedirectSourceBannerSettings;
  const namespace = (root.RedirectSourceBannerPopupView = root.RedirectSourceBannerPopupView || {});

  function formatDateTime(timestamp) {
    if (!timestamp) {
      return "";
    }

    try {
      const parts = new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).formatToParts(new Date(timestamp));

      const values = Object.fromEntries(
        parts
          .filter((part) => part.type !== "literal")
          .map((part) => [part.type, part.value])
      );

      return `${values.year}年${values.month}月${values.day}日 ${values.hour}:${values.minute}`;
    } catch {
      return "";
    }
  }

  function setSaveButtonState(button, state) {
    if (!button) {
      return;
    }

    const labels = {
      idle: "保存",
      saving: "保存中",
      saved: "已保存",
      error: "重试"
    };

    button.textContent = labels[state] || labels.idle;
    button.disabled = state === "saving";
  }

  function renderGlobalConfig(elements, settings) {
    elements.globalDefaultPasswordInput.value = settings.globalConfig.defaultPassword || "";
  }

  function syncRadioOptionStates(elements) {
    const options = elements.sitePasswordSource.querySelectorAll(".radio-option");
    for (const option of options) {
      const radio = option.querySelector('input[type="radio"]');
      option.classList.toggle("is-selected", Boolean(radio && radio.checked));
    }
  }

  function renderSiteConfig(elements, settings, hostname, customPasswordDraft) {
    const siteConfig = settingsNamespace.findSiteConfig(settings.siteConfigs, hostname);
    const siteStat = settingsNamespace.findSiteStat(settings.siteStats, hostname);
    const effective = settingsNamespace.getEffectiveSiteView(settings, hostname);
    const isShopifyHostname = settingsNamespace.isShopifyHostname(hostname);

    elements.currentHostnameNode.textContent = hostname || "未找到当前店铺";
    elements.siteForm.hidden = !isShopifyHostname;

    if (!isShopifyHostname) {
      return {
        siteConfig: null,
        effective: null,
        customPasswordDraft
      };
    }

    const source = siteConfig && siteConfig.source ? siteConfig.source : "global";
    const selectedRadio = elements.sitePasswordSource.querySelector(`input[type="radio"][value="${source}"]`);
    if (selectedRadio) {
      selectedRadio.checked = true;
    }
    syncRadioOptionStates(elements);

    const nextDraft = source === "custom"
      ? (siteConfig && siteConfig.customPassword) || customPasswordDraft
      : customPasswordDraft;

    if (source === "global") {
      elements.siteStat.innerHTML = effective.siteConfig
        ? "当前店铺使用<strong>默认密码</strong>。"
        : "当前店铺还没有单独设置，自动使用<strong>默认密码</strong>。";
    } else if (source === "manual") {
      elements.siteStat.innerHTML = "当前店铺已设为<strong>手动处理</strong>，不会自动尝试密码。";
    } else {
      elements.siteStat.innerHTML = "当前店铺使用<strong>单店密码</strong>。";
    }

    if (siteStat && siteStat.autoLoginCount > 0 && siteStat.autoLoginStartedAt) {
      elements.siteStat.innerHTML = `从 ${formatDateTime(siteStat.autoLoginStartedAt)} 开始，已自动登录 ${siteStat.autoLoginCount} 次。`;
    }

    if (siteStat && siteStat.lastAutoLoginAt) {
      elements.siteStat.innerHTML += `<br>上次自动登录：${formatDateTime(siteStat.lastAutoLoginAt)}`;
    }

    return {
      siteConfig,
      siteStat,
      effective,
      customPasswordDraft: nextDraft
    };
  }

  function syncSitePasswordField(elements, settings, hostname, customPasswordDraft) {
    const siteConfig = settings ? settingsNamespace.findSiteConfig(settings.siteConfigs, hostname) : null;
    const source = elements.sitePasswordSource.querySelector('input[type="radio"]:checked')?.value || "global";
    const isCustom = source === "custom";

    elements.sitePasswordField.hidden = !isCustom;
    elements.sitePasswordInput.disabled = !isCustom;

    if (isCustom && !elements.sitePasswordInput.value) {
      elements.sitePasswordInput.value = customPasswordDraft || (siteConfig && siteConfig.customPassword) || "";
    }

    if (!isCustom) {
      if (elements.sitePasswordInput.value) {
        customPasswordDraft = elements.sitePasswordInput.value;
      }
      elements.sitePasswordInput.value = "";
    } else {
      elements.sitePasswordInput.placeholder = "请输入单店密码";
    }

    elements.saveSiteButton.disabled = !isCustom || !elements.sitePasswordInput.value.trim();
    return customPasswordDraft;
  }

  function refreshSitePasswordButton(elements) {
    const source = elements.sitePasswordSource.querySelector('input[type="radio"]:checked')?.value || "global";
    syncRadioOptionStates(elements);
    setSaveButtonState(elements.saveSiteButton, "idle");
    elements.saveSiteButton.disabled = source !== "custom" || !elements.sitePasswordInput.value.trim();
  }

  namespace.setSaveButtonState = setSaveButtonState;
  namespace.renderGlobalConfig = renderGlobalConfig;
  namespace.renderSiteConfig = renderSiteConfig;
  namespace.syncSitePasswordField = syncSitePasswordField;
  namespace.refreshSitePasswordButton = refreshSitePasswordButton;
  namespace.syncRadioOptionStates = syncRadioOptionStates;
})(globalThis);
