/* js/app.js
   Cross-cutting behaviour shared by every page: nav-link highlighting,
   guest/auth topbar toggling, the app-shell auth guard, sidebar user card,
   logout wiring, mobile sidebar toggle, toasts, and small formatting
   helpers used throughout the app (App.escapeHtml, App.formatDate, …). */

const App = (function () {
  const THEME_KEY = "im_theme";
  const ADMIN_THEME_KEY = "im_admin_theme";
  const currentThemeKey = () => /(?:^|\/)admin\.html$/i.test(window.location.pathname) ? ADMIN_THEME_KEY : THEME_KEY;

  function applyStoredTheme() {
    try {
      const theme = localStorage.getItem(currentThemeKey()) || "light";
      document.documentElement.setAttribute("data-theme", theme);
    } catch (e) { /* ignore */ }
  }
  applyStoredTheme();

  const PUBLIC_PAGES = ["index.html", "internships.html", "internship-details.html",
    "login.html", "register.html", "admin.html", ""];

  function currentPage() {
    const path = window.location.pathname.split("/").pop();
    return path || "index.html";
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  function daysUntil(iso) {
    if (!iso) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(iso);
    target.setHours(0, 0, 0, 0);
    return Math.round((target - today) / (1000 * 60 * 60 * 24));
  }

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function initials(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
    return letters.toUpperCase();
  }

  let toastTimer = null;
  function toast(message, type) {
    let el = document.getElementById("im-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "im-toast";
      el.className = "im-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = "im-toast im-toast--show" + (type ? ` im-toast--${type}` : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.className = "im-toast";
    }, 2600);
  }

  function wireNavHighlight() {
    const page = currentPage();
    document.querySelectorAll("[data-nav-link]").forEach((link) => {
      const target = link.getAttribute("data-nav-link");
      if (target === page || (target === "interviews" && page === "interviews.html")) {
        link.classList.add("is-active");
      }
    });
  }

  function wireGuestAuthToggle() {
    const user = Store.getCurrentUser();
    document.querySelectorAll("[data-guest-only]").forEach((el) => {
      el.style.display = user ? "none" : "";
    });
    document.querySelectorAll("[data-auth-only]").forEach((el) => {
      el.style.display = user ? "" : "none";
    });
  }

  function wireSidebarUser() {
    const user = Store.getCurrentUser();
    if (!user) return;
    const profile = Store.getProfile(user.email);
    document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = user.name || user.email));
    document.querySelectorAll("[data-user-initial]").forEach((el) => {
      if (profile.photo) {
        el.innerHTML = `<img src="${profile.photo}" alt="" class="avatar__img" />`;
      } else {
        el.textContent = initials(user.name);
      }
    });
  }

  function wireLogout() {
    document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        Store.logout();
        window.location.href = "login.html";
      });
    });
  }

  function wireSidebarToggle() {
    const toggle = document.querySelector("[data-sidebar-toggle]");
    const hide = document.querySelector("[data-sidebar-hide]");
    const shell = document.querySelector(".app-shell");
    if (!shell) return;
    if (toggle) toggle.addEventListener("click", () => {
      if (shell.classList.contains("sidebar-hidden")) {
        shell.classList.remove("sidebar-hidden");
        return;
      }
      shell.classList.toggle("sidebar-open");
    });
    if (hide) hide.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 860px)").matches) {
        shell.classList.remove("sidebar-open");
      } else {
        shell.classList.add("sidebar-hidden");
      }
    });
    shell.querySelectorAll(".sidebar-nav a").forEach((a) => {
      a.addEventListener("click", () => shell.classList.remove("sidebar-open"));
    });
  }

  function wirePasswordToggles() {
    document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = document.getElementById(btn.getAttribute("data-toggle-password"));
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.textContent = show ? "Hide" : "Show";
        btn.setAttribute("aria-pressed", show ? "true" : "false");
      });
    });
  }

  function wireThemeToggle() {
    const btns = document.querySelectorAll('[data-action="theme-toggle"]');
    if (!btns.length) return;
    function label() {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      return isDark ? "☀ Light mode" : "🌙 Dark mode";
    }
    btns.forEach((btn) => (btn.textContent = label()));
    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        const next = isDark ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        try { localStorage.setItem(currentThemeKey(), next); } catch (e) { /* ignore */ }
        btns.forEach((b) => (b.textContent = label()));
      });
    });
  }

  function enforceAuthGuard() {
    const requiresAuth = !!document.querySelector(".app-shell");
    if (!requiresAuth) return true;
    const user = Store.getCurrentUser();
    if (!user) {
      window.location.href = `login.html?next=${encodeURIComponent(currentPage())}`;
      return false;
    }
    if (user.role === "company") {
      window.location.replace("company-dashboard.html");
      return false;
    }
    if (user.role === "admin") {
      window.location.replace("admin.html");
      return false;
    }
    return true;
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!enforceAuthGuard()) return;
    wireNavHighlight();
    wireGuestAuthToggle();
    wireSidebarUser();
    wireLogout();
    wireSidebarToggle();
    wirePasswordToggles();
    wireThemeToggle();
  });

  function skeletonCards(count, className) {
    const items = new Array(count).fill(0).map(() => `<div class="${className || "int-card"} skeleton-card"></div>`);
    return items.join("");
  }

  return { escapeHtml, formatDate, daysUntil, qs, initials, toast, currentPage, skeletonCards };
})();
