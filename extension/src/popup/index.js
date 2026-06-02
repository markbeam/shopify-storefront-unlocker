(function (root) {
  "use strict";

  const shared = root.RedirectSourceBannerShared;
  const view = root.RedirectSourceBannerPopupView;
  const api = shared && shared.getApi ? shared.getApi() : null;

  if (!shared || !view || !api || !document) {
    return;
  }

  const elements = {
    globalDefaultPasswordInput: document.getElementById("globalDefaultPassword"),
    saveGlobalButton: document.getElementById("saveGlobalButton"),
    currentHostnameNode: document.getElementById("currentHostname"),
    siteForm: document.getElementById("siteForm"),
    sitePasswordSource: document.getElementById("sitePasswordSource"),
    sitePasswordField: document.getElementById("sitePasswordField"),
    sitePasswordInput: document.getElementById("sitePassword"),
    siteStat: document.getElementById("siteStat"),
    saveSiteButton: document.getElementById("saveSiteButton")
  };

  let activeHostname = "";
  let currentSettings = null;
  let customPasswordDraft = "";
  let globalButtonTimer = 0;
  let siteButtonTimer = 0;

  function clearButtonTimer(name) {
    if (name === "global") {
      clearTimeout(globalButtonTimer);
      globalButtonTimer = 0;
      return;
    }

    clearTimeout(siteButtonTimer);
    siteButtonTimer = 0;
  }

  function flashSaved(button, name) {
    view.setSaveButtonState(button, "saved");
    clearButtonTimer(name);
    const timer = setTimeout(() => {
      view.setSaveButtonState(button, "idle");
    }, 1200);

    if (name === "global") {
      globalButtonTimer = timer;
    } else {
      siteButtonTimer = timer;
    }
  }

  function getSelectedSiteSource() {
    return elements.sitePasswordSource.querySelector('input[type="radio"]:checked')?.value || "global";
  }

  function applyRender() {
    view.renderGlobalConfig(elements, currentSettings);
    const renderState = view.renderSiteConfig(elements, currentSettings, activeHostname, customPasswordDraft);
    customPasswordDraft = renderState.customPasswordDraft;
    customPasswordDraft = view.syncSitePasswordField(elements, currentSettings, activeHostname, customPasswordDraft);
    view.refreshSitePasswordButton(elements);
  }

  async function refresh() {
    const response = await shared.callRuntime(api, {
      type: "shopify-settings:get-popup-state"
    });

    if (!response || !response.ok) {
      throw new Error(response && response.error ? response.error : "Failed to load popup state");
    }

    currentSettings = response.payload.settings;
    activeHostname = response.payload.activeHostname || "";
    applyRender();
  }

  async function saveGlobalConfigNow() {
    if (!elements.globalDefaultPasswordInput.value.trim()) {
      clearButtonTimer("global");
      view.setSaveButtonState(elements.saveGlobalButton, "idle");
      return;
    }

    view.setSaveButtonState(elements.saveGlobalButton, "saving");

    try {
      const response = await shared.callRuntime(api, {
        type: "shopify-settings:save-global",
        defaultPassword: elements.globalDefaultPasswordInput.value
      });

      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error : "Failed to save global password");
      }

      await refresh();
      flashSaved(elements.saveGlobalButton, "global");
    } catch (error) {
      console.error(error);
      view.setSaveButtonState(elements.saveGlobalButton, "error");
    }
  }

  async function saveSiteSourceNow() {
    if (!currentSettings || !activeHostname) {
      return;
    }

    const source = getSelectedSiteSource();
    const existingSiteConfig = currentSettings.siteConfigs.find((config) => config.hostname === activeHostname);
    const customPassword = source === "custom"
      ? ((existingSiteConfig && existingSiteConfig.customPassword) || "")
      : "";

    try {
      const response = await shared.callRuntime(api, {
        type: "shopify-settings:save-site",
        hostname: activeHostname,
        source,
        customPassword
      });

      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error : "Failed to save site source");
      }

      await refresh();
    } catch (error) {
      console.error(error);
    }
  }

  async function saveSitePasswordNow() {
    if (!currentSettings || !activeHostname) {
      return;
    }

    const source = getSelectedSiteSource();
    const savedPassword = elements.sitePasswordInput.value;

    if (source === "custom" && !savedPassword.trim()) {
      clearButtonTimer("site");
      view.setSaveButtonState(elements.saveSiteButton, "idle");
      customPasswordDraft = view.syncSitePasswordField(elements, currentSettings, activeHostname, customPasswordDraft);
      return;
    }

    view.setSaveButtonState(elements.saveSiteButton, "saving");

    try {
      const response = await shared.callRuntime(api, {
        type: "shopify-settings:save-site",
        hostname: activeHostname,
        source,
        customPassword: source === "custom" ? savedPassword : ""
      });

      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error : "Failed to save site password");
      }

      await refresh();
      flashSaved(elements.saveSiteButton, "site");
    } catch (error) {
      console.error(error);
      view.setSaveButtonState(elements.saveSiteButton, "error");
    }
  }

  elements.globalDefaultPasswordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveGlobalConfigNow();
    }
  });

  elements.saveGlobalButton.addEventListener("click", saveGlobalConfigNow);

  elements.sitePasswordSource.addEventListener("change", () => {
    customPasswordDraft = view.syncSitePasswordField(elements, currentSettings, activeHostname, customPasswordDraft);
    view.refreshSitePasswordButton(elements);
    saveSiteSourceNow();
  });

  elements.sitePasswordInput.addEventListener("input", () => {
    if (getSelectedSiteSource() === "custom") {
      customPasswordDraft = elements.sitePasswordInput.value;
      view.refreshSitePasswordButton(elements);
    }
  });

  elements.sitePasswordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveSitePasswordNow();
    }
  });

  elements.saveSiteButton.addEventListener("click", saveSitePasswordNow);

  refresh().catch((error) => {
    console.error(error);
  });
})(globalThis);
