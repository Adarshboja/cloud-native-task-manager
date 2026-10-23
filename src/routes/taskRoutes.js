const express = require('express');
const taskController = require('../controllers/taskController');
const validateRequest = require('../middleware/validateRequest');
const {
  taskIdValidator,
  createTaskValidators,
  updateTaskValidators,
  listTaskValidators,
} = require('../validators/taskValidators');

const router = express.Router();

router.get('/', listTaskValidators, validateRequest, taskController.listTasks);
router.get('/:id', taskIdValidator, validateRequest, taskController.getTask);
router.post('/', createTaskValidators, validateRequest, taskController.createTask);
router.put('/:id', updateTaskValidators, validateRequest, taskController.updateTask);
router.delete('/:id', taskIdValidator, validateRequest, taskController.deleteTask);

module.exports = router;
