/* ═══════════════════════════════════════════════════
   CIVIX — Theme Toggle (shared across all pages)
   ═══════════════════════════════════════════════════ */

var THEME_KEY = 'civix_theme';

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
}

function applyTheme(theme) {
  const isDark = theme === 'dark';
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  // Update navbar toggle icon if it exists
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    const icon = btn.querySelector('i');
    if (icon) {
      icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }
  }
}

// Apply saved theme instantly to avoid flash of wrong theme
(function() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
