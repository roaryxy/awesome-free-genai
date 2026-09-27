/**
 * Awesome Free GenAI — SPA
 *
 * Single-file vanilla JS app fed by data.json (built by scripts/build.py
 * from data/*.yaml). The build emits matching static HTML files so GitHub
 * Pages can serve crawlable clean URLs without server-side rewrites.
 *
 *   /                  Home
 *   /tools/            Browse (search + filters)
 *   /category/:slug/   Browse, scoped to one category
 *   /tool/:slug/       Tool detail
 *   /submit/           Suggest a tool
 *   /about/            About
 *
 *   Browse query params stay in the URL after `?`, e.g.
 *   /tools/?q=voice&type=Open+Source&tag=cli&sort=az
 *
 *   Legacy hash routes such as #/tool/chatgpt remain supported for old links.
 */

(function () {
  "use strict";

  // ── Constants ────────────────────────────────────────────
  const GITHUB_URL = "https://github.com/roaryxy/awesome-free-genai";
  const BASE_PATH = normalizeBasePath(window.AFG_BASE_PATH || "");
  const ASSET_PREFIX = window.AFG_ASSET_PREFIX || "";
  const NAV = [
    { to: "/tools/", label: "Browse" },
    { to: "/", label: "Categories", scrollTo: "categories" },
    { to: "/submit/", label: "Submit" },
    { to: "/about/", label: "About" },
  ];
  const POPULAR_QUERIES = ["Cursor", "ChatGPT", "Claude", "Suno", "ElevenLabs"];
  const FREE_TIER_TYPES = [
    { type: "Free Plan", description: "A genuinely free tier with no expiry." },
    { type: "Free Credits", description: "One-time or recurring credits to spend." },
  ];
  const FT_CLASS = {
    "Free Plan": "ft--free-plan",
    "Free Trial": "ft--free-trial",
    "Free Credits": "ft--free-credits",
    "Open Source": "ft--open-source",
    Freemium: "ft--freemium",
  };
  const LOCATION_FLAG = {
    USA: "🇺🇸",
    France: "🇫🇷",
    China: "🇨🇳",
    Australia: "🇦🇺",
    Singapore: "🇸🇬",
    Sweden: "🇸🇪",
    "Hong Kong": "🇭🇰",
    India: "🇮🇳",
    Israel: "🇮🇱",
    Prague: "🇨🇿",
    "Open Source": "🌐",
  };

  // ── State ────────────────────────────────────────────────
  let DATA = []; // [{ category, slug, icon, description, agents: [...] }]
  let TOOLS = []; // flat list
  let TOOL_BY_SLUG = {};
  let CATEGORY_BY_SLUG = {};
  let mobileNavOpen = false;
  let pendingScrollTo = null;
  const toasts = [];

  // ── Utilities ────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  function normalizeBasePath(value) {
    const clean = String(value || "").replace(/\/+$/, "");
    return clean === "/" ? "" : clean;
  }

  function normalizeRoutePath(value) {
    let path = String(value || "/").split("?")[0].split("#")[0] || "/";
    if (!path.startsWith("/")) path = "/" + path;
    path = path.replace(/\/+$/, "");
    return path || "/";
  }

  function urlFor(path, params) {
    const normalized = normalizeRoutePath(path);
    const route = normalized === "/" ? "/" : normalized + "/";
    const qs = params ? (params instanceof URLSearchParams ? params.toString() : new URLSearchParams(params).toString()) : "";
    return BASE_PATH + route + (qs ? "?" + qs : "");
  }

  function legacyHashToUrl(hash) {
    const raw = String(hash || "").replace(/^#/, "") || "/";
    const [pathPart, queryPart] = raw.split("?");
    return urlFor(pathPart || "/", new URLSearchParams(queryPart || ""));
  }

  function stripBasePath(pathname) {
    let path = pathname || "/";
    if (BASE_PATH && (path === BASE_PATH || path.startsWith(BASE_PATH + "/"))) {
      path = path.slice(BASE_PATH.length) || "/";
    }
    return normalizeRoutePath(path);
  }

  function isInternalUrl(url) {
    try {
      const target = new URL(url, window.location.href);
      return target.origin === window.location.origin && (!BASE_PATH || target.pathname === BASE_PATH || target.pathname.startsWith(BASE_PATH + "/"));
    } catch (e) {
      return false;
    }
  }

  function escape(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function classNames() {
    return Array.from(arguments).filter(Boolean).join(" ");
  }

  function hostname(url) {
    try { return new URL(url).hostname; } catch (e) { return url; }
  }

  function reportOutdatedUrl(tool) {
    const cat = CATEGORY_BY_SLUG[tool.category_slug];
    const title = `Outdated info: ${tool.name}`;
    const body =
      `**Tool:** [${tool.name}](${tool.url})\n` +
      `**Category:** ${cat ? cat.category : tool.category_slug}\n` +
      `**Current free-tier type:** ${tool.free_tier_type}\n` +
      `**Current free-tier details:** ${tool.free_tier || "—"}\n\n` +
      `---\n\n` +
      `### What's outdated?\n` +
      `<!-- e.g. pricing changed, link broken, free tier removed -->\n\n` +
      `### Source / proof\n` +
      `<!-- optional: link to the tool's pricing page, blog post, etc. -->\n`;
    const params = new URLSearchParams({
      title,
      body,
      labels: "outdated",
    });
    return `${GITHUB_URL}/issues/new?${params.toString()}`;
  }

  function parseHash() {
    // Backward compatibility: old shared links such as #/tool/cursor still work.
    if (window.location.hash && window.location.hash.startsWith("#/")) {
      const raw = window.location.hash.replace(/^#/, "") || "/";
      const [pathPart, queryPart] = raw.split("?");
      const path = normalizeRoutePath(pathPart || "/");
      const segments = path.split("/").filter(Boolean);
      const params = new URLSearchParams(queryPart || "");
      return { path, segments, params };
    }

    const path = stripBasePath(window.location.pathname);
    const segments = path.split("/").filter(Boolean);
    const params = new URLSearchParams(window.location.search || "");
    return { path, segments, params };
  }

  function buildHash(path, params) {
    return urlFor(path, params);
  }

  function navigate(target) {
    const next = target && target.startsWith("#/") ? legacyHashToUrl(target) : target;
    const current = window.location.pathname + window.location.search;
    if (current === next) {
      render();
    } else {
      history.pushState(null, "", next);
      render();
    }
  }

  function updateQuery(updates, opts) {
    const { path, params } = parseHash();
    Object.keys(updates).forEach((key) => {
      const v = updates[key];
      if (v == null || v === "") params.delete(key);
      else params.set(key, v);
    });
    const next = buildHash(path, params);
    if (opts && opts.replace) {
      history.replaceState(null, "", next);
      render();
    } else {
      window.location.hash = next;
    }
  }

  function toggleInQuery(key, value) {
    const { params } = parseHash();
    const current = (params.get(key) || "").split(",").filter(Boolean);
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updateQuery({ [key]: next.length ? next.join(",") : null }, { replace: true });
  }

  function listFromParam(value) {
    if (!value) return [];
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }

  // ── Toasts ───────────────────────────────────────────────
  function toast(message, kind) {
    const id = Math.random().toString(36).slice(2);
    toasts.push({ id, message, kind: kind || "info" });
    renderToasts();
    setTimeout(() => {
      const idx = toasts.findIndex((t) => t.id === id);
      if (idx >= 0) toasts.splice(idx, 1);
      renderToasts();
    }, 4000);
  }

  function renderToasts() {
    let stack = document.getElementById("toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "toast-stack";
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }
    stack.innerHTML = toasts
      .map((t) => `<div class="toast toast--${escape(t.kind)}">${escape(t.message)}</div>`)
      .join("");
  }

  // ── Theme ────────────────────────────────────────────────
  function applyTheme(theme) {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try { localStorage.setItem("afg-theme", theme); } catch (e) {}
  }
  function currentTheme() {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }

  // ── Icons (inline SVG) ──────────────────────────────────
  function icon(name, size) {
    const s = size || 16;
    const attrs = `xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
    const paths = {
      sparkles:
        '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3"/>',
      logo:
        '<path d="M12 2 L13.6 10.4 L22 12 L13.6 13.6 L12 22 L10.4 13.6 L2 12 L10.4 10.4 Z" fill="currentColor" stroke="none"/>',
      menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
      close: '<path d="M18 6 6 18M6 6l12 12"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
      moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
      arrowUpRight: '<path d="M7 17 17 7M7 7h10v10"/>',
      arrowRight: '<path d="M5 12h14M13 5l7 7-7 7"/>',
      externalLink:
        '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="m10 14 11-11"/>',
      filters: '<path d="M3 6h18M6 12h12M10 18h4"/>',
      alert:
        '<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4M12 17h.01"/>',
      check:
        '<path d="M21.8 10A10 10 0 1 1 17 3.34"/><path d="m9 11 3 3L22 4"/>',
      github:
        '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
      shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
      heart:
        '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>',
      list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
      code: '<path d="m18 16 4-4-4-4M6 8l-4 4 4 4M14.5 4l-5 16"/>',
      mic: '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"/>',
      globe:
        '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
      workflow:
        '<rect x="3" y="3" width="8" height="8" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
      terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
      layers:
        '<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
      image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.81 0L6 21"/>',
      notebook: '<path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/>',
      checks: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
      calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
      chevronRight: '<path d="m9 18 6-6-6-6"/>',
    };
    const path = paths[name] || "";
    return `<svg ${attrs} class="icon icon--${name}">${path}</svg>`;
  }

  function categoryIcon(slug) {
    const map = {
      "coding-agents": "code",
      "research-agents": "search",
      "browser-agents": "globe",
      "general-purpose-agents": "sparkles",
      "voice-agents": "mic",
      "workflow-agents": "workflow",
      "sandbox-platforms": "terminal",
      "fullstack-agents": "layers",
      "multimedia-generation": "image",
      "personal-assistants": "notebook",
      "task-agents": "checks",
    };
    return map[slug] || "sparkles";
  }

  // ── Filter helpers ──────────────────────────────────────
  function filterTools(tools, state) {
    const q = state.q.trim().toLowerCase();
    let out = tools.filter((t) => {
      if (state.categories.length && !state.categories.includes(t.category_slug)) return false;
      if (state.types.length && !state.types.includes(t.free_tier_type)) return false;
      if (state.tags.length && !state.tags.every((tag) => (t.tags || []).includes(tag))) return false;
      if (q) {
        const hay = [
          t.name,
          t.description,
          t.free_tier,
          t.location,
          (t.tags || []).join(" "),
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const sort = state.sort || "newest";
    if (sort === "az") {
      out = out.slice().sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "featured") {
      out = out.slice().sort((a, b) => {
        const af = a.featured ? 1 : 0;
        const bf = b.featured ? 1 : 0;
        if (af !== bf) return bf - af;
        return (a._index || 0) - (b._index || 0);
      });
    }
    return out;
  }

  function allTagsLimited(limit) {
    const set = new Set();
    TOOLS.forEach((t) => (t.tags || []).forEach((tag) => set.add(tag)));
    return Array.from(set).sort().slice(0, limit || 16);
  }

  // ── Render helpers ──────────────────────────────────────
  function ftBadge(type, size) {
    const cls = FT_CLASS[type] || "ft--free-plan";
    return `<span class="ft-badge ${size === "md" ? "ft-badge--md" : ""} ${cls}">
      <span class="ft-badge__dot"></span>${escape(type)}
    </span>`;
  }

  function toolCard(tool, variant) {
    const featured = variant === "featured";
    const cat = CATEGORY_BY_SLUG[tool.category_slug];
    const tagsToShow = (tool.tags || []).slice(0, featured ? 3 : 2);
    return `
      <a href="${urlFor(`/tool/${tool.slug}/`)}" class="card ${featured ? "card--featured" : ""}">
        <div class="card__head">
          <div class="card__main">
            <span class="card__icon">${icon(categoryIcon(tool.category_slug), 16)}</span>
            <div style="min-width:0">
              <div class="card__name">${escape(tool.name)} <span style="font-size:0.85em">${escape(LOCATION_FLAG[tool.location] || "")}</span></div>
              <div class="card__sub">${escape(cat ? cat.category : "")}</div>
            </div>
          </div>
          <span class="card__arrow">${icon("arrowUpRight", 16)}</span>
        </div>
        <p class="card__desc">${escape(tool.description)}</p>
        <div class="card__footer">
          ${ftBadge(tool.free_tier_type)}
          ${tagsToShow.map((t) => `<span class="tag">${escape(t)}</span>`).join("")}
        </div>
      </a>
    `;
  }

  function categoryCard(cat) {
    const count = (cat.agents || []).length;
    return `
      <a href="${urlFor(`/category/${cat.slug}/`)}" class="card">
        <div class="card__head">
          <span class="card__icon card__icon--lg">${icon(categoryIcon(cat.slug), 20)}</span>
          <span class="card__arrow">${icon("arrowUpRight", 16)}</span>
        </div>
        <div style="margin-top:0.75rem">
          <h3 style="font-weight:600;letter-spacing:-0.01em">${escape(cat.category)}</h3>
          <p class="card__desc" style="margin-top:0.25rem">${escape(cat.description || "")}</p>
        </div>
        <div class="card__count">${count} ${count === 1 ? "tool" : "tools"}</div>
      </a>
    `;
  }

  // ── Header / Footer ─────────────────────────────────────
  function header(activePath) {
    const isActive = (item) => {
      if (item.scrollTo) return false; // Categories anchor is never the "active" page.
      if (item.to === "/") return activePath === "/";
      const itemPath = normalizeRoutePath(item.to);
      return activePath === itemPath || activePath.startsWith(itemPath + "/");
    };
    const navLink = (n, cls) => {
      const scrollAttr = n.scrollTo ? ` data-scroll-to="${escape(n.scrollTo)}"` : "";
      return `<a href="${urlFor(n.to)}" class="${cls} ${isActive(n) ? "is-active" : ""}"${scrollAttr}>${escape(n.label)}</a>`;
    };
    return `
      <header class="site-header">
        <div class="container site-header__row">
          <a href="${urlFor("/")}" class="brand" aria-label="Awesome Free GenAI home">
            <span class="brand__mark">${icon("logo", 16)}</span>
            <span>Awesome Free <span class="mono">GenAI</span></span>
          </a>
          <nav class="nav" aria-label="Primary">
            ${NAV.map((n) => navLink(n, "nav__link")).join("")}
          </nav>
          <div class="header-actions">
            <a href="${urlFor("/submit/")}" class="btn btn--primary btn--sm header-cta">Suggest a tool</a>
            <button type="button" class="theme-toggle" data-action="toggle-theme" aria-label="Toggle theme">
              <span class="icon-sun">${icon("sun", 16)}</span>
              <span class="icon-moon">${icon("moon", 16)}</span>
            </button>
            <button type="button" class="menu-btn" data-action="toggle-menu" aria-label="Toggle navigation" aria-expanded="${mobileNavOpen}">
              ${icon(mobileNavOpen ? "close" : "menu", 16)}
            </button>
          </div>
        </div>
        ${mobileNavOpen
          ? `<nav class="mobile-nav" aria-label="Mobile">
              <div class="container mobile-nav__inner">
                ${NAV.map((n) => navLink({ ...n, label: n.label }, "mobile-nav__link")).join("")}
              </div>
            </nav>`
          : ""}
      </header>
    `;
  }

  function footer() {
    const featured = DATA.slice(0, 6);
    return `
      <footer class="site-footer">
        <div class="container site-footer__grid">
          <div>
            <a href="${urlFor("/")}" class="brand">
              <span class="brand__mark">${icon("logo", 16)}</span>
              <span>Awesome Free <span class="mono">GenAI</span></span>
            </a>
            <p class="site-footer__about">A community-curated directory of generative AI tools with genuinely usable free tiers.</p>
            <a href="${GITHUB_URL}" target="_blank" rel="noopener" class="site-footer__github">${icon("github", 14)} Contribute on GitHub</a>
          </div>
          <div>
            <h4>Categories</h4>
            <ul>
              ${featured.map((c) => `<li><a href="${urlFor(`/category/${c.slug}/`)}">${escape(c.category)}</a></li>`).join("")}
            </ul>
          </div>
          <div>
            <h4>Directory</h4>
            <ul>
              <li><a href="${urlFor("/tools/")}">All tools</a></li>
              <li><a href="${urlFor("/submit/")}">Suggest a tool</a></li>
              <li><a href="${urlFor("/about/")}">About</a></li>
            </ul>
          </div>
        </div>
        <div class="container site-footer__bottom">
          <p>© ${new Date().getFullYear()} Awesome Free GenAI. Curated by the community.</p>
          <p class="mono">Built with care · MIT</p>
        </div>
      </footer>
    `;
  }

  // ── Pages ───────────────────────────────────────────────
  function pageHome() {
    const featured = TOOLS.filter((t) => t.featured).slice(0, 4);
    const featuredList = featured.length ? featured : TOOLS.slice(0, 4);
    const recent = TOOLS.slice(0, 6);
    return `
      <section class="hero">
        <div class="container hero__inner">
          <div class="hero__pill">
            <span class="dot"></span>
            ${TOOLS.length} curated tools across ${DATA.length} categories
          </div>
          <h1 class="hero__title">Free generative AI, <em>actually free.</em></h1>
          <p class="hero__subtitle">A hand-picked directory of generative AI tools with genuinely usable free tiers. No 7-day trials masquerading as “free.” No surprise paywalls.</p>
          <form class="hero__search search search--lg" role="search" data-action="hero-search">
            <span class="search__icon">${icon("search", 20)}</span>
            <input class="search__input" type="search" name="q" placeholder="Try “coding”, “voice”, “open source”…" aria-label="Search">
          </form>
          <div class="hero__popular">
            <span>Popular:</span>
            ${POPULAR_QUERIES.map((t) => `<button type="button" data-action="popular-query" data-q="${escape(t)}">${escape(t)}</button>`).join("")}
          </div>
        </div>
      </section>

      <section class="container section">
        ${sectionHead({
          eyebrow: "Editor’s picks",
          title: "Featured this month",
          desc: "A few standouts our curators are recommending right now.",
          action: `<a href="${urlFor("/tools/", { sort: "featured" })}" class="section-link">View all ${icon("arrowRight", 14)}</a>`,
        })}
        <div class="grid grid--featured">
          ${featuredList.map((t) => toolCard(t, "featured")).join("")}
        </div>
      </section>

      <section id="categories" class="container section">
        ${sectionHead({
          eyebrow: "Browse",
          title: "Eleven categories. One promise.",
          desc: "Every tool listed here has a free tier you can actually use — no credit card surprise.",
        })}
        <div class="grid grid--categories">
          ${DATA.map(categoryCard).join("")}
        </div>
      </section>

      <section class="container section">
        ${sectionHead({
          eyebrow: "Fresh",
          title: "Recently added",
          desc: "The newest additions to the directory.",
          action: `<a href="${urlFor("/tools/")}" class="section-link">See all ${icon("arrowRight", 14)}</a>`,
        })}
        <div class="grid grid--cards">
          ${recent.map((t) => toolCard(t)).join("")}
        </div>
      </section>

      <section class="container section">
        <div class="grid grid--principles">
          ${[
            { icon: "shield", title: "Free tier verified", copy: "Every entry has a free tier you can actually use." },
            { icon: "sparkles", title: "Editorially curated", copy: "Tools have to be genuinely good to make it in." },
            { icon: "heart", title: "Community-maintained", copy: "Anyone can submit a tool or flag stale info." },
          ].map((p) => `
            <div class="principle">
              <span class="principle__icon">${icon(p.icon, 18)}</span>
              <h3 class="principle__title">${escape(p.title)}</h3>
              <p class="principle__copy">${escape(p.copy)}</p>
            </div>
          `).join("")}
        </div>
      </section>

      <section class="container" style="padding-bottom:5rem">
        <div class="cta">
          <h2 class="cta__title">Know a tool we’re missing?</h2>
          <p class="cta__sub">Suggest it. If it’s good and the free tier is real, we’ll add it.</p>
          <div class="cta__row">
            <a href="${urlFor("/submit/")}" class="btn btn--primary btn--lg">Suggest a tool</a>
            <a href="${urlFor("/tools/")}" class="btn btn--outline btn--lg">Browse the directory</a>
          </div>
        </div>
      </section>
    `;
  }

  function sectionHead({ eyebrow, title, desc, action }) {
    return `
      <div class="section-head">
        <div>
          ${eyebrow ? `<div class="eyebrow">${escape(eyebrow)}</div>` : ""}
          <h2 class="section-title">${escape(title)}</h2>
          ${desc ? `<p class="section-desc">${escape(desc)}</p>` : ""}
        </div>
        ${action || ""}
      </div>
    `;
  }

  function pageBrowse(fixedCategorySlug) {
    const { params } = parseHash();
    const q = params.get("q") || "";
    const sort = params.get("sort") || "newest";
    const urlCategories = listFromParam(params.get("category"));
    const urlTypes = listFromParam(params.get("type"));
    const urlTags = listFromParam(params.get("tag"));
    const activeCategories = fixedCategorySlug ? [fixedCategorySlug] : urlCategories;

    const results = filterTools(TOOLS, {
      q,
      categories: activeCategories,
      types: urlTypes,
      tags: urlTags,
      sort,
    });

    const titleCategory = fixedCategorySlug ? CATEGORY_BY_SLUG[fixedCategorySlug] : null;
    const hasActive = (!fixedCategorySlug && urlCategories.length) || urlTypes.length || urlTags.length || q;

    const popularTags = allTagsLimited(16);

    return `
      <div class="container section section--snug">
        <div class="page-head">
          ${titleCategory
            ? `<a href="${urlFor("/tools/")}" style="font-size:0.875rem;color:var(--muted-foreground);display:inline-flex;align-items:center;gap:0.25rem">← All tools</a>
               <div style="margin-top:0.75rem;display:flex;align-items:center;gap:0.75rem">
                 <span class="detail-header__icon" style="width:2.75rem;height:2.75rem;font-size:1.125rem">${icon(categoryIcon(titleCategory.slug), 20)}</span>
                 <div>
                   <h1 class="page-title">${escape(titleCategory.category)}</h1>
                   <p style="font-size:0.875rem;color:var(--muted-foreground)">${escape(titleCategory.description || "")}</p>
                 </div>
               </div>`
            : `<h1 class="page-title">Browse all tools</h1>
               <p class="page-sub">Filter by category, free-tier type, or tag. The URL stays in sync — share it freely.</p>`}
        </div>

        <div class="toolbar">
          <div class="toolbar__search">
            <div class="search">
              <span class="search__icon">${icon("search", 16)}</span>
              <input class="search__input" id="browse-q" type="search" placeholder="Search this directory…" value="${escape(q)}" aria-label="Search">
            </div>
          </div>
          <div class="toolbar__actions">
            <select class="select toolbar__sort" data-action="set-sort">
              <option value="newest" ${sort === "newest" ? "selected" : ""}>Newest</option>
              <option value="az" ${sort === "az" ? "selected" : ""}>A–Z</option>
              <option value="featured" ${sort === "featured" ? "selected" : ""}>Featured first</option>
            </select>
          </div>
        </div>

        ${hasActive
          ? `<div class="chips">
              <span class="chips__label">Active:</span>
              ${q ? chip(`“${q}”`, `q`, q) : ""}
              ${!fixedCategorySlug ? urlCategories.map((c) => chip((CATEGORY_BY_SLUG[c] || {}).category || c, "category", c)).join("") : ""}
              ${urlTypes.map((t) => chip(t, "type", t)).join("")}
              ${urlTags.map((t) => chip(`#${t}`, "tag", t)).join("")}
              <button type="button" class="chips__clear" data-action="clear-filters">Clear all</button>
            </div>`
          : ""}

        <div class="browse-layout">
          <aside class="sidebar">
            <div class="sidebar__inner">
              ${renderFilters({ activeCategories, urlTypes, urlTags, popularTags, hideCategory: !!fixedCategorySlug })}
            </div>
          </aside>

          <div>
            <div class="results-meta">${results.length} ${results.length === 1 ? "tool" : "tools"}</div>
            ${results.length === 0
              ? `<div class="empty">
                  <h3 class="empty__title">No tools match those filters</h3>
                  <p class="empty__copy">Try removing a filter, broadening your search, or <a href="${urlFor("/submit/")}" style="text-decoration:underline">suggest a tool</a> we’re missing.</p>
                  <div class="empty__actions"><button class="btn btn--outline" data-action="clear-filters">Clear filters</button></div>
                </div>`
              : `<div class="grid grid--cards" style="margin-top:0">${results.map((t) => toolCard(t)).join("")}</div>`}
          </div>
        </div>
      </div>
    `;
  }

  function chip(label, key, value) {
    return `<span class="chip">
      ${escape(label)}
      <button type="button" class="chip__close" data-action="remove-chip" data-key="${escape(key)}" data-value="${escape(value)}" aria-label="Remove filter">${icon("close", 12)}</button>
    </span>`;
  }

  function renderFilters({ activeCategories, urlTypes, urlTags, popularTags, hideCategory }) {
    return `
      <div class="filters">
        ${hideCategory ? "" : `
          <section class="filter-section">
            <h3>Category</h3>
            <div class="filter-list">
              ${DATA.map((c) => `
                <label class="filter-row">
                  <input type="checkbox" class="checkbox" data-action="toggle-filter" data-key="category" data-value="${escape(c.slug)}" ${activeCategories.includes(c.slug) ? "checked" : ""}>
                  <span>${escape(c.category)}</span>
                </label>
              `).join("")}
            </div>
          </section>
          <hr class="separator">
        `}

        <section class="filter-section">
          <h3>Free-tier type</h3>
          <div class="filter-list">
            ${FREE_TIER_TYPES.map((t) => `
              <label class="filter-row">
                <input type="checkbox" class="checkbox" data-action="toggle-filter" data-key="type" data-value="${escape(t.type)}" ${urlTypes.includes(t.type) ? "checked" : ""}>
                <span>${escape(t.type)}</span>
              </label>
            `).join("")}
          </div>
        </section>

        ${popularTags.length ? `
          <hr class="separator">
          <section class="filter-section">
            <h3>Popular tags</h3>
            <div class="tag-list">
              ${popularTags.map((tag) => `
                <button type="button" class="tag-btn ${urlTags.includes(tag) ? "is-active" : ""}" data-action="toggle-filter" data-key="tag" data-value="${escape(tag)}">${escape(tag)}</button>
              `).join("")}
            </div>
          </section>
        ` : ""}
      </div>
    `;
  }

  function pageToolDetail(slug) {
    const tool = TOOL_BY_SLUG[slug];
    if (!tool) return pageNotFound();
    const cat = CATEGORY_BY_SLUG[tool.category_slug];
    const similar = TOOLS.filter((t) => t.slug !== tool.slug && t.category_slug === tool.category_slug).slice(0, 3);

    return `
      <article class="container section section--snug">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a href="${urlFor("/")}">Home</a>
          <span class="breadcrumb__sep">${icon("chevronRight", 12)}</span>
          <a href="${urlFor(`/category/${tool.category_slug}/`)}">${escape(cat ? cat.category : "")}</a>
          <span class="breadcrumb__sep">${icon("chevronRight", 12)}</span>
          <span class="breadcrumb__page">${escape(tool.name)}</span>
        </nav>

        <header class="detail-header">
          <div class="detail-header__main">
            <span class="detail-header__icon">${icon(categoryIcon(tool.category_slug), 24)}</span>
            <div>
              <h1 class="detail-header__title">${escape(tool.name)} <span style="font-size:0.7em">${escape(LOCATION_FLAG[tool.location] || "")}</span></h1>
              <p class="detail-header__desc">${escape(tool.description)}</p>
              <div class="detail-header__meta">
                <a href="${urlFor(`/category/${tool.category_slug}/`)}" class="detail-cat-chip">
                  ${icon(categoryIcon(tool.category_slug), 12)} ${escape(cat ? cat.category : "")}
                </a>
                ${ftBadge(tool.free_tier_type, "md")}
                ${tool.location ? `<span class="tag">${escape(tool.location)}</span>` : ""}
              </div>
            </div>
          </div>
          <div class="detail-header__actions">
            <a href="${escape(tool.url)}" target="_blank" rel="noopener" class="btn btn--primary btn--lg">
              Visit website ${icon("externalLink", 14)}
            </a>
            <a href="${reportOutdatedUrl(tool)}" target="_blank" rel="noopener" class="btn btn--outline btn--lg">
              ${icon("alert", 14)} Report outdated
            </a>
          </div>
        </header>

        <div class="detail-body">
          <div>
            <section class="detail-section">
              <h2>About</h2>
              <p class="detail-prose">${escape(tool.description)}</p>
            </section>
            ${similar.length ? `
              <section class="detail-section">
                <h2>Similar tools</h2>
                <div class="grid grid--cards" style="margin-top:0">
                  ${similar.map((t) => toolCard(t)).join("")}
                </div>
              </section>
            ` : ""}
          </div>

          <aside class="detail-aside">
            <div class="aside-card">
              <div class="aside-card__row">
                <h3>What’s free</h3>
                ${ftBadge(tool.free_tier_type)}
              </div>
              <p class="aside-card__body">${escape(tool.free_tier || "Details to come.")}</p>
            </div>
            <div class="aside-card">
              <h3>Details</h3>
              <dl class="detail-dl">
                <div>
                  <dt>Website</dt>
                  <dd><a href="${escape(tool.url)}" target="_blank" rel="noopener">${escape(hostname(tool.url))}</a></dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>${escape(tool.free_tier_type)}</dd>
                </div>
                ${tool.location ? `
                  <div>
                    <dt>Location</dt>
                    <dd>${escape(tool.location)}</dd>
                  </div>
                ` : ""}
                <div>
                  <dt>Category</dt>
                  <dd><a href="${urlFor(`/category/${tool.category_slug}/`)}">${escape(cat ? cat.category : "")}</a></dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </article>
    `;
  }

  function pageSubmit() {
    return `
      <div class="container section section--snug">
        <div style="max-width:64rem;margin:0 auto">
          <header class="page-head">
            <h1 class="page-title">Suggest a tool</h1>
            <p class="page-sub">Help us keep the directory fresh. If the tool has a real free tier and we missed it, we want to know.</p>
          </header>

          <div class="submit-layout">
            <form class="form" data-action="submit-form" novalidate>
              <div class="field-row">
                <div class="field">
                  <label class="label" for="f-name">Tool name <span style="color:var(--destructive)">*</span></label>
                  <input class="input" id="f-name" name="name" placeholder="e.g. Cursor" required>
                </div>
                <div class="field">
                  <label class="label" for="f-url">Website URL <span style="color:var(--destructive)">*</span></label>
                  <input class="input" id="f-url" name="url" type="url" placeholder="https://example.com" required>
                </div>
              </div>

              <div class="field-row">
                <div class="field">
                  <label class="label" for="f-cat">Category <span style="color:var(--destructive)">*</span></label>
                  <select class="select" id="f-cat" name="category" required>
                    <option value="">Pick a category</option>
                    ${DATA.map((c) => `<option value="${escape(c.slug)}">${escape(c.category)}</option>`).join("")}
                  </select>
                </div>
                <div class="field">
                  <label class="label" for="f-ft">Free-tier type <span style="color:var(--destructive)">*</span></label>
                  <select class="select" id="f-ft" name="free_tier_type" required>
                    <option value="">What’s the free offering?</option>
                    ${FREE_TIER_TYPES.map((t) => `<option value="${escape(t.type)}">${escape(t.type)}</option>`).join("")}
                  </select>
                </div>
              </div>

              <div class="field">
                <label class="label" for="f-desc">Short description <span style="color:var(--destructive)">*</span></label>
                <textarea class="textarea" id="f-desc" name="description" rows="2" placeholder="One sentence — what does this tool do?" required></textarea>
                <p class="field-hint" id="f-desc-hint">0/160 characters</p>
              </div>

              <div class="field">
                <label class="label" for="f-free">What’s free? <span style="color:var(--destructive)">*</span></label>
                <textarea class="textarea" id="f-free" name="free_tier" rows="4" placeholder="e.g. Free plan includes 10k credits/month, 3 voice clones, full API access." required></textarea>
                <p class="field-hint">Be specific: credits, limits, what’s gated.</p>
              </div>

              <div class="field-row">
                <div class="field">
                  <label class="label" for="f-loc">Location</label>
                  <input class="input" id="f-loc" name="location" placeholder="e.g. USA, France, Open Source">
                </div>
                <div class="field">
                  <label class="label" for="f-email">Your email (optional)</label>
                  <input class="input" id="f-email" name="email" type="email" placeholder="you@example.com">
                </div>
              </div>

              <div class="form-actions">
                <button type="reset" class="btn btn--outline">Reset</button>
                <button type="submit" class="btn btn--primary">Open a pull request</button>
              </div>
            </form>

            <aside class="submit-aside">
              <div class="aside-card">
                <div class="aside-card__row">
                  ${icon("list", 16)}
                  <h3 style="text-transform:none;letter-spacing:-0.01em;font-size:0.95rem;color:var(--foreground);font-weight:600">What makes a good fit</h3>
                </div>
                <ul class="aside-list">
                  <li>The free tier is real and usable — not just a 7-day trial.</li>
                  <li>Generative or agentic AI is core to the product, not a bolt-on.</li>
                  <li>The tool is publicly available — no waitlists or invite-only.</li>
                  <li>Pricing, limits, and value are clear and not deceptive.</li>
                  <li>You’ve actually used it (or have a credible recommendation).</li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </div>
    `;
  }

  function pageAbout() {
    return `
      <div class="container section">
        <div class="simple">
          <h1 class="page-title">About</h1>
          <div style="margin-top:1.5rem;line-height:1.7;color:color-mix(in srgb, var(--foreground) 90%, transparent)">
            <p><strong>Awesome Free GenAI</strong> is a curated directory of generative AI tools that ship with genuinely usable free tiers. It exists because the word “free” has been quietly hollowed out in AI — too many “free” tools are seven-day trials, demos with a watermark, or sandboxes that won’t let you save your work.</p>
            <p>We list tools across multiple categories — coding agents, voice agents, full-stack generators, multimedia models, and more — and clearly label exactly what kind of free you’re getting: a free plan or free credits.</p>
            <p>Submissions are reviewed by humans. Tools that quietly nuke their free tier get re-labeled or removed.</p>
          </div>
          <div style="margin-top:2rem;display:flex;gap:0.75rem">
            <a href="${urlFor("/tools/")}" class="btn btn--primary">Browse the directory</a>
            <a href="${urlFor("/submit/")}" class="btn btn--outline">Suggest a tool</a>
          </div>
        </div>
      </div>
    `;
  }

  function pageNotFound() {
    return `
      <div class="container section" style="text-align:center">
        <p class="eyebrow">404</p>
        <h1 class="page-title" style="margin-top:0.5rem">Page not found</h1>
        <p class="page-sub">The page you’re looking for doesn’t exist, or never did.</p>
        <div style="margin-top:1.5rem;display:flex;justify-content:center;gap:0.75rem">
          <a href="${urlFor("/")}" class="btn btn--primary">Back home</a>
          <a href="${urlFor("/tools/")}" class="btn btn--outline">Browse tools</a>
        </div>
      </div>
    `;
  }

  // ── Router ───────────────────────────────────────────────
  function routeView() {
    const { segments } = parseHash();
    if (segments.length === 0) return { view: pageHome(), path: "/" };
    const head = segments[0];
    if (head === "tools") return { view: pageBrowse(null), path: "/tools" };
    if (head === "category" && segments[1]) {
      return CATEGORY_BY_SLUG[segments[1]]
        ? { view: pageBrowse(segments[1]), path: "/category/" + segments[1] }
        : { view: pageNotFound(), path: "/404" };
    }
    if (head === "tool" && segments[1]) return { view: pageToolDetail(segments[1]), path: "/tool/" + segments[1] };
    if (head === "submit") return { view: pageSubmit(), path: "/submit" };
    if (head === "about") return { view: pageAbout(), path: "/about" };
    return { view: pageNotFound(), path: "/404" };
  }

  function render() {
    const root = $("app");
    if (!root) return;
    if (DATA.length === 0) {
      root.innerHTML = `${header("/")}\n<main><div class="loading">Loading…</div></main>\n${footer()}`;
      return;
    }
    const { view, path } = routeView();
    root.innerHTML = `${header(path)}\n<main>${view}</main>\n${footer()}`;
    document.title = pageTitle(path);
    if (pendingScrollTo) {
      const id = pendingScrollTo;
      pendingScrollTo = null;
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        else window.scrollTo(0, 0);
      });
    } else {
      window.scrollTo(0, 0);
    }
  }

  function pageTitle(path) {
    const base = "Awesome Free GenAI";
    if (path === "/" || path === "") return base;
    if (path === "/tools") return `Browse · ${base}`;
    if (path === "/submit") return `Suggest a tool · ${base}`;
    if (path === "/about") return `About · ${base}`;
    if (path.startsWith("/category/")) {
      const cat = CATEGORY_BY_SLUG[path.split("/")[2]];
      return cat ? `${cat.category} · ${base}` : base;
    }
    if (path.startsWith("/tool/")) {
      const t = TOOL_BY_SLUG[path.split("/")[2]];
      return t ? `${t.name} · ${base}` : base;
    }
    return base;
  }

  // ── Event delegation ────────────────────────────────────
  function onAppClick(e) {
    const cleanLink = e.target.closest("a[href]");
    if (cleanLink && !cleanLink.target && isInternalUrl(cleanLink.href) && !cleanLink.hasAttribute("data-scroll-to")) {
      e.preventDefault();
      mobileNavOpen = false;
      navigate(cleanLink.href);
      return;
    }

    const scrollLink = e.target.closest("[data-scroll-to]");
    if (scrollLink) {
      e.preventDefault();
      const id = scrollLink.getAttribute("data-scroll-to");
      mobileNavOpen = false;
      const onHome = parseHash().path === "/";
      if (onHome) {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        pendingScrollTo = id;
        navigate(urlFor("/"));
      }
      return;
    }

    const target = e.target.closest("[data-action]");
    if (!target) return;
    const action = target.getAttribute("data-action");

    if (action === "toggle-theme") {
      applyTheme(currentTheme() === "dark" ? "light" : "dark");
      return;
    }
    if (action === "toggle-menu") {
      mobileNavOpen = !mobileNavOpen;
      render();
      return;
    }
    if (action === "close-menu") {
      mobileNavOpen = false;
      render();
      return;
    }
    if (action === "popular-query") {
      e.preventDefault();
      const q = target.getAttribute("data-q") || "";
      navigate(urlFor("/tools/", { q }));
      return;
    }
    if (action === "remove-chip") {
      const key = target.getAttribute("data-key");
      const value = target.getAttribute("data-value");
      if (key === "q") updateQuery({ q: null }, { replace: true });
      else toggleInQuery(key, value);
      return;
    }
    if (action === "toggle-filter") {
      // checkbox/tag-button toggle
      const key = target.getAttribute("data-key");
      const value = target.getAttribute("data-value");
      toggleInQuery(key, value);
      return;
    }
    if (action === "clear-filters") {
      const { path, params } = parseHash();
      const sort = params.get("sort");
      const next = new URLSearchParams();
      if (sort && sort !== "newest") next.set("sort", sort);
      history.replaceState(null, "", buildHash(path, next));
      render();
      return;
    }
  }

  function onAppInput(e) {
    if (e.target && e.target.id === "browse-q") {
      const v = e.target.value;
      // Preserve caret/focus across re-render by remembering the input.
      pendingFocus = { id: "browse-q", selectionStart: e.target.selectionStart };
      updateQuery({ q: v || null }, { replace: true });
      return;
    }
    if (e.target && e.target.id === "f-desc") {
      const hint = document.getElementById("f-desc-hint");
      if (hint) hint.textContent = e.target.value.length + "/160 characters";
    }
  }

  function onAppChange(e) {
    const target = e.target.closest("[data-action='set-sort']");
    if (target) {
      const v = target.value;
      updateQuery({ sort: v === "newest" ? null : v }, { replace: true });
    }
  }

  function onAppSubmit(e) {
    const form = e.target;
    if (form.getAttribute("data-action") === "submit-form") {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      if (!data.name || !data.url || !data.category || !data.free_tier_type || !data.description || !data.free_tier) {
        toast("Please fill in the required fields.", "error");
        return;
      }
      // No backend — point the user at GitHub with a prefilled issue.
      const body = encodeURIComponent(
        `**Tool name:** ${data.name}\n` +
          `**URL:** ${data.url}\n` +
          `**Category:** ${data.category}\n` +
          `**Free-tier type:** ${data.free_tier_type}\n` +
          `**Description:** ${data.description}\n` +
          `**What's free:** ${data.free_tier}\n` +
          (data.location ? `**Location:** ${data.location}\n` : "") +
          (data.email ? `**Submitter email:** ${data.email}\n` : ""),
      );
      const title = encodeURIComponent(`Add ${data.name}`);
      toast("Opening a new GitHub issue with your submission…", "success");
      window.open(`${GITHUB_URL}/issues/new?title=${title}&body=${body}`, "_blank", "noopener");
      return;
    }
    if (form.classList.contains("hero__search") || form.getAttribute("data-action") === "hero-search") {
      e.preventDefault();
      const input = form.querySelector("input[name='q']");
      const q = input ? input.value.trim() : "";
      navigate(q ? urlFor("/tools/", { q }) : urlFor("/tools/"));
    }
  }

  let pendingFocus = null;
  function restoreFocus() {
    if (!pendingFocus) return;
    const el = document.getElementById(pendingFocus.id);
    if (el) {
      el.focus();
      try {
        if (typeof pendingFocus.selectionStart === "number") {
          el.setSelectionRange(pendingFocus.selectionStart, pendingFocus.selectionStart);
        }
      } catch (e) {}
    }
    pendingFocus = null;
  }

  // ── Data load + boot ───────────────────────────────────
  async function loadData() {
    try {
      const resp = await fetch(ASSET_PREFIX + "data.json", { cache: "no-store" });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const raw = await resp.json();
      DATA = raw;
      TOOLS = [];
      TOOL_BY_SLUG = {};
      CATEGORY_BY_SLUG = {};
      let idx = 0;
      for (const cat of DATA) {
        CATEGORY_BY_SLUG[cat.slug] = cat;
        for (const agent of cat.agents || []) {
          const t = { ...agent, _index: idx++ };
          // Defensive defaults in case build.py wasn't re-run.
          if (!t.slug) t.slug = (t.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          if (!t.category_slug) t.category_slug = cat.slug;
          if (!t.free_tier_type) t.free_tier_type = "Free Plan";
          TOOLS.push(t);
          TOOL_BY_SLUG[t.slug] = t;
        }
      }
      render();
    } catch (err) {
      console.error("Failed to load data.json:", err);
      const root = $("app");
      if (root) {
        root.innerHTML = `${header("/")}\n<main><div class="container section"><div class="empty"><h3 class="empty__title">Couldn’t load the directory</h3><p class="empty__copy">Try refreshing the page. If the issue persists, the build may not have completed.</p></div></div></main>\n${footer()}`;
      }
    }
  }

  function init() {
    // Initial theme is already applied by the inline script in <head>; sync via storage.
    document.addEventListener("click", onAppClick);
    document.addEventListener("input", onAppInput);
    document.addEventListener("change", onAppChange);
    document.addEventListener("submit", onAppSubmit);
    window.addEventListener("popstate", () => {
      mobileNavOpen = false;
      render();
      restoreFocus();
    });
    window.addEventListener("hashchange", () => {
      mobileNavOpen = false;
      render();
      restoreFocus();
    });
    // Re-focus search input after re-render
    const mo = new MutationObserver(restoreFocus);
    const root = $("app");
    if (root) mo.observe(root, { childList: true, subtree: true });
    loadData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
