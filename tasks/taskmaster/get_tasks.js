// Get tasks module for Task Master
const { getAllTasks } = require('./index');

module.exports = function(options) {
    const tasks = getAllTasks();
    
    if (options.status) {
        tasks.tasks = tasks.tasks.filter(task => task.status === options.status);
    }
    
    if (!options.withSubtasks) {
        tasks.tasks = tasks.tasks.map(task => {
            const { subtasks, ...taskWithoutSubtasks } = task;
            return taskWithoutSubtasks;
        });
    }
    
    return tasks;
};
