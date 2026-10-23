const pool = require('../config/db');

const SORT_COLUMNS = {
  id: 'id',
  title: 'title',
  status: 'status',
  created_at: 'created_at',
  updated_at: 'updated_at',
};

function buildFilters({ status, q }) {
  const clauses = [];
  const values = [];

  if (status) {
    values.push(status);
    clauses.push(`status = $${values.length}`);
  }

  if (q) {
    values.push(`%${q}%`);
    clauses.push(
      `(title ILIKE $${values.length} OR COALESCE(description, '') ILIKE $${values.length})`,
    );
  }

  return {
    values,
    where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
  };
}

async function listTasks({ status, q, sortBy, order, page, limit }) {
  const filters = buildFilters({ status, q });
  const sortColumn = SORT_COLUMNS[sortBy];
  const sortDirection = order.toUpperCase();
  const offset = (page - 1) * limit;

  const [tasksResult, countResult, metricsResult] = await Promise.all([
    pool.query(
      `SELECT id::text AS id, title, description, status, created_at, updated_at
       FROM tasks ${filters.where}
       ORDER BY ${sortColumn} ${sortDirection}, id ASC
       LIMIT $${filters.values.length + 1} OFFSET $${filters.values.length + 2}`,
      [...filters.values, limit, offset],
    ),
    pool.query(
      `SELECT count(*)::int AS total FROM tasks ${filters.where}`,
      filters.values,
    ),
    pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'pending')::int AS pending,
              count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
              count(*) FILTER (WHERE status = 'completed')::int AS completed
       FROM tasks`,
    ),
  ]);

  const total = countResult.rows[0].total;

  return {
    tasks: tasksResult.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    metrics: metricsResult.rows[0],
  };
}

async function getTaskById(id) {
  const result = await pool.query(
    `SELECT id::text AS id, title, description, status, created_at, updated_at
     FROM tasks WHERE id = $1`,
    [id],
  );

  return result.rows[0] || null;
}

async function createTask({ title, description, status }) {
  const result = await pool.query(
    `INSERT INTO tasks (title, description, status)
     VALUES ($1, $2, $3)
     RETURNING id::text AS id, title, description, status, created_at, updated_at`,
    [title, description ?? null, status || 'pending'],
  );

  return result.rows[0];
}

async function updateTask(id, changes) {
  const fields = [];
  const values = [];

  for (const field of ['title', 'description', 'status']) {
    if (Object.prototype.hasOwnProperty.call(changes, field)) {
      values.push(changes[field]);
      fields.push(`${field} = $${values.length}`);
    }
  }

  values.push(id);
  const result = await pool.query(
    `UPDATE tasks SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${values.length}
     RETURNING id::text AS id, title, description, status, created_at, updated_at`,
    values,
  );

  return result.rows[0] || null;
}

async function deleteTask(id) {
  const result = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
  return result.rowCount > 0;
}

module.exports = {
  listTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
};
