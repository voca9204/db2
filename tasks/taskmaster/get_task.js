// Get task module for Task Master
const { getTaskById } = require('./index');

module.exports = function(options) {
    if (!options.id) {
        throw new Error('Task ID is required');
    }
    
    const task = getTaskById(options.id);
    if (!task) {
        throw new Error(`Task with ID ${options.id} not found`);
    }
    
    if (options.status && task.subtasks) {
        task.subtasks = task.subtasks.filter(subtask => subtask.status === options.status);
    }
    
    return task;
};
