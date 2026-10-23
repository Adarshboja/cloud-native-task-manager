const { body, param, query } = require('express-validator');

const TASK_STATUSES = ['pending', 'in_progress', 'completed'];
const TASK_FIELDS = ['title', 'description', 'status'];
const SORT_FIELDS = ['id', 'title', 'status', 'created_at', 'updated_at'];

const taskIdValidator = param('id')
  .matches(/^[1-9]\d{0,18}$/)
  .withMessage('id must be a positive PostgreSQL BIGINT')
  .bail()
  .custom((value) => BigInt(value) <= 9223372036854775807n)
  .withMessage('id exceeds the PostgreSQL BIGINT limit');

const createTaskValidators = [
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be a JSON object');
    }
    if (Object.keys(value).some((field) => !TASK_FIELDS.includes(field))) {
      throw new Error('Request body contains an unsupported field');
    }
    return true;
  }),
  body('title')
    .exists({ checkFalsy: false })
    .withMessage('title is required')
    .bail()
    .isString()
    .withMessage('title must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('title must not be empty')
    .isLength({ max: 200 })
    .withMessage('title must be at most 200 characters'),
  body('description')
    .optional({ nullable: true })
    .isString()
    .withMessage('description must be a string')
    .bail()
    .isLength({ max: 5000 })
    .withMessage('description must be at most 5000 characters'),
  body('status')
    .optional()
    .isIn(TASK_STATUSES)
    .withMessage(`status must be one of: ${TASK_STATUSES.join(', ')}`),
];

const updateTaskValidators = [
  taskIdValidator,
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be a JSON object');
    }
    const fields = Object.keys(value);
    if (fields.length === 0) {
      throw new Error('At least one task field must be provided');
    }
    if (fields.some((field) => !TASK_FIELDS.includes(field))) {
      throw new Error('Request body contains an unsupported field');
    }
    return true;
  }),
  body('title')
    .optional()
    .isString()
    .withMessage('title must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('title must not be empty')
    .isLength({ max: 200 })
    .withMessage('title must be at most 200 characters'),
  body('description')
    .optional({ nullable: true })
    .isString()
    .withMessage('description must be a string')
    .bail()
    .isLength({ max: 5000 })
    .withMessage('description must be at most 5000 characters'),
  body('status')
    .optional()
    .isIn(TASK_STATUSES)
    .withMessage(`status must be one of: ${TASK_STATUSES.join(', ')}`),
];

const listTaskValidators = [
  query('status').optional().isIn(TASK_STATUSES)
    .withMessage(`status must be one of: ${TASK_STATUSES.join(', ')}`),
  query('q').optional().isString().trim().isLength({ max: 200 })
    .withMessage('q must be at most 200 characters'),
  query('sortBy').optional().isIn(SORT_FIELDS)
    .withMessage(`sortBy must be one of: ${SORT_FIELDS.join(', ')}`),
  query('order').optional().isIn(['asc', 'desc'])
    .withMessage('order must be asc or desc'),
  query('page').optional().isInt({ min: 1 })
    .withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100'),
];

module.exports = {
  taskIdValidator,
  createTaskValidators,
  updateTaskValidators,
  listTaskValidators,
};
