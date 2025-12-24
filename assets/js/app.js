// assets/js/app.js
(function () {
  // =======================
  // TOAST SYSTEM (top-right, auto-styled)
  // =======================
  function getToastStack() {
    let stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }
    return stack;
  }

  function showToast(message, type = "info", ms = 3000) {
    const stack = getToastStack();
    const t = document.createElement("div");
    t.className = `toast toast-${type}`;
    t.innerHTML = `
      <div class="toast-row">
        <div class="toast-msg">${message}</div>
        <button class="toast-close" aria-label="Close">&times;</button>
      </div>
    `;
    stack.appendChild(t);

    // animate in
    requestAnimationFrame(() => t.classList.add("show"));

    // close handlers
    const closer = t.querySelector(".toast-close");
    const remove = () => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 250);
    };
    closer.addEventListener("click", remove);
    if (ms > 0) setTimeout(remove, ms);
  }

  // =======================
  // LOCAL STORAGE KEYS (keep for requests/contacts)
  // =======================
  const LS = {
    plugins: "fm_plugins",
    categories: "fm_cats",
    requests: "fm_requests",
    contacts: "fm_contacts",
  };

  // =======================
  // BACKEND CONFIG + API LAYER
  // =======================
  const IS_LOCAL = ["localhost", "127.0.0.1", "::1"].includes(
    location.hostname
  );
  const API_BASE = IS_LOCAL
    ? `http://${location.hostname}:5000/api`
    : "https://fmp-backend-wrdc.onrender.com/api";

  const PLUGINS_URL = `${API_BASE}/plugins`;

  // Unified fetch that matches ApiResponse { success, data, meta? }
  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      credentials: "include", // send cookie for auth-protected routes
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false || json.ok === false) {
      const msg = json.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  }

  // Backend store for plugins
  const Store = {
    async list({ q, cat, sub, tags, minRating } = {}) {
      const url = new URL(PLUGINS_URL);
      if (q) url.searchParams.set("q", q);
      if (cat) url.searchParams.set("category", cat);
      if (sub) url.searchParams.set("subcategory", sub);
      if (tags) url.searchParams.set("tags", tags);
      if (minRating) url.searchParams.set("minRating", minRating);
      const resp = await api("GET", url.href);
      // backend may return array directly or { data: [...] } etc.
      return resp.data ?? resp;
    },
    async get(id) {
      const resp = await api("GET", `${PLUGINS_URL}/${id}`);
      return resp.data ?? resp;
    },
    async create(payload) {
      return api("POST", PLUGINS_URL, payload);
    },
    async update(id, payload) {
      return api("PATCH", `${PLUGINS_URL}/${id}`, payload);
    },
    async softDelete(id) {
      return api("DELETE", `${PLUGINS_URL}/${id}`);
    },
    async restore(id) {
      return api("POST", `${PLUGINS_URL}/${id}/restore`);
    },
    async inc(id, field) {
      const p = await Store.get(id);
      const next = { [field]: (p[field] || 0) + 1 };
      return Store.update(id, next);
    },
  };
  window.Store = Store;
  window.showToast = showToast;

  // =======================
  // CATEGORY STORE (backend)
  // =======================
  const CATEGORIES_URL = `${API_BASE}/categories`;

  const CategoryStore = {
    async list() {
      const resp = await api("GET", CATEGORIES_URL);
      return resp.data ?? resp;
    },
    async create(payload) {
      // payload example: { name: "Chrome extensions", subs: ["Youtube"] }
      return api("POST", CATEGORIES_URL, payload);
    },
    async update(id, payload) {
      return api("PATCH", `${CATEGORIES_URL}/${id}`, payload);
    },
    async remove(id) {
      return api("DELETE", `${CATEGORIES_URL}/${id}`);
    },
  };
  window.CategoryStore = CategoryStore;

  // =======================
  // AUTH helpers (frontend)
  // =======================
  const Auth = {
    async login(email, password) {
      // unified login: env-admin OR DB user handled by backend /auth/login
      const resp = await api("POST", `${API_BASE}/auth/user-login`, {
        email,
        password,
      });
      return resp;
    },
    async register(name, email, password) {
      const resp = await api("POST", `${API_BASE}/auth/user-register`, {
        name,
        email,
        password,
      });
      return resp;
    },
    // Note: me() intentionally does a plain fetch so we can return null on
    // unauthenticated (instead of api() throwing).
    async me() {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return null;
        const json = await res.json().catch(() => null);
        return json;
      } catch (e) {
        return null;
      }
    },
    async logout() {
      try {
        await api("POST", `${API_BASE}/auth/logout`);
      } catch (e) {
        // ignore
      } finally {
        sessionStorage.removeItem("fm_user");
      }
    },
  };

  // =======================
  // NAVBAR: show Admin only for admin users
  // NOTE: made async so callers can await
  // =======================
  // Simple no-op admin visibility handler — always hide admin tab in navbar.
  // This removes any JS-controlled "admin" show/hide behavior while keeping
  // other admin-page protections intact.
  async function updateAdminNavVisibility() {
    try {
      const adminItem = document.querySelector(".admin-only");
      if (adminItem) {
        // ensure navbar never shows admin link
        adminItem.style.display = "none";
        // also remove it from tab order/accessibility
        adminItem.setAttribute("aria-hidden", "true");
        adminItem.tabIndex = -1;
      }
    } catch (e) {
      // noop — avoid throwing
    }
  }

  // make it callable from other code
  window.updateAdminNavVisibility = updateAdminNavVisibility;

  // initial check on page load
  updateAdminNavVisibility().catch(() => {});
  // =======================
  // IMMEDIATE ADMIN GATE (runs once on load)
  // If user opens admin.html directly, verify with backend and redirect to admin-login.html if not admin.
  // This runs early so admin UI isn't shown briefly to unauthenticated users.
  (async function immediateAdminGate() {
    try {
      const isAdminPage =
        location.pathname.endsWith("/admin.html") ||
        location.pathname.endsWith("admin.html");
      if (!isAdminPage) return;

      // Ask backend /auth/me (uses cookie) for authoritative info
      const res = await fetch(`${API_BASE}/auth/me`, {
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        // not authenticated -> force admin login
        location.replace("admin-login.html");
        return;
      }

      const me = await res.json().catch(() => ({}));
      const role =
        me?.user?.role || me?.role || me?.data?.role || me?.data?.user?.role;

      if (role !== "admin") {
        // not an admin -> redirect
        location.replace("admin-login.html");
        return;
      }

      // verified admin: set quick UI marker
      try {
        sessionStorage.setItem(
          "fm_user",
          JSON.stringify({
            email: me?.user?.email || me?.email || "",
            name: me?.user?.name || "Admin",
            role: "admin",
          })
        );
      } catch (e) {
        /* ignore storage errors */
      }

      // reveal admin UI (some pages rely on this attribute)
      document.body.setAttribute("data-auth", "ok");
    } catch (err) {
      console.warn("Immediate admin gate failed:", err);
      // Be conservative -> redirect to login
      try {
        location.replace("admin-login.html");
      } catch {}
    }
  })();

  // Helper to logout and ensure history doesn't allow back to admin page
  async function logoutAndRedirect() {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      // ignore network errors
      console.warn("logout request failed", err);
    } finally {
      try {
        sessionStorage.removeItem("fm_user");
      } catch {}
      try {
        window.refreshAuthBtn && window.refreshAuthBtn();
      } catch {}
      try {
        window.updateAdminNavVisibility && window.updateAdminNavVisibility();
      } catch {}
      // replace history entry so Back won't return to admin page
      location.replace("index.html");
    }
  }
  window.logoutAndRedirect = logoutAndRedirect;

  // -------------------------
  // AUTO-LOGOUT: when admin tab/window is closed or page hidden
  // -------------------------
  // Only run auto-logout logic on admin pages to avoid logging out regular users.
  (function enableAutoLogoutOnClose() {
    try {
      const isAdminPage =
        location.pathname.endsWith("/admin.html") ||
        location.pathname.endsWith("admin.html");
      if (!isAdminPage) return;

      // best-effort: use sendBeacon (works during unload) to call backend logout endpoint
      function doBackendLogout() {
        try {
          // Use sendBeacon so the request can complete during unload
          const url = `${API_BASE}/auth/logout`;
          // sendBeacon expects a Blob, ArrayBuffer, string or null
          if (navigator.sendBeacon) {
            navigator.sendBeacon(url, "");
          } else {
            // fallback: synchronous XHR (deprecated but works in some browsers during unload)
            const xhr = new XMLHttpRequest();
            xhr.open("POST", url, false);
            xhr.withCredentials = true;
            try {
              xhr.send(null);
            } catch (e) {
              /* ignore */
            }
          }
        } catch (e) {
          // ignore network errors
        }
      }

      // Clear client-side session storage and call backend logout
      function clearClientAndLogout() {
        try {
          sessionStorage.removeItem("fm_user");
        } catch (e) {}
        try {
          window.refreshAuthBtn && window.refreshAuthBtn();
        } catch (e) {}
        try {
          window.updateAdminNavVisibility && window.updateAdminNavVisibility();
        } catch (e) {}
        doBackendLogout();
      }

      // when the page is being unloaded (close / refresh / navigate away)
      window.addEventListener("beforeunload", function () {
        clearClientAndLogout();
        // do NOT call preventDefault — we only want the cleanup to run
      });

      // visibilitychange handles closing a tab (some browsers fire hidden before unload)
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") {
          // small delay-safe call
          clearClientAndLogout();
        }
      });

      // pageshow/pagehide for bfcache cases
      window.addEventListener("pagehide", function (ev) {
        if (ev.persisted) {
          // If page is entering bfcache we still want to clear admin on final unload
          clearClientAndLogout();
        }
      });
    } catch (err) {
      console.warn("Auto-logout init failed:", err);
    }
  })();

  // =======================
  // NAVBAR AUTH BUTTON (Sign In / Logout)
  // =======================
  (function setupAuthNav() {
    const authBtn = document.getElementById("navAuthBtn");
    if (!authBtn) return; // some pages may not have this

    function getCurrentUser() {
      const raw = sessionStorage.getItem("fm_user");
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    function refreshAuthBtn() {
      const user = getCurrentUser();
      authBtn.textContent = user ? "Logout" : "Sign In";
    }

    // initial label on page load
    refreshAuthBtn();

    // click -> either open modal or logout
    authBtn.addEventListener("click", async (e) => {
      e.preventDefault(); // avoid jumping to top with "#"

      const user = getCurrentUser();

      if (user) {
        // Already logged in → perform logout
        try {
          await logoutAndRedirect();
          showToast("Logged out", "info");
        } catch (err) {
          showToast("Logout failed: " + err.message, "error");
        } finally {
          // update nav label
          refreshAuthBtn();
          // hide Admin link (re-check backend / cookie)
          if (window.updateAdminNavVisibility) {
            // call it but don't await blocking UI (it is async)
            window.updateAdminNavVisibility();
          }
        }
      } else {
        // Not logged in → open sign in modal
        const modal = document.getElementById("signinModal");
        if (modal) {
          modal.setAttribute("aria-hidden", "false");
          // lock page scroll while modal is open
          document.body.classList.add("modal-open");
        }
      }
    });

    // 🔁 expose for other code (like login modal) to call
    window.refreshAuthBtn = refreshAuthBtn;
  })();

  // =======================
  // UTILITIES
  // =======================
  function $(s, ctx = document) {
    return ctx.querySelector(s);
  }
  function $all(s, ctx = document) {
    return Array.from(ctx.querySelectorAll(s));
  }
  function uid() {
    return "id_" + Math.random().toString(36).slice(2, 9);
  }
  function save(key, v) {
    localStorage.setItem(key, JSON.stringify(v));
  }
  function load(key, def) {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : def;
  }
  const params = new URLSearchParams(location.search);
  const fmt = (x) => (x ?? "").toString();
  const getId = (p) => p._id || p.id;
  function escapeHtml(str) {
    if (str === undefined || str === null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // =======================
  // ✨ Custom Confirm Modal
  // =======================
  function confirmModal(
    message,
    { okText = "Delete", cancelText = "Cancel", variant = "danger" } = {}
  ) {
    return new Promise((resolve) => {
      const modal = document.createElement("div");
      modal.className = "modal";
      modal.setAttribute("aria-hidden", "false");

      const panel = document.createElement("div");
      panel.className = "modal-panel";
      panel.innerHTML = `
        <button class="close" aria-label="Close">&times;</button>
        <h3 style="margin:0 0 10px;">Are you sure?</h3>
        <p class="muted" style="margin:0 0 16px;">${message}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn ghost" data-act="cancel">${cancelText}</button>
          <button class="btn" data-act="ok">${okText}</button>
        </div>
      `;
      modal.appendChild(panel);
      document.body.appendChild(modal);

      const okBtn = panel.querySelector('[data-act="ok"]');
      if (variant === "danger") {
        okBtn.style.background = "linear-gradient(180deg,#ff4d4f,#e11d48)";
        okBtn.style.boxShadow = "0 8px 20px rgba(225,29,72,.18)";
      }

      const cleanup = (val) => {
        modal.setAttribute("aria-hidden", "true");
        setTimeout(() => modal.remove(), 150);
        resolve(val);
      };

      panel
        .querySelector(".close")
        .addEventListener("click", () => cleanup(false));
      panel
        .querySelector('[data-act="cancel"]')
        .addEventListener("click", () => cleanup(false));
      okBtn.addEventListener("click", () => cleanup(true));
      modal.addEventListener("mousedown", (ev) => {
        if (ev.target === modal) cleanup(false);
      });
      document.addEventListener(
        "keydown",
        function esc(ev) {
          if (ev.key === "Escape") {
            document.removeEventListener("keydown", esc);
            cleanup(false);
          }
        },
        { once: true }
      );

      okBtn.focus();
    });
  }

  // =======================
  // DEFAULTS (OLD CATEGORY SEED REMOVED)
  // =======================
  // Categories now fully from backend

  // =======================
  // RENDERING HELPERS
  // =======================
  async function renderCategories(listElId = "categoryList", catSelectId) {
    const cats = await CategoryStore.list();
    const el = document.getElementById(listElId);

    if (el) {
      el.innerHTML = "";
      cats.forEach((c) => {
        const li = document.createElement("li");
        li.innerHTML = `<button class="link-btn" data-cat="${c.name}">${c.name}</button>`;
        el.appendChild(li);
      });
    }

    if (catSelectId) {
      const sel = document.getElementById(catSelectId);
      if (sel) {
        sel.innerHTML = '<option value="">Choose category</option>';
        cats.forEach((c) => sel.appendChild(new Option(c.name, c.name)));
      }
    }

    return cats; // important when we need categories later
  }

  // Build tag cloud from backend
  async function renderTagCloud(el) {
    if (!el) return;
    el.innerHTML = "";
    try {
      const all = await Store.list();
      const tagCount = {};
      all.forEach((p) =>
        (p.tags || []).forEach((t) => (tagCount[t] = (tagCount[t] || 0) + 1))
      );
      Object.keys(tagCount)
        .slice(0, 20)
        .forEach((t) => {
          const b = document.createElement("button");
          b.className = "tag";
          b.textContent = t;
          b.addEventListener(
            "click",
            () => (location.href = "listing.html?tag=" + encodeURIComponent(t))
          );
          el.appendChild(b);
        });
    } catch (e) {
      el.innerHTML = '<p class="muted">Tags unavailable</p>';
    }
  }

  // =======================
  // LISTING (BACKEND)
  // =======================
  async function listPlugins(containerId = "pluginsContainer", filter = {}) {
    const cont = document.getElementById(containerId);
    if (!cont) return;
    cont.innerHTML = '<p class="muted">Loading...</p>';

    try {
      const items = await Store.list({
        q: filter.q,
        cat: filter.cat,
        sub: filter.sub,
        tags: filter.tags,
        minRating: filter.minRating,
      });

      cont.innerHTML = "";
      if (!items.length) {
        cont.innerHTML = '<p class="muted">No plugins found.</p>';
        return;
      }

      items.forEach((it) => {
        const card = document.createElement("article");
        card.className = "card";
        const firstShot =
          (it.screenshots && it.screenshots[0] && it.screenshots[0].url) ||
          "https://placehold.co/400x220?text=Screenshot";
        const id = getId(it);
        card.innerHTML = `
          <a href="detail.html?id=${id}"><img src="${firstShot}" alt="" onerror="this.src='https://placehold.co/400x220?text=Screenshot'"></a>
          <h4><a href="detail.html?id=${id}">${it.title}</a></h4>
          <p class="muted">${it.desc}</p>
          <div class="muted category-name" style="margin-bottom:4px;">${
            it.category
          }${
          it.subcategory
            ? ' • <span class="muted">' + it.subcategory + "</span>"
            : ""
        }</div>
          <div class="meta-actions">
            <button data-act="heart" data-id="${id}">❤ ${
          it.hearts || 0
        }</button>
            <button data-act="like" data-id="${id}">👍 ${it.likes || 0}</button>
            <button data-act="ok" data-id="${id}">👌 ${it.oks || 0}</button>
            <a href="detail.html?id=${id}">View →</a>
          </div>`;
        cont.appendChild(card);
      });
    } catch (err) {
      cont.innerHTML = `<p class="error">Failed to load: ${err.message}</p>`;
    }
  }

  // =======================
  // GLOBAL REACTIONS (BACKEND)
  // =======================
  function isValidMongoId(id) {
    return typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
  }

  let reactionBusy = false;

  document.addEventListener("click", async function (e) {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;

    const act = btn.dataset.act;
    const id = btn.dataset.id;

    if (!isValidMongoId(id)) return;

    if (reactionBusy) return;
    reactionBusy = true;

    try {
      if (act === "heart") await Store.inc(id, "hearts");
      if (act === "like") await Store.inc(id, "likes");
      if (act === "ok") await Store.inc(id, "oks");

      if (document.getElementById("pluginsContainer")) {
        await listPlugins("pluginsContainer");
      }
      if (document.getElementById("listContainer")) {
        await listPlugins("listContainer", {
          q: document.querySelector("#listSearch")?.value,
          cat: document.querySelector("#categoryFilter")?.value,
          sub: document.querySelector("#subcatFilter")?.value,
        });
      }
      if (document.getElementById("pluginDetail")) {
        await renderDetailFromQuery();
      }
    } catch (err) {
      showToast("Action failed: " + err.message, "error");
    } finally {
      reactionBusy = false;
    }
  });

  // =======================
  // HOME SEARCH
  // =======================
  const searchForm = $("#searchForm");
  if (searchForm) {
    searchForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      const q = $("#searchInput").value.trim();
      location.href = "listing.html?q=" + encodeURIComponent(q);
    });
  }

  // =======================
  // REQUEST MODAL (LS) - unchanged
  // =======================
  const openRequestBtn = $("#openRequestBtn");
  const requestModal = $("#requestModal");
  if (openRequestBtn && requestModal) {
    openRequestBtn.addEventListener("click", () =>
      requestModal.setAttribute("aria-hidden", "false")
    );
    $("#closeRequest").addEventListener("click", () =>
      requestModal.setAttribute("aria-hidden", "true")
    );
    $("#requestForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      const docFile = $("#reqFile").files[0];
      const data = {
        id: uid(),
        text: $("#reqText").value,
        name: $("#reqName").value,
        email: $("#reqEmail").value,
        phone: $("#reqPhone").value,
        file: null,
        created: Date.now(),
      };
      if (docFile) {
        const reader = new FileReader();
        reader.onload = function () {
          data.file = reader.result;
          const arr = load(LS.requests, []);
          arr.push(data);
          save(LS.requests, arr);
          showToast("Request submitted", "success");
          requestModal.setAttribute("aria-hidden", "true");
          $("#requestForm").reset();
        };
        reader.onerror = function () {
          showToast("Failed to read file", "error");
        };
        reader.readAsDataURL(docFile);
      } else {
        const arr = load(LS.requests, []);
        arr.push(data);
        save(LS.requests, arr);
        showToast("Request submitted", "success");
        requestModal.setAttribute("aria-hidden", "true");
        $("#requestForm").reset();
      }
    });
  }

  // =======================
  // LISTING PAGE FILTER/SEARCH
  // =======================
  if ($("#listSearch")) {
    const q0 = new URLSearchParams(location.search).get("q") || "";
    $("#listSearch").value = q0;

    let searchTimer;
    $("#listSearch").addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        listPlugins("listContainer", { q: $("#listSearch").value });
      }, 400);
    });

    let cats = [];
    (async () => {
      cats = await renderCategories("", "categoryFilter");
    })();

    $("#categoryFilter").addEventListener("change", function () {
      const v = this.value;
      const subsel = $("#subcatFilter");
      subsel.innerHTML = '<option value="">All Subcategories</option>';
      const cat = cats.find((c) => c.name === v);
      if (cat) cat.subs.forEach((s) => subsel.appendChild(new Option(s, s)));
      listPlugins("listContainer", { cat: v, q: $("#listSearch").value });
    });
    $("#subcatFilter").addEventListener("change", () =>
      listPlugins("listContainer", {
        cat: $("#categoryFilter").value,
        sub: $("#subcatFilter").value,
        q: $("#listSearch").value,
      })
    );

    listPlugins("listContainer", { q: q0 });
  }

  // =======================
  // HOME RENDERING
  // =======================
  (async function initHome() {
    if ($("#pluginsContainer")) {
      await renderCategories("categoryList");
      await listPlugins("pluginsContainer");
      await renderTagCloud($("#tagList"));
      document
        .getElementById("categoryList")
        ?.addEventListener("click", (ev) => {
          const btn = ev.target.closest("button[data-cat]");
          if (btn)
            location.href =
              "listing.html?cat=" + encodeURIComponent(btn.dataset.cat);
        });
    }
  })();

  // =======================
  // DETAIL PAGE (BACKEND) - comments & auth modal
  // =======================
  async function fetchCommentsForPlugin(pluginId) {
    try {
      const resp = await fetch(`${API_BASE}/plugins/${pluginId}/comments`, {
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Failed to fetch comments");
      const json = await resp.json();
      return json.items ?? json.data ?? [];
    } catch (err) {
      console.warn("comments fetch failed", err);
      return [];
    }
  }

  async function postCommentToPlugin(pluginId, content) {
    const resp = await fetch(`${API_BASE}/plugins/${pluginId}/comments`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || json.ok === false) {
      throw new Error(json.message || "Failed to post comment");
    }
    return json.item ?? json;
  }

  async function renderDetailFromQuery() {
    const id = new URLSearchParams(location.search).get("id");
    const container = $("#pluginDetail");
    const extras = $("#pluginExtras");
    const descText = $("#pluginDescText");
    if (!container) return;

    if (!id) {
      container.innerHTML = "<p>Plugin not found</p>";
      if (descText) descText.innerHTML = "";
      if (extras) extras.innerHTML = "";
      return;
    }

    container.innerHTML = '<p class="muted">Loading...</p>';
    try {
      const p = await Store.get(id);

      const comments = await fetchCommentsForPlugin(id);

      const firstShot =
        (p.screenshots && p.screenshots[0] && p.screenshots[0].url) || null;
      const mainScreenshotHtml = firstShot
        ? `<div id="mainScreenshot" style="margin-top:12px">
            <img id="mainScreenshotImg" src="${firstShot}" alt="main screenshot" onerror="this.src='https://placehold.co/800x420?text=Screenshot'" style="width:100%;max-height:420px;object-fit:contain;border-radius:8px;border:1px solid #eee">
           </div>`
        : "";

      const galleryHtml = (p.screenshots || []).length
        ? `<div class="screenshots" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
            ${(p.screenshots || [])
              .map(
                (s, idx) => `
              <a href="${s.url}" data-scr="${
                  s.url
                }" data-idx="${idx}" class="screenshot-link" style="display:inline-block">
                <img src="${s.url}" alt="screenshot ${
                  idx + 1
                }" onerror="this.src='https://placehold.co/120x80?text=Shot'" style="width:120px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #eee">
              </a>`
              )
              .join("")}
           </div>`
        : "";

      const appBtnHtml = p.appLink
        ? `<a href="${p.appLink}" target="_blank" rel="noopener" class="btn" style="margin-right:8px">Open Application</a>`
        : "";

      container.innerHTML = `
        <div class="plugin-detail">
          <div class="plugin-meta">
            <div style="flex:1">
              <h1>${p.title}</h1>
              <p class="muted">${p.desc}</p>
              <p>Category: ${p.category}${
        p.subcategory
          ? ' • <span class="muted">' + p.subcategory + "</span>"
          : ""
      }</p>
              <div class="meta-actions">
                <button data-act="heart" data-id="${getId(p)}">❤ ${
        p.hearts || 0
      }</button>
                <button data-act="like" data-id="${getId(p)}">👍 ${
        p.likes || 0
      }</button>
                <button data-act="ok" data-id="${getId(p)}">👌 ${
        p.oks || 0
      }</button>
                <button id="shareBtn">Share</button>
              </div>
            </div>
            <div style="width:320px">
              ${
                p.video
                  ? `<iframe width="100%" height="180" src="${p.video.replace(
                      "watch?v=",
                      "embed/"
                    )}" frameborder="0" allowfullscreen></iframe>`
                  : ""
              }
            </div>
          </div>

          ${mainScreenshotHtml}
          ${galleryHtml}

          <div style="margin-top:12px">
            ${appBtnHtml}
          </div>

          <hr/>
          <h2 style="margin-top:18px">Full Description</h2>
          <div id="fullDescription" style="padding:14px;margin-top:8px;background:#fff">${
            p.descText || "<p>No detailed description provided.</p>"
          }</div>

          <hr/>
          <h3>Comments</h3>
          <div id="commentsArea">
            ${
              comments && comments.length
                ? comments
                    .map(
                      (c) =>
                        `<div class="card" data-comment-id="${
                          c.id
                        }"><strong>${escapeHtml(
                          c.user_name || "User"
                        )}</strong><div class="muted" style="font-size:12px;margin:6px 0;">${new Date(
                          c.createdAt
                        ).toLocaleString()}</div><p>${escapeHtml(
                          c.content
                        )}</p></div>`
                    )
                    .join("")
                : "<p>No comments yet.</p>"
            }
          </div>

          <div id="commentFormWrap" style="margin-top:12px">
            <button id="btnSignIn" class="btn small">Sign in to comment</button>
            <div id="addCommentArea" style="display:none">
              <textarea id="commentText" placeholder="Write your comment"></textarea>
              <button id="submitComment" class="btn small">Submit (will be posted)</button>
            </div>
          </div>
        </div>
      `;

      if (extras) extras.innerHTML = "";

      $("#downloadDescBtn")?.addEventListener("click", function () {
        if (p.appLink) {
          window.open(p.appLink, "_blank", "noopener");
          return;
        }
        const content = p.descText || p.desc || "";
        const blob = new Blob([content], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = (p.title || "plugin") + "-description.html";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast("Description downloaded", "success");
      });

      $("#downloadScreenshot")?.addEventListener("click", function () {
        const img = $("#mainScreenshotImg");
        if (!img || !img.src)
          return showToast("No screenshot to download", "warning");
        const a = document.createElement("a");
        a.href = img.src;
        a.download = (p.title || "screenshot") + ".png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast("Screenshot download started", "info");
      });

      $(".screenshots")?.addEventListener("click", function (ev) {
        const link = ev.target.closest("a.screenshot-link");
        if (!link) return;
        const mainImg = $("#mainScreenshotImg");
        if (mainImg && link.dataset.scr) mainImg.src = link.dataset.scr;
        if (ev.ctrlKey || ev.metaKey) window.open(link.dataset.scr, "_blank");
        ev.preventDefault();
      });

      $("#shareBtn").addEventListener("click", () =>
        navigator.share
          ? navigator
              .share({ title: p.title, url: location.href })
              .catch(() => showToast("Share cancelled", "info"))
          : (function () {
              prompt("Share link", location.href);
              showToast("Link copied prompt shown", "info");
            })()
      );

      // If session exists show comment area
      const session = sessionStorage.getItem("fm_user");
      if (session) {
        $("#btnSignIn").style.display = "none";
        $("#addCommentArea").style.display = "block";
      } else {
        $("#btnSignIn").style.display = "inline-block";
        $("#addCommentArea").style.display = "none";
      }

      // sign-in button opens modal
      $("#btnSignIn")?.addEventListener("click", () => {
        $("#signinModal").setAttribute("aria-hidden", "false");
      });

      // submit comment -> POST to backend (requires cookie auth)
      $("#submitComment")?.addEventListener("click", async () => {
        const txt = $("#commentText").value.trim();
        if (!txt) return showToast("Write something", "warning");
        try {
          const posted = await postCommentToPlugin(id, txt);
          const wrap = $("#commentsArea");
          const el = document.createElement("div");
          el.className = "card";
          el.setAttribute("data-comment-id", posted.id || "");
          el.innerHTML = `<strong>${escapeHtml(
            posted.user_name || "You"
          )}</strong><div class="muted" style="font-size:12px;margin:6px 0;">${new Date(
            posted.createdAt
          ).toLocaleString()}</div><p>${escapeHtml(posted.content)}</p>`;
          if (wrap) wrap.insertAdjacentElement("afterbegin", el);
          showToast("Comment posted", "success");
          $("#commentText").value = "";
        } catch (e) {
          if (
            String(e.message).toLowerCase().includes("not authenticated") ||
            String(e.message).toLowerCase().includes("unauthorized")
          ) {
            showToast("Please sign in to comment", "warning");
            $("#signinModal").setAttribute("aria-hidden", "false");
            return;
          }
          showToast("Failed to post comment: " + e.message, "error");
        }
      });

      populateDetailSidebar(p);
    } catch (err) {
      container.innerHTML = `<p class="error">${err.message}</p>`;
      if (descText) descText.innerHTML = "";
      if (extras) extras.innerHTML = "";
      showToast("Failed to load plugin: " + err.message, "error");
    }
  }
  renderDetailFromQuery();

  // =======================
  // SIGN-IN / REGISTER MODAL (backend)
  // =======================
  (function setupAuthModal() {
    const modal = $("#signinModal");
    if (!modal) return;

    const form = $("#signinForm");
    if (!form) return;

    const titleEl = $("#signinTitle");
    const emailEl = $("#signinEmail");
    const passEl = $("#signinPassword");
    let nameEl = $("#signinName");
    const submitBtn = form.querySelector('button[type="submit"]');
    const openRegisterBtn = $("#openRegisterBtn");
    const closeBtn = $("#closeSignin");

    let mode = "login"; // "login" or "register"

    function ensureNameInput() {
      if (!nameEl) {
        nameEl = document.createElement("input");
        nameEl.id = "signinName";
        nameEl.placeholder = "Full name";
        nameEl.required = true;
        nameEl.style = "width:100%;padding:8px;margin-bottom:8px;";
        form.insertBefore(nameEl, form.firstElementChild);
      }
    }

    function removeNameInput() {
      if (nameEl) {
        nameEl.remove();
        nameEl = null;
      }
    }

    function setMode(m) {
      mode = m;
      if (mode === "register") {
        titleEl.textContent = "Register";
        ensureNameInput();
        submitBtn.textContent = "Register";
        if (openRegisterBtn) {
          openRegisterBtn.textContent = "Back to login";
          openRegisterBtn.classList.add("ghost");
          openRegisterBtn.dataset.mode = "back";
        }
      } else {
        titleEl.textContent = "Sign In";
        removeNameInput();
        submitBtn.textContent = "Sign In";
        if (openRegisterBtn) {
          openRegisterBtn.textContent = "Register";
          openRegisterBtn.classList.remove("ghost");
          openRegisterBtn.dataset.mode = "register";
        }
      }
    }

    setMode("login");

    if (openRegisterBtn) {
      openRegisterBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        if (openRegisterBtn.dataset.mode === "back") {
          setMode("login");
        } else {
          setMode("register");
        }
      });
    }

    closeBtn?.addEventListener("click", () => {
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
    });

    // ---- NEW: robust submit handler that waits for cookie -> UI update ----
    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      const email = emailEl?.value?.trim();
      const password = passEl?.value?.trim();
      const name = nameEl?.value?.trim();

      if (!email || !password)
        return showToast("Please fill email and password", "warning");

      try {
        let role = "user";
        let userObj = {};

        if (mode === "register") {
          const regResp = await Auth.register(name, email, password);
          userObj = regResp.user || {};
          role = regResp.role || userObj.role || "user";
          sessionStorage.setItem(
            "fm_user",
            JSON.stringify({
              name: userObj.name || name,
              email: userObj.email || email,
              role,
            })
          );
          showToast(
            "Registered and signed in as " + (userObj.name || name),
            "success"
          );
        } else {
          const loginResp = await Auth.login(email, password);
          userObj = loginResp.user || {};
          role = loginResp.role || userObj.role || "user";
          sessionStorage.setItem(
            "fm_user",
            JSON.stringify({
              name: userObj.name || "",
              email: userObj.email || email,
              role,
            })
          );
          showToast(
            "Signed in" + (userObj.name ? " as " + userObj.name : ""),
            "success"
          );
        }

        // Close modal & clear fields
        setMode("login");
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");

        emailEl.value = "";
        passEl.value = "";
        if (nameEl) nameEl.value = "";

        // Refresh nav text immediately
        if (window.refreshAuthBtn) window.refreshAuthBtn();

        // IMPORTANT: update admin visibility AFTER cookie is (likely) set.
        // We'll try a small retry loop to be tolerant of timing issues.
        if (window.updateAdminNavVisibility) {
          const tryUpdate = async (tries = 6) => {
            for (let i = 0; i < tries; i++) {
              try {
                const maybe = window.updateAdminNavVisibility();
                if (maybe && typeof maybe.then === "function") {
                  await maybe;
                }
                // tiny delay to give browser/server a moment
                await new Promise((r) => setTimeout(r, 120));
                break;
              } catch (err) {
                await new Promise((r) => setTimeout(r, 150));
              }
            }
          };
          await tryUpdate();
        }

        // Re-render detail page (if present)
        renderDetailFromQuery();
      } catch (err) {
        showToast(err.message || "Auth failed", "error");
      }
    });
  })();

  // =======================
  // CONTACT FORM (backend)
  // =======================
  if ($("#contactForm")) {
    $("#contactForm").addEventListener("submit", async function (ev) {
      ev.preventDefault();

      const msg = $("#contactMsg").value.trim();
      const email = $("#contactEmail").value.trim();

      if (!msg || !email) {
        showToast("Please fill in both fields.", "warning");
        return;
      }

      try {
        // This hits: http://localhost:5000/api/contact in local
        // or https://fmp-backend-wrdc.onrender.com/api/contact in production
        await api("POST", `${API_BASE}/contact`, {
          message: msg,
          email: email,
        });

        showToast("Thank you — we will reach out.", "success");
        this.reset();
      } catch (err) {
        console.error(err);
        showToast("Failed to send message: " + err.message, "error");
      }
    });
  }

  // =======================
  // ADMIN (CREATE/LIST/DELETE/EDIT via BACKEND)
  // =======================
  if ($("#adminPlugins") || $("#addPluginForm")) {
    // -------- categories UI (backend) ----------
    async function populateAdminCats() {
      const cats = await CategoryStore.list(); // from backend
      const adminCats = $("#adminCats");
      if (adminCats) adminCats.innerHTML = "";

      cats.forEach((c) => {
        const id = c._id || c.id;
        const li = document.createElement("li");
        li.innerHTML = `
      ${escapeHtml(c.name)}
      <button data-del="${id}"
              class="small delCatBtn"
              title="Delete category"
              style="background:transparent;border:none;padding:2px 6px;vertical-align:middle;">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style="vertical-align:middle;">
          <path d="M6 7v7m4-7v7m4-7v7M3 5h14M8 3h4a1 1 0 0 1 1 1v1H7V4a1 1 0 0 1 1-1z"
                stroke="#d00" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      ${
        c.subs && c.subs.length
          ? `<div style="font-size:13px;color:#888;margin-left:10px;">
               Subs: ${c.subs.join(", ")}
             </div>`
          : ""
      }
    `;
        adminCats?.appendChild(li);
      });

      // update "Add Plugin" category dropdown
      await renderCategories("", "pCategory");
      await populateCatSelectForSub();
    }

    async function populateCatSelectForSub() {
      const cats = await CategoryStore.list();
      const sel = $("#catSelectForSub");
      if (!sel) return;

      sel.innerHTML = "";
      cats.forEach((c) => {
        const id = c._id || c.id;
        sel.appendChild(new Option(c.name, id));
      });
    }

    // initial load
    populateAdminCats();

    // ------- category buttons wiring -------
    const newCatInput = $("#newCategory"); // text input above "Add"
    const addCatBtn = $("#addCategoryBtn"); // that "Add" button
    const loadSampleBtn = $("#loadSampleBtn"); // "Load Sample Data" button
    const newSubInput = $("#newSubcategory"); // text for new subcategory
    const addSubBtn = $("#addSubcategoryBtn"); // "Add Subcategory" button
    const catSelectForSub = $("#catSelectForSub"); // select for which category

    // default sample categories (used only when clicking "Load Sample Data")
    const defaultCats = [
      {
        name: "Chrome extensions",
        subs: ["Youtube", "Productivity", "Design"],
      },
      { name: "Wordpress", subs: ["Plugins", "Themes"] },
      { name: "Woo-commerce", subs: ["Payment", "Shipping"] },
      { name: "Shopify", subs: ["Apps"] },
      { name: "Others", subs: [] },
    ];

    // Add category
    addCatBtn?.addEventListener("click", async () => {
      const name = newCatInput?.value.trim();
      if (!name) return showToast("Enter a category name", "warning");

      try {
        await CategoryStore.create({ name, subs: [] });
        showToast("Category added", "success");
        newCatInput.value = "";
        await populateAdminCats();
      } catch (err) {
        showToast("Failed to add category: " + err.message, "error");
      }
    });

    // Load sample data
    loadSampleBtn?.addEventListener("click", async () => {
      try {
        for (const cat of defaultCats) {
          await CategoryStore.create(cat);
        }
        showToast("Sample categories loaded", "success");
        await populateAdminCats();
      } catch (err) {
        showToast("Failed to load samples: " + err.message, "error");
      }
    });

    // Add subcategory
    addSubBtn?.addEventListener("click", async () => {
      const catId = catSelectForSub?.value;
      const subName = newSubInput?.value.trim();

      if (!catId) return showToast("Select a category first", "warning");
      if (!subName) return showToast("Enter a subcategory name", "warning");

      try {
        const cats = await CategoryStore.list();
        const cat = cats.find((c) => (c._id || c.id) === catId);
        if (!cat) return showToast("Category not found", "error");

        const newSubs = Array.from(new Set([...(cat.subs || []), subName]));
        await CategoryStore.update(catId, { subs: newSubs });

        showToast("Subcategory added", "success");
        newSubInput.value = "";
        await populateAdminCats();
      } catch (err) {
        showToast("Failed to add subcategory: " + err.message, "error");
      }
    });

    // Delete category (click trash icon)
    $("#adminCats")?.addEventListener("click", async (ev) => {
      const btn = ev.target.closest(".delCatBtn");
      if (!btn) return;

      const id = btn.dataset.del;
      const ok = await confirmModal("Delete this category?", {
        okText: "Delete",
        cancelText: "Cancel",
        variant: "danger",
      });
      if (!ok) return;

      try {
        await CategoryStore.remove(id);
        showToast("Category deleted", "info");
        await populateAdminCats();
      } catch (err) {
        showToast("Delete failed: " + err.message, "error");
      }
    });

    // helper for reading screenshot files
    const fileToDataURL = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("File read error"));
        reader.readAsDataURL(file);
      });

    // -------- CREATE PLUGIN (backend) ----------
    $("#addPluginForm")?.addEventListener("submit", async function (ev) {
      ev.preventDefault();

      const files = Array.from($("#pScreens")?.files || []);
      let screenshots = [];
      try {
        if (files.length) {
          const dataUrls = await Promise.all(files.map(fileToDataURL));
          screenshots = dataUrls.map((u) => ({ url: u }));
        }
      } catch (e) {
        showToast("Failed to read screenshot file(s).", "error");
        return;
      }

      const payload = {
        title: $("#pTitle").value,
        desc: $("#pDesc").value,
        descText: $("#descEditor")?.innerHTML || "",
        tags: $("#pTags")
          .value.split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        category: $("#pCategory").value,
        subcategory: $("#pSubcategory").value,
        screenshots,
        video: $("#pVideo").value,
        appLink: $("#pAppLink")?.value || "",
      };

      try {
        await Store.create(payload);
        showToast("Plugin added", "success");
        $("#addPluginForm").reset();
        if ($("#descEditor")) $("#descEditor").innerHTML = "";
        renderAdminPlugins();
      } catch (err) {
        showToast("Create failed: " + err.message, "error");
      }
    });

    // -------- ADMIN LIST (plugins) ----------
    async function renderAdminPlugins() {
      const wrap = $("#adminPlugins");
      if (!wrap) return;
      wrap.innerHTML = '<p class="muted">Loading...</p>';
      try {
        const arr = await Store.list();
        if (!arr.length) {
          wrap.innerHTML = "<p>No plugins</p>";
          return;
        }
        wrap.innerHTML = "";
        arr.forEach((p) => {
          const id = getId(p);
          const div = document.createElement("div");
          div.className = "card";
          div.innerHTML = `<strong>${p.title}</strong>
            <p class="muted">${p.category}${
            p.subcategory
              ? ' • <span class="muted">' + p.subcategory + "</span>"
              : ""
          }</p>
            ${
              p.appLink
                ? `<div style="margin:6px 0"><a href="${p.appLink}" target="_blank" rel="noopener" class="btn ghost small">Open App</a></div>`
                : ""
            }
            <button data-id="${id}" class="editPlugin editPluginBtn small">Edit</button>
            <button data-id="${id}" class="delPlugin small">Delete</button>
            <a href="detail.html?id=${id}">View</a>`;
          wrap.appendChild(div);
        });
      } catch (err) {
        wrap.innerHTML = `<p class="error">${err.message}</p>`;
        showToast("Failed to load plugins: " + err.message, "error");
      }
    }

    renderAdminPlugins();

    // -------- Edit / Delete plugin handlers ----------
    $("#adminPlugins")?.addEventListener("click", async function (ev) {
      const editBtn = ev.target.closest("button.editPlugin");
      const delBtn = ev.target.closest("button.delPlugin");

      if (editBtn) {
        ev.stopPropagation();
        const id = editBtn.dataset.id;
        try {
          const p = await Store.get(id);
          window.CURRENT_EDIT_ID = id;

          $("#editTitle").value = p.title || "";
          $("#editDesc").value = p.desc || "";
          $("#editDescEditor").innerHTML = p.descText || "";
          $("#editTags").value = (p.tags || []).join(", ");
          await fillEditCategorySelects(p.category || "", p.subcategory || "");
          $("#editVideo").value = p.video || "";
          $("#editAppLink").value = p.appLink || "";
          if ($("#editScreens")) $("#editScreens").value = "";

          $("#editPluginModal").setAttribute("aria-hidden", "false");
          document.body.classList.add("modal-open");
        } catch (e) {
          showToast("Failed to open editor: " + e.message, "error");
        }
        return;
      }

      if (delBtn) {
        ev.stopPropagation();
        const id = delBtn.dataset.id;

        const ok = await confirmModal("Soft delete this plugin?", {
          okText: "Delete",
          cancelText: "Cancel",
          variant: "danger",
        });
        if (!ok) return;

        try {
          await Store.softDelete(id);
          showToast("Plugin moved to trash", "success");
          renderAdminPlugins();
        } catch (err) {
          showToast("Delete failed: " + err.message, "error");
        }
      }
    });

    async function fillEditCategorySelects(selectedCat, selectedSub) {
      const cats = await CategoryStore.list();
      const catSel = $("#editCategory");
      const subSel = $("#editSubcategory");
      if (!catSel || !subSel) return;

      catSel.innerHTML = '<option value="">Select category</option>';
      cats.forEach((c) => catSel.appendChild(new Option(c.name, c.name)));
      catSel.value = selectedCat || "";

      subSel.innerHTML = '<option value="">Select sub</option>';
      const found = cats.find((x) => x.name === catSel.value);
      ((found && found.subs) || []).forEach((s) =>
        subSel.appendChild(new Option(s, s))
      );
      subSel.value = selectedSub || "";

      catSel.addEventListener("change", () => {
        const found2 = cats.find((x) => x.name === catSel.value);
        subSel.innerHTML = '<option value="">Select sub</option>';
        ((found2 && found2.subs) || []).forEach((s) =>
          subSel.appendChild(new Option(s, s))
        );
        subSel.value = "";
      });
    }

    $("#closeEditPlugin")?.addEventListener("click", () => {
      $("#editPluginModal").setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
      window.CURRENT_EDIT_ID = null;
    });

    $("#editPluginForm")?.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      if (!window.CURRENT_EDIT_ID)
        return showToast("No plugin selected.", "warning");

      try {
        const existing = await Store.get(window.CURRENT_EDIT_ID);
        const next = {
          title: $("#editTitle").value,
          desc: $("#editDesc").value,
          descText: $("#editDescEditor")?.innerHTML || "",
          tags: $("#editTags")
            .value.split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          category: $("#editCategory").value,
          subcategory: $("#editSubcategory").value,
          video: $("#editVideo").value,
          appLink: $("#editAppLink").value,
        };

        const files = Array.from($("#editScreens")?.files || []);
        const replace = $("#editReplaceShots")?.checked === true;
        let newShots = [];

        if (files.length) {
          const dataUrls = await Promise.all(files.map(fileToDataURL));
          newShots = dataUrls.map((u) => ({ url: u }));
        }

        if (files.length) {
          next.screenshots = replace
            ? newShots
            : [...(existing.screenshots || []), ...newShots];
        }

        await Store.update(window.CURRENT_EDIT_ID, next);

        showToast("Plugin updated", "success");
        $("#editPluginModal").setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
        window.CURRENT_EDIT_ID = null;

        renderAdminPlugins();
        if (document.getElementById("pluginDetail")) renderDetailFromQuery();
      } catch (err) {
        showToast("Update failed: " + err.message, "error");
      }
    });

    // =======================
    // BACKEND-FIRST REQUESTS (adminRequests)
    // =======================
    async function renderRequests() {
      const wrap = document.getElementById("adminRequests");
      if (!wrap) return;
      wrap.innerHTML = `<p class="muted">Loading requests...</p>`;

      const endpoints = [`${API_BASE}/requests`];

      let items = null;
      for (const url of endpoints) {
        try {
          const res = await fetch(url, { credentials: "include" });
          if (res.status === 401 || res.status === 403) continue;
          if (!res.ok) continue;
          const text = await res.text().catch(() => null);
          if (!text) continue;
          let json;
          try {
            json = JSON.parse(text);
          } catch (e) {
            json = null;
          }
          if (Array.isArray(json)) items = json;
          else if (Array.isArray(json.data)) items = json.data;
          else if (Array.isArray(json.requests)) items = json.requests;
          else if (json && json.id) items = [json];
          if (items) break;
        } catch (err) {
          console.warn("requests fetch attempt failed", err);
        }
      }

      // Fallback to localStorage if backend didn't return items
      if (!items) items = load(LS.requests, []);

      wrap.innerHTML = "";
      if (!items.length) {
        wrap.innerHTML = "<p>No requests</p>";
        return;
      }

      items.forEach((req) => {
        const id =
          req.id ||
          req._id ||
          req.request_id ||
          "ls_" + Math.random().toString(36).slice(2, 9);
        const name = req.name || (req.user && req.user.name) || "User";
        const text = req.text || req.message || "(no message)";
        const email = req.email || (req.user && req.user.email) || "";
        const created =
          req.createdAt || req.created_at || req.created || Date.now();
        const status = req.status || "new";
        const fileUrl = req.fileUrl || req.file || "";

        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div style="flex:1;">
          <strong>${escapeHtml(name)}</strong>
          <p>${escapeHtml(text)}</p>
          <div class="muted" style="margin-top:6px;">
            ${escapeHtml(email)} • ${new Date(created).toLocaleString()}
            <span style="display:inline-block;margin-left:8px;padding:4px 8px;border-radius:999px;background:#f3f4f6;color:#111;font-size:12px;">${escapeHtml(
              status
            )}</span>
          </div>
          ${
            fileUrl
              ? `<div style="margin-top:8px;"><a href="${escapeHtml(
                  fileUrl
                )}" target="_blank" rel="noopener" class="muted">Attachment</a></div>`
              : ""
          }
        </div>

        <div style="min-width:140px;text-align:right;">
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
            <button class="delPlugin small" data-id="${escapeHtml(
              id
            )}">Delete</button>
            <a class="btn ghost small" href="#" data-id-view="${escapeHtml(
              id
            )}">View</a>
          </div>
        </div>
      </div>
    `;
        wrap.appendChild(card);
      });
    }

    // Delete + View handler for adminRequests
    document
      .getElementById("adminRequests")
      ?.addEventListener("click", async (ev) => {
        const delBtn = ev.target.closest("button.delPlugin");
        const viewLink = ev.target.closest("a[data-id-view]");

        // View request in modal
        if (viewLink) {
          ev.preventDefault();
          const id =
            viewLink.dataset.idView || viewLink.getAttribute("data-id-view");

          const viewModal = document.getElementById("viewRequestModal");
          const viewContent = document.getElementById("viewRequestContent");
          if (!viewModal || !viewContent) {
            showToast("View modal not found", "error");
            return;
          }
          viewContent.innerHTML = "<p class='muted'>Loading...</p>";
          viewModal.setAttribute("aria-hidden", "false");
          document.body.classList.add("modal-open");

          let req = null;
          const tryUrls = [`${API_BASE}/requests/${id}`];
          for (const u of tryUrls) {
            try {
              const r = await fetch(u, { credentials: "include" });
              if (!r.ok) continue;
              const j = await r.json().catch(() => null);
              req = j?.data || j?.request || j;
              if (req) break;
            } catch (err) {
              // ignore and continue
            }
          }

          // fallback to LS
          if (!req) {
            const arr = load(LS.requests, []);
            req = arr.find((x) => {
              const cand = x.id || x._id || x.request_id || "";
              return cand === id || String(x._id) === String(id);
            });
          }

          if (!req) {
            viewContent.innerHTML = '<p class="muted">Request not found.</p>';
            showToast("Request not found", "error");
            return;
          }

          const created = new Date(
            req.createdAt || req.created || req.created_at || Date.now()
          ).toLocaleString();
          const attachmentHtml =
            req.fileUrl || req.file || req.filename
              ? `<p style="margin-top:8px;"><strong>Attachment:</strong>
        <a href="${escapeHtml(
          req.fileUrl || req.file || ""
        )}" target="_blank" rel="noopener" class="btn ghost small">Open File</a></p>`
              : "";

          viewContent.innerHTML = `
    <p><strong>Name:</strong> ${escapeHtml(
      req.name || (req.user && req.user.name) || ""
    )}</p>
    <p><strong>Email:</strong> ${escapeHtml(
      req.email || (req.user && req.user.email) || ""
    )}</p>
    <p><strong>Phone:</strong> ${escapeHtml(req.phone || "")}</p>
    <p><strong>Requirement:</strong><br>${escapeHtml(
      req.text || req.message || ""
    )}</p>
    <p><strong>Status:</strong> <span class="muted">${escapeHtml(
      req.status || "new"
    )}</span></p>
    <p><strong>Created:</strong> ${created}</p>
    ${attachmentHtml}
  `;

          return;
        }

        // Delete request
        if (!delBtn) return;

        const ok = await confirmModal("Delete this request?", {
          okText: "Delete",
          cancelText: "Cancel",
          variant: "danger",
        });
        if (!ok) return;

        const id = delBtn.dataset.id;

        try {
          const pubDel = await fetch(`${API_BASE}/requests/${id}`, {
            method: "DELETE",
            credentials: "include",
          });
          if (pubDel.ok) {
            showToast("Request deleted", "info");
            return renderRequests();
          }
        } catch (e) {
          console.warn("backend delete failed", e);
        }

        // fallback: delete from LS
        let arr = load(LS.requests, []);
        arr = arr.filter((x) => (x.id || x._id || "") !== id);
        save(LS.requests, arr);
        showToast("Request deleted (local)", "info");
        renderRequests();
      });

    // close buttons for viewRequestModal
    document
      .getElementById("closeViewRequest")
      ?.addEventListener("click", () => {
        const m = document.getElementById("viewRequestModal");
        if (!m) return;
        m.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
      });

    document
      .getElementById("closeViewRequest2")
      ?.addEventListener("click", () => {
        const m = document.getElementById("viewRequestModal");
        if (!m) return;
        m.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
      });

    document
      .getElementById("viewRequestModal")
      ?.addEventListener("mousedown", (ev) => {
        const modal = document.getElementById("viewRequestModal");
        if (ev.target === modal) {
          modal.setAttribute("aria-hidden", "true");
          document.body.classList.remove("modal-open");
        }
      });

    document.addEventListener("keydown", (ev) => {
      const modal = document.getElementById("viewRequestModal");
      if (!modal) return;
      if (
        ev.key === "Escape" &&
        modal.getAttribute("aria-hidden") === "false"
      ) {
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
      }
    });
    // Render requests initially
    renderRequests();

    // =======================
    // ADMIN CONTACT MESSAGES
    // =======================
    async function renderAdminContacts() {
      const wrap = document.getElementById("adminContacts");
      if (!wrap) return;

      wrap.innerHTML = `<p class="muted">Loading contact messages...</p>`;

      try {
        const resp = await api("GET", `${API_BASE}/contact`);
        const items = resp.data ?? resp.items ?? resp;

        if (!items || !items.length) {
          wrap.innerHTML = "<p>No contact messages yet.</p>";
          return;
        }

        wrap.innerHTML = "";
        items.forEach((msg) => {
          const id = msg._id || msg.id;
          const created = new Date(
            msg.createdAt || msg.created || Date.now()
          ).toLocaleString();

          const card = document.createElement("div");
          card.className = "card";
          card.innerHTML = `
            <strong>${escapeHtml(msg.email || "Unknown")}</strong>
            <div class="muted" style="font-size:12px;margin:4px 0;">
              ${created}
            </div>
            <p>${escapeHtml(msg.message || "")}</p>
            <div style="margin-top:8px; text-align:right;">
              <button class="delPlugin small delContactBtn" data-delc="${escapeHtml(
                id
              )}">Delete</button>
            </div>
          `;
          wrap.appendChild(card);
        });
      } catch (err) {
        console.error(err);
        wrap.innerHTML = `<p class="error">Failed to load contact messages: ${escapeHtml(
          err.message
        )}</p>`;
      }
    }

    // Delete handler for contact messages
    document
      .getElementById("adminContacts")
      ?.addEventListener("click", async (ev) => {
        const btn = ev.target.closest("button.delContactBtn");
        if (!btn) return;

        const id = btn.dataset.delc;
        const ok = await confirmModal("Delete this contact message?", {
          okText: "Delete",
          cancelText: "Cancel",
          variant: "danger",
        });
        if (!ok) return;

        try {
          await api("DELETE", `${API_BASE}/contact/${id}`);
          showToast("Contact message deleted", "info");
          renderAdminContacts();
        } catch (err) {
          showToast("Delete failed: " + err.message, "error");
        }
      });
    // Initial load of contact messages in admin dashboard
    renderAdminContacts();

    // =======================
    // ADMIN COMMENTS (from backend)
    // =======================
    async function renderAdminComments() {
      const wrap = document.getElementById("adminComments");
      if (!wrap) return;

      wrap.innerHTML = `<p class="muted">Loading comments...</p>`;

      try {
        const resp = await api("GET", `${API_BASE}/comments`);
        const items = resp.items ?? resp.data ?? [];

        if (!items.length) {
          wrap.innerHTML = "<p>No comments yet.</p>";
          return;
        }

        wrap.innerHTML = "";
        items.forEach((c) => {
          const div = document.createElement("div");
          div.className = "card";
          div.innerHTML = `
            <strong>${escapeHtml(c.user_name || "User")}</strong>
            <div class="muted" style="font-size:12px;margin:4px 0;">
              ${escapeHtml(c.user_email || "")} •
              ${new Date(c.createdAt).toLocaleString()}
            </div>
            <p>${escapeHtml(c.content)}</p>
            <div class="muted" style="font-size:12px;margin-top:4px;">
              Plugin:
              <a href="detail.html?id=${escapeHtml(
                c.pluginId
              )}" target="_blank" rel="noopener">
                ${escapeHtml(c.pluginId)}
              </a>
            </div>
            <div style="margin-top:8px; text-align:right;">
              <button class="delPlugin small delCommentBtn" data-delc="${escapeHtml(
                c.id
              )}">Delete</button>
            </div>
          `;
          wrap.appendChild(div);
        });
      } catch (err) {
        console.error(err);
        wrap.innerHTML = `<p class="error">Failed to load comments: ${escapeHtml(
          err.message
        )}</p>`;
      }
    }

    // Delete handler for adminComments
    document
      .getElementById("adminComments")
      ?.addEventListener("click", async (ev) => {
        const btn = ev.target.closest("button.delCommentBtn");
        if (!btn) return;

        const id = btn.dataset.delc;
        const ok = await confirmModal("Delete this comment?", {
          okText: "Delete",
          cancelText: "Cancel",
          variant: "danger",
        });
        if (!ok) return;

        try {
          await api("DELETE", `${API_BASE}/comments/${id}`);
          showToast("Comment deleted", "info");
          renderAdminComments();
        } catch (err) {
          showToast("Delete failed: " + err.message, "error");
        }
      });

    // Initial load of comments in admin dashboard
    renderAdminComments();
  }

  // =======================
  // Populate detail sidebar & other helpers
  // =======================
  async function populateDetailSidebar(plugin) {
    try {
      const all = (await Store.list({ cat: plugin.category })) || [];
      const plusTags = await Store.list({
        tags: (plugin.tags || []).join(","),
      }).catch(() => []);
      const merged = [...all, ...(plusTags || [])].filter(
        (x) => getId(x) !== getId(plugin)
      );

      const seen = new Set();
      const related = [];
      for (const x of merged) {
        const key = getId(x);
        if (!seen.has(key)) {
          related.push(x);
          seen.add(key);
        }
        if (related.length >= 6) break;
      }

      const relWrap = $("#relatedPlugins");
      if (relWrap) {
        relWrap.innerHTML = "";
        if (!related.length) relWrap.innerHTML = "<li>No related plugins.</li>";
        related.forEach((r) => {
          const li = document.createElement("li");
          const shot =
            (r.screenshots && r.screenshots[0] && r.screenshots[0].url) ||
            "https://placehold.co/120x80?text=Screenshot";
          li.innerHTML = `<a href="detail.html?id=${getId(
            r
          )}" style="display:flex;align-items:center;">
            <img src="${shot}" alt="" onerror="this.src='https://placehold.co/120x80?text=Shot'">
            <span style="display:block;margin-left:8px;">${r.title}</span>
          </a>`;
          relWrap.appendChild(li);
        });
      }
    } catch (e) {
      /* ignore */
    }

    const cats = await CategoryStore.list();
    const catWrap = $("#detailCategories");
    if (catWrap) {
      catWrap.innerHTML = "";
      cats.forEach((c) => {
        const li = document.createElement("li");
        li.innerHTML = `<button class="link-btn" data-cat="${c.name}">${c.name}</button>`;
        catWrap.appendChild(li);
      });
      catWrap.addEventListener("click", function (ev) {
        const btn = ev.target.closest("button[data-cat]");
        if (btn)
          location.href =
            "listing.html?cat=" + encodeURIComponent(btn.dataset.cat);
      });
    }

    await renderTagCloud($("#detailTags"));
  }

  // =======================
  // LISTING PAGE WITH QUERY PARAMS
  // =======================
  if (
    location.pathname.endsWith("/listing.html") ||
    location.pathname.endsWith("listing.html")
  ) {
    const pms = new URLSearchParams(location.search);
    const q = pms.get("q") || pms.get("tag") || "";
    if (q) listPlugins("listContainer", { q: q, cat: pms.get("cat") || "" });
  }

  // =======================
  // GENERIC MODAL HELPERS
  // =======================
  function enableModalAutoClose(
    modalSelector,
    panelSelector,
    closeBtnSelector
  ) {
    const modal = $(modalSelector);
    const panel = $(panelSelector, modal);
    const closeBtn = $(closeBtnSelector, modal);
    if (!modal || !panel) return;
    modal.addEventListener("mousedown", function (ev) {
      if (ev.target === modal) modal.setAttribute("aria-hidden", "true");
    });
    document.addEventListener("keydown", function (ev) {
      if (
        ev.key === "Escape" &&
        modal.getAttribute("aria-hidden") === "false"
      ) {
        modal.setAttribute("aria-hidden", "true");
      }
    });
    if (closeBtn)
      closeBtn.addEventListener("click", function () {
        modal.setAttribute("aria-hidden", "true");
      });
  }

  // =======================
  // MOBILE FILTER SIDEBARS
  // =======================
  if ($("#openFilterSidebar")) {
    $("#openFilterSidebar").addEventListener("click", async function () {
      $("#filterSidebarModal").setAttribute("aria-hidden", "false");
      const cats = await CategoryStore.list();
      const catList = $("#categoryListMobile");
      catList.innerHTML = "";
      cats.forEach((c) => {
        const li = document.createElement("li");
        li.innerHTML = `<buttonclass="link-btn" data-cat="${c.name}">${c.name}</button>`;
        catList.appendChild(li);
      });
      catList.addEventListener("click", function (ev) {
        const btn = ev.target.closest("button[data-cat]");
        if (btn)
          location.href =
            "listing.html?cat=" + encodeURIComponent(btn.dataset.cat);
      });
      await renderTagCloud($("#tagListMobile"));
    });
    enableModalAutoClose(
      "#filterSidebarModal",
      ".sidebar-panel",
      "#closeFilterSidebar"
    );
  }

  if ($("#openFilterSidebarDetail")) {
    $("#openFilterSidebarDetail").addEventListener("click", async function () {
      $("#filterSidebarModalDetail").setAttribute("aria-hidden", "false");
      const cats = await CategoryStore.list();
      const catList = $("#categoryListMobileDetail");
      catList.innerHTML = "";
      cats.forEach((c) => {
        const li = document.createElement("li");
        li.innerHTML = `<button class="link-btn" data-cat="${c.name}">${c.name}</button>`;
        catList.appendChild(li);
      });
      catList.addEventListener("click", function (ev) {
        const btn = ev.target.closest("button[data-cat]");
        if (btn)
          location.href =
            "listing.html?cat=" + encodeURIComponent(btn.dataset.cat);
      });
      await renderTagCloud($("#tagListMobileDetail"));
    });
    enableModalAutoClose(
      "#filterSidebarModalDetail",
      ".sidebar-panel",
      "#closeFilterSidebarDetail"
    );
  }

  // The rest of your admin/listing/request code (edit/create/delete) is intentionally kept.
  // end IIFE
  // ----------------------------------------------------------------------
  // PROTECTION AGAINST BF_CACHE: re-check auth on pageshow and hide/redirect admin UI
  window.addEventListener("pageshow", async (event) => {
    try {
      // always re-sync navbar/admin link visibility when page is shown (handles bfcache)
      await updateAdminNavVisibility();

      const isAdminPage =
        location.pathname.endsWith("/admin.html") ||
        location.pathname.endsWith("admin.html");

      if (!isAdminPage) return;

      // re-verify with backend (authoritative)
      const me = await Auth.me();
      const role =
        me?.user?.role || me?.role || me?.data?.role || me?.data?.user?.role;

      if (role !== "admin") {
        // replace so Back won't return to admin page, send to admin login
        location.replace("admin-login.html");
      } else {
        // ensure admin UI visible
        document.body.setAttribute("data-auth", "ok");
      }
    } catch (err) {
      // conservative fallback: hide admin UI and redirect to login
      console.warn("pageshow admin re-check failed:", err);
      const adminItem = document.querySelector(".admin-only");
      if (adminItem) adminItem.style.display = "none";
      try {
        location.replace("admin-login.html");
      } catch {}
    }
  });
})();

// =======================
// GOOGLE SIGN-IN (ADD ONLY – DOES NOT AFFECT EXISTING AUTH)
// =======================
// =======================
// GOOGLE SIGN IN (Option 1 - Google button)
// =======================
window.addEventListener("load", () => {
  if (!window.google) {
    console.error("Google script not loaded");
    return;
  }

  const googleDiv = document.getElementById("googleSignIn");
  if (!googleDiv) {
    console.error("#googleSignIn not found");
    return;
  }

  google.accounts.id.initialize({
    client_id: "79276593114-kncb9qral7p3fmmmh9cufp2j640n543g.apps.googleusercontent.com",
    callback: handleGoogleSignIn,
  });

  google.accounts.id.renderButton(googleDiv, {
    theme: "filled_black",
    size: "large",
    shape: "pill",
    width: 320,
  });
});


async function handleGoogleSignIn(response) {
  try {
    console.log("Google token:", response.credential);

    // SEND TOKEN TO BACKEND
    const res = await fetch(
      (["localhost", "127.0.0.1"].includes(location.hostname)
        ? `http://${location.hostname}:5000/api/auth/google`
        : "https://fmp-backend-wrdc.onrender.com/api/auth/google"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: response.credential })
      }
    );

    if (!res.ok) throw new Error("Google login failed");

    const data = await res.json();

    // SAVE SESSION (same as normal login)
    sessionStorage.setItem(
      "fm_user",
      JSON.stringify({
        name: data.user.name,
        email: data.user.email,
        role: data.user.role || "user"
      })
    );

    // CLOSE MODAL
    document.getElementById("signinModal")
      ?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");

    // UPDATE NAV
    window.refreshAuthBtn && window.refreshAuthBtn();
    window.updateAdminNavVisibility && window.updateAdminNavVisibility();

    window.showToast("Signed in with Google", "success");
  } catch (err) {
    window.showToast(err.message || "Google sign-in failed", "error");
  }
}

