const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const app = require('../src/app');
const pool = require('../src/config/db');

test('Task Manager API integrates with PostgreSQL without disturbing existing tasks', async (t) => {
  const baseline = await pool.query('SELECT id::text AS id FROM tasks');
  const baselineIds = baseline.rows.map(({ id }) => id);
  const baselineMetricsResult = await pool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'pending')::int AS pending,
            count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
            count(*) FILTER (WHERE status = 'completed')::int AS completed
     FROM tasks`,
  );
  const baselineMetrics = baselineMetricsResult.rows[0];
  const createdIds = [];
  const marker = `api-test-${randomUUID()}`;
  const server = app.listen(0, '127.0.0.1');

  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function request(path, options) {
    const response = await fetch(`${baseUrl}${path}`, options);
    const payload = response.status === 204 ? null : await response.json();
    return { response, payload };
  }

  async function createTask(title, status = 'pending', description = 'Integration test task') {
    const result = await request('/api/v1/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, status }),
    });
    assert.equal(result.response.status, 201);
    assert.equal(result.payload.success, true);
    createdIds.push(result.payload.data.task.id);
    return result.payload.data.task;
  }

  try {
    await t.test('health reports the live PostgreSQL connection', async () => {
      const { response, payload } = await request('/health');
      assert.equal(response.status, 200);
      assert.equal(payload.success, true);
      assert.equal(payload.data.database, 'connected');
    });

    await t.test('serves the dashboard and local assets with security headers', async () => {
      const page = await fetch(baseUrl);
      const html = await page.text();
      assert.equal(page.status, 200);
      assert.match(page.headers.get('content-type'), /text\/html/);
      assert.match(html, /Taskflow/);
      assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(page.headers.get('x-frame-options'), 'DENY');

      for (const asset of ['/styles.css', '/app.js', '/theme-init.js']) {
        const response = await fetch(`${baseUrl}${asset}`);
        assert.equal(response.status, 200, asset);
        assert.ok(Number(response.headers.get('content-length')) > 0, asset);
      }
    });

    const pendingTask = await createTask(`${marker}-alpha`, 'pending', 'unique search phrase');
    const progressTask = await createTask(`${marker}-beta`, 'in_progress');
    const completedTask = await createTask(`${marker}-gamma`, 'completed');

    await t.test('list supports search, status, sort, pagination, and real metrics', async () => {
      const search = await request(`/api/v1/tasks?q=${marker}&sortBy=title&order=asc&page=1&limit=2`);
      assert.equal(search.response.status, 200);
      assert.equal(search.payload.success, true);
      assert.equal(search.payload.data.tasks.length, 2);
      assert.equal(search.payload.data.tasks[0].title, `${marker}-alpha`);
      assert.equal(search.payload.data.pagination.total, 3);
      assert.equal(search.payload.data.pagination.totalPages, 2);
      assert.equal(search.payload.data.metrics.total, baselineMetrics.total + 3);
      assert.equal(search.payload.data.metrics.pending, baselineMetrics.pending + 1);
      assert.equal(search.payload.data.metrics.in_progress, baselineMetrics.in_progress + 1);
      assert.equal(search.payload.data.metrics.completed, baselineMetrics.completed + 1);

      const filtered = await request(`/api/v1/tasks?q=${marker}&status=in_progress`);
      assert.equal(filtered.payload.data.tasks.length, 1);
      assert.equal(filtered.payload.data.tasks[0].id, progressTask.id);
    });

    await t.test('validates filters and pagination', async () => {
      for (const path of [
        '/api/v1/tasks?status=unknown',
        '/api/v1/tasks?sortBy=unsafe',
        '/api/v1/tasks?order=sideways',
        '/api/v1/tasks?page=0',
        '/api/v1/tasks?limit=101',
      ]) {
        const { response, payload } = await request(path);
        assert.equal(response.status, 400, path);
        assert.equal(payload.success, false);
      }
    });

    await t.test('validates task creation and malformed JSON', async () => {
      const cases = [
        {},
        { title: '   ' },
        { title: 'x'.repeat(201) },
        { title: 'Invalid status', status: 'blocked' },
        { title: 'Unsupported field', unexpected: true },
      ];

      for (const body of cases) {
        const { response, payload } = await request('/api/v1/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        assert.equal(response.status, 400);
        assert.equal(payload.success, false);
        assert.equal(payload.error.code, 'VALIDATION_ERROR');
      }

      const malformed = await request('/api/v1/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      });
      assert.equal(malformed.response.status, 400);
      assert.equal(malformed.payload.error.code, 'INVALID_JSON');
    });

    await t.test('fetches persisted tasks and rejects invalid or missing IDs', async () => {
      const persisted = await request(`/api/v1/tasks/${pendingTask.id}`);
      assert.equal(persisted.response.status, 200);
      assert.equal(persisted.payload.data.task.title, `${marker}-alpha`);

      for (const id of ['0', 'abc', '9223372036854775808']) {
        const invalid = await request(`/api/v1/tasks/${id}`);
        assert.equal(invalid.response.status, 400);
        assert.equal(invalid.payload.success, false);
      }

      const missing = await request('/api/v1/tasks/9223372036854775807');
      assert.equal(missing.response.status, 404);
      assert.equal(missing.payload.error.code, 'TASK_NOT_FOUND');
    });

    await t.test('updates task fields and updated_at', async () => {
      const before = await pool.query('SELECT updated_at FROM tasks WHERE id = $1', [pendingTask.id]);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const updated = await request(`/api/v1/tasks/${pendingTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `${marker}-updated`, status: 'in_progress' }),
      });
      assert.equal(updated.response.status, 200);
      assert.equal(updated.payload.data.task.title, `${marker}-updated`);
      assert.equal(updated.payload.data.task.status, 'in_progress');
      assert.ok(new Date(updated.payload.data.task.updated_at) > new Date(before.rows[0].updated_at));

      const invalid = await request(`/api/v1/tasks/${pendingTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'unknown' }),
      });
      assert.equal(invalid.response.status, 400);

      const empty = await request(`/api/v1/tasks/${pendingTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(empty.response.status, 400);
    });

    await t.test('deletes only the requested task and handles unknown routes', async () => {
      const deleted = await request(`/api/v1/tasks/${completedTask.id}`, { method: 'DELETE' });
      assert.equal(deleted.response.status, 204);
      createdIds.splice(createdIds.indexOf(completedTask.id), 1);

      const missing = await request(`/api/v1/tasks/${completedTask.id}`, { method: 'DELETE' });
      assert.equal(missing.response.status, 404);

      const unknown = await request('/api/v1/not-a-route');
      assert.equal(unknown.response.status, 404);
      assert.equal(unknown.payload.error.code, 'NOT_FOUND');
    });
  } finally {
    if (createdIds.length > 0) {
      await pool.query('DELETE FROM tasks WHERE id = ANY($1::bigint[])', [createdIds]);
    }
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    const after = await pool.query('SELECT id::text AS id FROM tasks');
    const remainingIds = new Set(after.rows.map(({ id }) => id));
    assert.ok(baselineIds.every((id) => remainingIds.has(id)), 'all pre-existing tasks must remain');
    await pool.end();
  }
});
