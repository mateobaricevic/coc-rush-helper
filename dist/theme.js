/* Apply the saved theme before styles load, independently of village analysis. */
(() => {
  const storageKey = 'rush-helper-theme-v1';
  const root = document.documentElement;
  let theme = 'dark';
  try {
    if (window.localStorage.getItem(storageKey) === 'light') theme = 'light';
  } catch { /* Theme switching still works when browser storage is blocked. */ }

  function applyTheme() {
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101813' : '#f5f4ef');
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    const next = theme === 'dark' ? 'light' : 'dark';
    toggle.setAttribute('aria-label', `Switch to ${next} theme`);
    toggle.title = `Switch to ${next} theme`;
    document.getElementById('theme-label').textContent = `${next === 'light' ? 'Light' : 'Dark'} mode`;
  }

  function bindToggle() {
    applyTheme();
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      applyTheme();
      try { window.localStorage.setItem(storageKey, theme); } catch { /* Keep the current session usable. */ }
    });
  }

  applyTheme();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindToggle, { once: true });
  else bindToggle();
})();
