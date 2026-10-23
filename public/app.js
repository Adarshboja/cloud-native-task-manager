const state = { page: 1, limit: 8, q: '', status: '', sortBy: 'created_at', order: 'desc', totalPages: 1 };
const elements = {
  list: document.querySelector('#task-list'),
  dialog: document.querySelector('#task-dialog'),
  form: document.querySelector('#task-form'),
  search: document.querySelector('#search-input'),
  searchClear: document.querySelector('#clear-search'),
  statusFilter: document.querySelector('#status-filter'),
  sort: document.querySelector('#sort-select'),
  theme: document.querySelector('#theme-select'),
  sidebar: document.querySelector('#sidebar'),
};
let searchTimer;
let lastDialogTrigger;

elements.theme.value = document.documentElement.dataset.theme || 'system';

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  elements.theme.value = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#19232e' : '#f4f3ef';
  try {
    localStorage.setItem('taskflow-theme', theme);
  } catch {
    showToast('Theme preference could not be saved in this browser.', true);
  }
}

function updateConnectionStatus(connected) {
  document.querySelector('#connection-label').textContent = connected
    ? 'Local workspace'
    : 'Service unavailable';
  document.querySelector('#connection-state').textContent = connected ? 'CONNECTED' : 'OFFLINE';
  document.querySelector('.connection-pulse').classList.toggle('is-offline', !connected);
}

async function checkHealth() {
  try {
    const health = await apiRequest('/health');
    updateConnectionStatus(health.status === 'ok' && health.database === 'connected');
  } catch {
    updateConnectionStatus(false);
  }
}

function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = `toast${isError ? ' error' : ''}`;
  toast.textContent = message;
  document.querySelector('#toast-region').append(toast);
  window.setTimeout(() => toast.remove(), 3500);
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  if (response.status === 204) return null;
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || 'The request could not be completed.');
  return payload.data;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(value));
}

function updateMetrics(metrics) {
  const values = {
    'metric-total': metrics.total,
    'metric-pending': metrics.pending,
    'metric-progress': metrics.in_progress,
    'metric-completed': metrics.completed,
  };
  for (const [id, value] of Object.entries(values)) {
    const metric = document.getElementById(id);
    if (metric.textContent !== String(value)) {
      metric.textContent = value;
      metric.classList.remove('is-changing');
      requestAnimationFrame(() => metric.classList.add('is-changing'));
      window.setTimeout(() => metric.classList.remove('is-changing'), 260);
    }
  }
}

function renderTasks(tasks) {
  if (tasks.length === 0) {
    const hasFilters = Boolean(state.q || state.status);
    elements.list.innerHTML = `<div class="empty-state"><span class="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m4 4 16 16M9.5 9.5a3.5 3.5 0 0 0 5 5M7 7A8 8 0 0 1 20 12M4 12a8 8 0 0 0 12.7 6.4"></path></svg></span><h3>${hasFilters ? 'No tasks match your search' : 'Nothing on your list yet'}</h3><p>${hasFilters ? 'Try another phrase or clear your filters to see your tasks.' : 'Start with one small step. Add a task whenever you’re ready.'}</p>${hasFilters ? '<button class="button button-quiet" type="button" data-action="clear-filters">Clear filters</button>' : '<button class="button button-primary" type="button" data-action="new-task">+ Add your first task</button>'}</div>`;
    return;
  }

  elements.list.innerHTML = tasks.map((task) => `
    <article class="task-row" data-task-id="${escapeHtml(task.id)}">
      <div class="task-main">
        <button class="task-check${task.status === 'completed' ? ' is-complete' : ''}" type="button" data-action="toggle" aria-label="${task.status === 'completed' ? 'Mark task incomplete' : 'Mark task complete'}">${task.status === 'completed' ? '✓' : ''}</button>
        <div class="task-text"><h3 class="task-title${task.status === 'completed' ? ' done' : ''}">${escapeHtml(task.title)}</h3><p class="task-description">${escapeHtml(task.description || 'No description added')}</p></div>
      </div>
      <div class="task-date"><small>CREATED</small><time datetime="${escapeHtml(task.created_at)}">${formatDate(task.created_at)}</time></div>
      <label class="visually-hidden" for="status-${escapeHtml(task.id)}">Status for ${escapeHtml(task.title)}</label>
      <select class="status-select status-${escapeHtml(task.status)}" id="status-${escapeHtml(task.id)}" data-action="status">
        <option value="pending"${task.status === 'pending' ? ' selected' : ''}>Pending</option>
        <option value="in_progress"${task.status === 'in_progress' ? ' selected' : ''}>In progress</option>
        <option value="completed"${task.status === 'completed' ? ' selected' : ''}>Completed</option>
      </select>
      <div class="task-actions">
        <button class="icon-button" type="button" data-action="edit" aria-label="Edit ${escapeHtml(task.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.9L19 8.3a2.1 2.1 0 0 0-3-3L5.2 16.1 4 20Z"></path></svg></button>
        <button class="icon-button delete-button" type="button" data-action="delete" aria-label="Delete ${escapeHtml(task.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"></path></svg></button>
      </div>
    </article>`).join('');
}

function renderSkeletons() {
  elements.list.innerHTML = `<div class="skeleton-row"><div class="skeleton-main"><span class="skeleton skeleton-check"></span><span><span class="skeleton skeleton-title"></span><span class="skeleton skeleton-sub"></span></span></div><span class="skeleton skeleton-date"></span><span class="skeleton skeleton-status"></span><span class="skeleton skeleton-actions"></span></div>`.repeat(3);
}

async function loadTasks() {
  elements.list.setAttribute('aria-busy', 'true');
  renderSkeletons();
  const parameters = new URLSearchParams({
    page: state.page,
    limit: state.limit,
    sortBy: state.sortBy,
    order: state.order,
  });
  if (state.q) parameters.set('q', state.q);
  if (state.status) parameters.set('status', state.status);

  try {
    const result = await apiRequest(`/api/v1/tasks?${parameters}`);
    updateMetrics(result.metrics);
    renderTasks(result.tasks);
    state.totalPages = result.pagination.totalPages;
    document.querySelector('#result-count').textContent = `${result.pagination.total} ${result.pagination.total === 1 ? 'task' : 'tasks'}`;
    document.querySelector('#pagination-label').textContent = `Page ${result.pagination.page} of ${result.pagination.totalPages}`;
    document.querySelector('#previous-page').disabled = state.page <= 1;
    document.querySelector('#next-page').disabled = state.page >= state.totalPages;
    checkHealth();
  } catch (error) {
    elements.list.innerHTML = `<div class="error-state"><span>${escapeHtml(error.message)} Please check your connection and try again.</span><button class="button button-quiet" type="button" data-action="retry">Try again</button></div>`;
    updateConnectionStatus(false);
    showToast(error.message, true);
  } finally {
    elements.list.setAttribute('aria-busy', 'false');
  }
}

function openTaskDialog(task = null) {
  lastDialogTrigger = document.activeElement;
  elements.form.reset();
  document.querySelector('#form-error').textContent = '';
  document.querySelector('#task-id').value = task?.id || '';
  document.querySelector('#task-title').value = task?.title || '';
  document.querySelector('#task-description').value = task?.description || '';
  document.querySelector('#task-status').value = task?.status || 'pending';
  document.querySelector('#dialog-title').textContent = task ? 'Edit task' : 'Create a task';
  document.querySelector('#save-task').textContent = task ? 'Save changes' : 'Create task';
  elements.dialog.showModal();
  document.querySelector('#task-title').focus();
}

async function loadTaskForEdit(id) {
  try {
    const result = await apiRequest(`/api/v1/tasks/${encodeURIComponent(id)}`);
    openTaskDialog(result.task);
  } catch (error) {
    showToast(error.message, true);
  }
}

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = document.querySelector('#task-id').value;
  const task = {
    title: document.querySelector('#task-title').value.trim(),
    description: document.querySelector('#task-description').value.trim(),
    status: document.querySelector('#task-status').value,
  };
  if (!task.title) {
    document.querySelector('#form-error').textContent = 'Please enter a task title.';
    document.querySelector('#task-title').focus();
    return;
  }

  const saveButton = document.querySelector('#save-task');
  saveButton.disabled = true;
  saveButton.classList.add('is-saving');
  saveButton.setAttribute('aria-busy', 'true');
  document.querySelector('#form-error').textContent = '';
  try {
    await apiRequest(id ? `/api/v1/tasks/${encodeURIComponent(id)}` : '/api/v1/tasks', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(task),
    });
    elements.dialog.close();
    showToast(id ? 'Task updated.' : 'Task created.');
    state.page = 1;
    await loadTasks();
  } catch (error) {
    document.querySelector('#form-error').textContent = error.message;
  } finally {
    saveButton.disabled = false;
    saveButton.classList.remove('is-saving');
    saveButton.removeAttribute('aria-busy');
  }
});

elements.list.addEventListener('click', async (event) => {
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  if (actionButton.dataset.action === 'new-task') return openTaskDialog();
  if (actionButton.dataset.action === 'clear-filters') {
    state.q = '';
    state.status = '';
    state.page = 1;
    elements.search.value = '';
    elements.statusFilter.value = '';
    elements.searchClear.hidden = true;
    return loadTasks();
  }
  if (actionButton.dataset.action === 'retry') {
    checkHealth();
    return loadTasks();
  }
  const button = event.target.closest('button[data-action]');
  if (!button || !button.closest('[data-task-id]')) return;
  const row = button.closest('[data-task-id]');
  const id = row.dataset.taskId;
  const action = button.dataset.action;

  if (action === 'edit') return loadTaskForEdit(id);
  if (action === 'toggle') {
    const select = row.querySelector('[data-action="status"]');
    select.value = select.value === 'completed' ? 'pending' : 'completed';
    return saveStatus(id, select);
  }
  if (action === 'delete' && window.confirm('Delete this task? This cannot be undone.')) {
    try {
      await apiRequest(`/api/v1/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
      showToast('Task deleted.');
      if (document.querySelectorAll('.task-row').length === 1 && state.page > 1) state.page -= 1;
      await loadTasks();
    } catch (error) {
      showToast(error.message, true);
    }
  }
});

async function saveStatus(id, select) {
  select.disabled = true;
  try {
    await apiRequest(`/api/v1/tasks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ status: select.value }),
    });
    showToast('Task status updated.');
    await loadTasks();
  } catch (error) {
    showToast(error.message, true);
    await loadTasks();
  } finally {
    select.disabled = false;
  }
}

elements.list.addEventListener('change', (event) => {
  if (event.target.matches('[data-action="status"]')) {
    saveStatus(event.target.closest('[data-task-id]').dataset.taskId, event.target);
  }
});

document.querySelector('#new-task-button').addEventListener('click', () => openTaskDialog());
document.querySelector('#close-dialog').addEventListener('click', () => elements.dialog.close());
document.querySelector('#cancel-dialog').addEventListener('click', () => elements.dialog.close());
elements.dialog.addEventListener('click', (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});
elements.dialog.addEventListener('close', () => {
  if (lastDialogTrigger?.isConnected) lastDialogTrigger.focus();
});
elements.search.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    state.q = elements.search.value.trim();
    elements.searchClear.hidden = !elements.search.value;
    state.page = 1;
    loadTasks();
  }, 250);
});
elements.searchClear.addEventListener('click', () => {
  elements.search.value = '';
  elements.searchClear.hidden = true;
  state.q = '';
  state.page = 1;
  elements.search.focus();
  loadTasks();
});
elements.statusFilter.addEventListener('change', () => {
  state.status = elements.statusFilter.value;
  state.page = 1;
  loadTasks();
});
elements.sort.addEventListener('change', () => {
  [state.sortBy, state.order] = elements.sort.value.split(':');
  state.page = 1;
  loadTasks();
});
document.querySelector('#previous-page').addEventListener('click', () => {
  if (state.page > 1) { state.page -= 1; loadTasks(); }
});
document.querySelector('#next-page').addEventListener('click', () => {
  if (state.page < state.totalPages) { state.page += 1; loadTasks(); }
});
elements.theme.addEventListener('change', () => setTheme(elements.theme.value));
document.querySelector('#mobile-menu-button').addEventListener('click', (event) => {
  const isOpen = elements.sidebar.classList.toggle('is-open');
  event.currentTarget.setAttribute('aria-expanded', String(isOpen));
  event.currentTarget.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
});
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    elements.search.focus();
  }
  if (event.key.toLowerCase() === 'n' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !elements.dialog.open) {
    event.preventDefault();
    openTaskDialog();
  }
});
document.querySelector('#today-label').textContent = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', month: 'short', day: 'numeric',
}).format(new Date());
loadTasks();
checkHealth();
