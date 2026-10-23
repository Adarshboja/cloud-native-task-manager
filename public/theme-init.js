try {
  document.documentElement.dataset.theme = localStorage.getItem('taskflow-theme') || 'system';
} catch {
  document.documentElement.dataset.theme = 'system';
}
