(function (root) {
  "use strict";

  const shared = root.RedirectSourceBannerShared;
  const namespace = (root.RedirectSourceBannerSettings = root.RedirectSourceBannerSettings || {});
  const DEFAULT_GLOBAL_PASSWORD = "1";
  const GLOBAL_CONFIG_KEY = "globalConfig";
  const SITE_CONFIGS_KEY = "siteConfigs";
  const SITE_STATS_KEY = "siteStats";
  const LEGACY_RULES_KEY = "passwordRules";
  const SHOPIFY_HOST_SUFFIX = ".myshopify.com";

  function now() {
    return Date.now();
  }

  function normalizeString(value, fallback) {
    return typeof value === "string" ? value : fallback || "";
  }

  function isShopifyHostname(hostname) {
    return typeof hostname === "string" && hostname.toLowerCase().endsWith(SHOPIFY_HOST_SUFFIX);
  }

  function normalizeGlobalConfig(input) {
    if (typeof input === "string") {
      return {
        defaultPassword: input,
        updatedAt: now()
      };
    }

    if (!input || typeof input !== "object") {
      return {
        defaultPassword: DEFAULT_GLOBAL_PASSWORD,
        updatedAt: 0
      };
    }

    return {
      defaultPassword: normalizeString(input.defaultPassword, DEFAULT_GLOBAL_PASSWORD),
      updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : 0
    };
  }

  function normalizeSiteConfig(input) {
    if (!input || typeof input !== "object") {
      return null;
    }

    const hostname = normalizeString(input.hostname).trim().toLowerCase();
    if (!hostname) {
      return null;
    }

    const source = input.source === "custom" || input.source === "manual" ? input.source : "global";

    return {
      hostname,
      source,
      customPassword: normalizeString(input.customPassword),
      createdAt: typeof input.createdAt === "number" ? input.createdAt : now(),
      updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : 0
    };
  }

  function normalizeSiteStat(input) {
    if (!input || typeof input !== "object") {
      return null;
    }

    const hostname = normalizeString(input.hostname).trim().toLowerCase();
    if (!hostname) {
      return null;
    }

    return {
      hostname,
      loginCount: typeof input.loginCount === "number" ? input.loginCount : 0,
      loginStartedAt: typeof input.loginStartedAt === "number" ? input.loginStartedAt : 0,
      lastLoginAt: typeof input.lastLoginAt === "number" ? input.lastLoginAt : 0,
      autoLoginCount: typeof input.autoLoginCount === "number" ? input.autoLoginCount : 0,
      autoLoginStartedAt: typeof input.autoLoginStartedAt === "number" ? input.autoLoginStartedAt : 0,
      lastAutoLoginAt: typeof input.lastAutoLoginAt === "number" ? input.lastAutoLoginAt : 0
    };
  }

  function normalizeLegacyRules(input) {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((rule) => {
        if (!rule || typeof rule.hostname !== "string") {
          return null;
        }

        const hostname = rule.hostname.trim().toLowerCase();
        if (!hostname) {
          return null;
        }

        const createdAt = typeof rule.createdAt === "number" ? rule.createdAt : now();
        const lastUsedAt = typeof rule.lastUsedAt === "number" ? rule.lastUsedAt : 0;

        return {
          hostname,
          source: "custom",
          customPassword: normalizeString(rule.password),
          createdAt,
          updatedAt: lastUsedAt || createdAt
        };
      })
      .filter(Boolean);
  }

  function normalizeLegacyStats(input) {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((rule) => {
        if (!rule || typeof rule.hostname !== "string") {
          return null;
        }

        const hostname = rule.hostname.trim().toLowerCase();
        if (!hostname) {
          return null;
        }

        const createdAt = typeof rule.createdAt === "number" ? rule.createdAt : now();
        const lastUsedAt = typeof rule.lastUsedAt === "number" ? rule.lastUsedAt : 0;

        return {
          hostname,
          loginCount: lastUsedAt ? 1 : 0,
          loginStartedAt: lastUsedAt || createdAt,
          lastLoginAt: lastUsedAt,
          autoLoginCount: lastUsedAt ? 1 : 0,
          autoLoginStartedAt: lastUsedAt || createdAt,
          lastAutoLoginAt: lastUsedAt
        };
      })
      .filter(Boolean);
  }

  function dedupeSiteConfigs(siteConfigs) {
    const byHostname = new Map();

    for (const config of siteConfigs) {
      if (!config || !config.hostname) {
        continue;
      }

      const existing = byHostname.get(config.hostname);
      if (!existing || (config.updatedAt || 0) >= (existing.updatedAt || 0)) {
        byHostname.set(config.hostname, config);
      }
    }

    return [...byHostname.values()].sort((left, right) => left.hostname.localeCompare(right.hostname));
  }

  function dedupeSiteStats(siteStats) {
    const byHostname = new Map();

    for (const stat of siteStats) {
      if (!stat || !stat.hostname) {
        continue;
      }

      const existing = byHostname.get(stat.hostname);
      if (!existing || (stat.lastLoginAt || 0) >= (existing.lastLoginAt || 0)) {
        byHostname.set(stat.hostname, stat);
      }
    }

    return [...byHostname.values()].sort((left, right) => left.hostname.localeCompare(right.hostname));
  }

  function findSiteConfig(siteConfigs, hostname) {
    const normalizedHostname = normalizeString(hostname).trim().toLowerCase();
    if (!normalizedHostname) {
      return null;
    }

    return siteConfigs.find((config) => config.hostname === normalizedHostname) || null;
  }

  function findSiteStat(siteStats, hostname) {
    const normalizedHostname = normalizeString(hostname).trim().toLowerCase();
    if (!normalizedHostname) {
      return null;
    }

    return siteStats.find((stat) => stat.hostname === normalizedHostname) || null;
  }

  function getEffectiveSiteView(settings, hostname) {
    const siteConfig = findSiteConfig(settings.siteConfigs, hostname);
    const source = siteConfig && siteConfig.source ? siteConfig.source : "global";
    const globalPassword = settings.globalConfig.defaultPassword || DEFAULT_GLOBAL_PASSWORD;
    const customPassword = siteConfig && siteConfig.customPassword ? siteConfig.customPassword : "";

    if (source === "manual") {
      return {
        siteConfig,
        siteStat: findSiteStat(settings.siteStats, hostname),
        source,
        password: null,
        shouldAttempt: false
      };
    }

    if (source === "custom") {
      return {
        siteConfig,
        siteStat: findSiteStat(settings.siteStats, hostname),
        source,
        password: customPassword,
        shouldAttempt: Boolean(customPassword)
      };
    }

    return {
      siteConfig,
      siteStat: findSiteStat(settings.siteStats, hostname),
      source: "global",
      password: globalPassword,
      shouldAttempt: Boolean(globalPassword)
    };
  }

  function createStore(api) {
    function storageArea() {
      return api && api.storage ? api.storage.local : null;
    }

    async function loadSettings() {
      const stored = await shared.callStorage(storageArea(), "get", [
        GLOBAL_CONFIG_KEY,
        SITE_CONFIGS_KEY,
        SITE_STATS_KEY,
        LEGACY_RULES_KEY
      ]);

      const globalConfig = normalizeGlobalConfig(stored && stored[GLOBAL_CONFIG_KEY]);
      const siteConfigs = [];
      const siteStats = [];

      if (Array.isArray(stored && stored[SITE_CONFIGS_KEY])) {
        for (const raw of stored[SITE_CONFIGS_KEY]) {
          const normalized = normalizeSiteConfig(raw);
          if (normalized) {
            siteConfigs.push(normalized);
          }
        }
      }

      if (Array.isArray(stored && stored[SITE_STATS_KEY])) {
        for (const raw of stored[SITE_STATS_KEY]) {
          const normalized = normalizeSiteStat(raw);
          if (normalized) {
            siteStats.push(normalized);
          }
        }
      }

      if (Array.isArray(stored && stored[LEGACY_RULES_KEY])) {
        siteConfigs.push(...normalizeLegacyRules(stored[LEGACY_RULES_KEY]));
        siteStats.push(...normalizeLegacyStats(stored[LEGACY_RULES_KEY]));
      }

      return {
        globalConfig,
        siteConfigs: dedupeSiteConfigs(siteConfigs),
        siteStats: dedupeSiteStats(siteStats)
      };
    }

    async function saveSettings(settings, migrateLegacy) {
      await shared.callStorage(storageArea(), "set", {
        [GLOBAL_CONFIG_KEY]: settings.globalConfig,
        [SITE_CONFIGS_KEY]: settings.siteConfigs,
        [SITE_STATS_KEY]: settings.siteStats
      });

      if (migrateLegacy) {
        await shared.callStorage(storageArea(), "remove", [LEGACY_RULES_KEY]);
      }
    }

    async function shouldMigrateLegacy() {
      const legacy = await shared.callStorage(storageArea(), "get", LEGACY_RULES_KEY);
      return Array.isArray(legacy && legacy[LEGACY_RULES_KEY]);
    }

    async function saveGlobalConfig(defaultPassword) {
      const normalizedPassword = normalizeString(defaultPassword).trim();
      if (!normalizedPassword) {
        throw new Error("Global default password is required");
      }

      const settings = await loadSettings();
      settings.globalConfig = {
        defaultPassword: normalizedPassword,
        updatedAt: now()
      };

      await saveSettings(settings, await shouldMigrateLegacy());
      return settings.globalConfig;
    }

    async function saveSiteConfig(input) {
      const hostname = normalizeString(input && input.hostname).trim().toLowerCase();
      if (!hostname) {
        throw new Error("Hostname is required");
      }

      const source = input && (input.source === "custom" || input.source === "manual") ? input.source : "global";
      const settings = await loadSettings();
      const existingIndex = settings.siteConfigs.findIndex((config) => config.hostname === hostname);
      const existing = existingIndex >= 0 ? settings.siteConfigs[existingIndex] : null;
      const timestamp = now();
      const nextConfig = {
        hostname,
        source,
        customPassword: source === "custom" ? normalizeString(input && input.customPassword).trim() : existing?.customPassword || "",
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp
      };

      const nextSiteConfigs = settings.siteConfigs.filter((config, index) => index !== existingIndex);
      settings.siteConfigs = dedupeSiteConfigs([nextConfig, ...nextSiteConfigs]);
      await saveSettings(settings, await shouldMigrateLegacy());
      return nextConfig;
    }

    async function recordAutoLogin(input) {
      const hostname = normalizeString(input && input.hostname).trim().toLowerCase();
      if (!hostname) {
        throw new Error("Hostname is required");
      }

      const source = input && (input.source === "custom" || input.source === "manual") ? input.source : "global";
      if (source === "manual") {
        return null;
      }

      const settings = await loadSettings();
      const existingConfigIndex = settings.siteConfigs.findIndex((config) => config.hostname === hostname);
      const existingConfig = existingConfigIndex >= 0 ? settings.siteConfigs[existingConfigIndex] : null;
      const existingStatIndex = settings.siteStats.findIndex((stat) => stat.hostname === hostname);
      const existingStat = existingStatIndex >= 0 ? settings.siteStats[existingStatIndex] : null;
      const timestamp = now();
      const nextStat = {
        hostname,
        loginCount: (existingStat?.loginCount || 0) + 1,
        loginStartedAt: existingStat?.loginStartedAt || timestamp,
        lastLoginAt: timestamp,
        autoLoginCount: (existingStat?.autoLoginCount || 0) + 1,
        autoLoginStartedAt: existingStat?.autoLoginStartedAt || timestamp,
        lastAutoLoginAt: timestamp
      };
      const nextConfig = {
        hostname,
        source,
        customPassword: source === "custom"
          ? normalizeString((input && input.customPassword) || (existingConfig && existingConfig.customPassword)).trim()
          : existingConfig?.customPassword || "",
        createdAt: existingConfig?.createdAt || timestamp,
        updatedAt: timestamp
      };

      if (source === "custom" && !nextConfig.customPassword) {
        throw new Error("Custom password is required");
      }

      const nextSiteConfigs = settings.siteConfigs.filter((config, index) => index !== existingConfigIndex);
      settings.siteConfigs = dedupeSiteConfigs([nextConfig, ...nextSiteConfigs]);
      const nextSiteStats = settings.siteStats.filter((stat, index) => index !== existingStatIndex);
      settings.siteStats = dedupeSiteStats([nextStat, ...nextSiteStats]);
      await saveSettings(settings, await shouldMigrateLegacy());
      return nextConfig;
    }

    async function completeLogin(input) {
      const hostname = normalizeString(input && input.hostname).trim().toLowerCase();
      if (!hostname) {
        throw new Error("Hostname is required");
      }

      const persistPassword = Boolean(input && input.persistPassword);
      const password = normalizeString(input && input.password).trim();
      const isAutoLogin = Boolean(input && input.isAutoLogin);
      const settings = await loadSettings();
      const existingConfigIndex = settings.siteConfigs.findIndex((config) => config.hostname === hostname);
      const existingConfig = existingConfigIndex >= 0 ? settings.siteConfigs[existingConfigIndex] : null;
      const existingStatIndex = settings.siteStats.findIndex((stat) => stat.hostname === hostname);
      const existingStat = existingStatIndex >= 0 ? settings.siteStats[existingStatIndex] : null;
      const currentSource = existingConfig && existingConfig.source ? existingConfig.source : "global";
      const globalPassword = normalizeString(settings.globalConfig && settings.globalConfig.defaultPassword, DEFAULT_GLOBAL_PASSWORD).trim();
      const usedGlobalPassword = Boolean(globalPassword) && password === globalPassword;
      const isImplicitOrExplicitGlobal = !existingConfig || currentSource === "global";
      const nextSource = persistPassword ? "custom" : "manual";
      const nextCustomPassword = persistPassword ? password : (existingConfig?.customPassword || "");
      const shouldKeepCurrentConfig = Boolean(
        (isImplicitOrExplicitGlobal && usedGlobalPassword)
        || (
          existingConfig
          && currentSource === nextSource
          && normalizeString(existingConfig.customPassword).trim() === nextCustomPassword
        )
      );

      const timestamp = now();
      const nextStat = {
        hostname,
        loginCount: (existingStat?.loginCount || 0) + 1,
        loginStartedAt: existingStat?.loginStartedAt || timestamp,
        lastLoginAt: timestamp,
        autoLoginCount: isAutoLogin ? (existingStat?.autoLoginCount || 0) + 1 : (existingStat?.autoLoginCount || 0),
        autoLoginStartedAt: isAutoLogin
          ? (existingStat?.autoLoginStartedAt || timestamp)
          : (existingStat?.autoLoginStartedAt || 0),
        lastAutoLoginAt: isAutoLogin ? timestamp : (existingStat?.lastAutoLoginAt || 0)
      };

      if (persistPassword && !nextCustomPassword) {
        throw new Error("Password is required when persisting login");
      }

      const nextSiteStats = settings.siteStats.filter((stat, index) => index !== existingStatIndex);
      settings.siteStats = dedupeSiteStats([nextStat, ...nextSiteStats]);

      if (!shouldKeepCurrentConfig) {
        const nextConfig = {
          hostname,
          source: nextSource,
          customPassword: nextCustomPassword,
          createdAt: existingConfig?.createdAt || timestamp,
          updatedAt: timestamp
        };
        const nextSiteConfigs = settings.siteConfigs.filter((config, index) => index !== existingConfigIndex);
        settings.siteConfigs = dedupeSiteConfigs([nextConfig, ...nextSiteConfigs]);
      }

      await saveSettings(settings, await shouldMigrateLegacy());
      return {
        siteConfig: shouldKeepCurrentConfig ? existingConfig : findSiteConfig(settings.siteConfigs, hostname),
        siteStat: nextStat
      };
    }

    return {
      loadSettings,
      saveGlobalConfig,
      saveSiteConfig,
      recordAutoLogin,
      completeLogin,
      findSiteConfig,
      findSiteStat,
      getEffectiveSiteView
    };
  }

  namespace.DEFAULT_GLOBAL_PASSWORD = DEFAULT_GLOBAL_PASSWORD;
  namespace.isShopifyHostname = isShopifyHostname;
  namespace.findSiteConfig = findSiteConfig;
  namespace.findSiteStat = findSiteStat;
  namespace.getEffectiveSiteView = getEffectiveSiteView;
  namespace.createStore = createStore;
})(globalThis);
