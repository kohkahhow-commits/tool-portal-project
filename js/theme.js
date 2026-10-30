// Light/dark theme toggle, shared by every page.
// Loaded in <head> so the saved theme is applied before the page is drawn.
(function () {
  var STORAGE_KEY = "theme";
  var root = document.documentElement;

  function getSavedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null; // storage blocked (e.g. private mode): fall back to default
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      // ignore: the theme still applies for this page view
    }
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    var button = document.getElementById("theme-toggle");
    if (button) {
      var isDark = theme === "dark";
      button.setAttribute("aria-pressed", String(isDark));
      button.textContent = isDark ? "Light theme" : "Dark theme";
    }
  }

  // Light is the default theme.
  applyTheme(getSavedTheme() === "dark" ? "dark" : "light");

  document.addEventListener("DOMContentLoaded", function () {
    var button = document.getElementById("theme-toggle");
    if (!button) return;
    applyTheme(root.getAttribute("data-theme"));
    button.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      saveTheme(next);
    });
  });
})();
