(function (root) {
  "use strict";

  const namespace = (root.RedirectSourceBannerContent = root.RedirectSourceBannerContent || {});
  const HOST_ID = "redirect-source-url-banner-host";

  function ensureBody(callback) {
    if (document.body) {
      callback();
      return;
    }

    const observer = new MutationObserver(() => {
      if (document.body) {
        observer.disconnect();
        callback();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function removeBanner() {
    const existing = document.getElementById(HOST_ID);
    if (existing) {
      existing.remove();
    }
  }

  function renderBanner(payload) {
    if (!payload || !payload.fromUrl) {
      removeBanner();
      return;
    }

    ensureBody(() => {
      removeBanner();

      const host = document.createElement("div");
      host.id = HOST_ID;
      host.setAttribute("data-redirect-source-url", payload.fromUrl);
      host.style.position = "fixed";
      host.style.top = "8px";
      host.style.left = "50%";
      host.style.transform = "translateX(-50%)";
      host.style.zIndex = "2147483647";
      host.style.width = "min(920px, calc(100vw - 24px))";
      host.style.pointerEvents = "none";

      const shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = `
        :host {
          color-scheme: light dark;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .bar {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          min-height: 38px;
          box-sizing: border-box;
          padding: 8px 10px 8px 12px;
          border: 1px solid rgba(15, 23, 42, 0.2);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 10px 32px rgba(15, 23, 42, 0.18);
          color: #101827;
          pointer-events: auto;
        }

        .label {
          font-size: 12px;
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
          color: #0f766e;
        }

        .url {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
          color: #1f2937;
        }

        .close {
          display: inline-grid;
          place-items: center;
          width: 24px;
          height: 24px;
          padding: 0;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #475569;
          cursor: pointer;
          font: 18px/1 ui-sans-serif, system-ui, sans-serif;
        }

        .close:hover {
          background: rgba(15, 23, 42, 0.08);
          color: #0f172a;
        }

        @media (prefers-color-scheme: dark) {
          .bar {
            border-color: rgba(148, 163, 184, 0.35);
            background: rgba(17, 24, 39, 0.95);
            color: #e5e7eb;
            box-shadow: 0 10px 32px rgba(0, 0, 0, 0.35);
          }

          .label {
            color: #2dd4bf;
          }

          .url {
            color: #d1d5db;
          }

          .close {
            color: #cbd5e1;
          }

          .close:hover {
            background: rgba(255, 255, 255, 0.12);
            color: #ffffff;
          }
        }

        @media (max-width: 520px) {
          .bar {
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 6px 8px;
          }

          .label {
            grid-column: 1 / -1;
          }
        }
      `;

      const bar = document.createElement("div");
      bar.className = "bar";

      const label = document.createElement("span");
      label.className = "label";
      label.textContent = payload.statusCode === 302 ? "302 redirected from" : "server redirected from";

      const url = document.createElement("span");
      url.className = "url";
      url.title = payload.fromUrl;
      url.textContent = payload.fromUrl;

      const close = document.createElement("button");
      close.className = "close";
      close.type = "button";
      close.title = "Hide redirect URL";
      close.setAttribute("aria-label", "Hide redirect URL");
      close.textContent = "x";
      close.addEventListener("click", removeBanner);

      bar.append(label, url, close);
      shadow.append(style, bar);
      document.body.appendChild(host);
    });
  }

  namespace.ensureBody = ensureBody;
  namespace.removeBanner = removeBanner;
  namespace.renderBanner = renderBanner;
})(globalThis);
