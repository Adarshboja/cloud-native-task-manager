const taskService = require('../services/taskService');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const listTasks = asyncHandler(async (req, res) => {
  const result = await taskService.listTasks({
    status: req.query.status,
    q: req.query.q,
    sortBy: req.query.sortBy || 'created_at',
    order: req.query.order || 'desc',
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 10),
  });

  res.json({ success: true, data: result });
});

const getTask = asyncHandler(async (req, res, next) => {
  const task = await taskService.getTaskById(req.params.id);
  if (!task) {
    return next(Object.assign(new Error('Task not found.'), {
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
    }));
  }

  return res.json({ success: true, data: { task } });
});

const createTask = asyncHandler(async (req, res) => {
  const task = await taskService.createTask(req.body);
  res.status(201).json({ success: true, data: { task } });
});

const updateTask = asyncHandler(async (req, res, next) => {
  const task = await taskService.updateTask(req.params.id, req.body);
  if (!task) {
    return next(Object.assign(new Error('Task not found.'), {
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
    }));
  }

  return res.json({ success: true, data: { task } });
});

const deleteTask = asyncHandler(async (req, res, next) => {
  const deleted = await taskService.deleteTask(req.params.id);
  if (!deleted) {
    return next(Object.assign(new Error('Task not found.'), {
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
    }));
  }

  return res.status(204).end();
});

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask };
