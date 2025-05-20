// Next task module for Task Master
const { getAllTasks } = require('./index');

module.exports = function(options) {
    const allTasks = getAllTasks();
    const pendingTasks = allTasks.tasks.filter(task => task.status === 'pending');
    
    if (pendingTasks.length === 0) {
        return { message: "No pending tasks found" };
    }
    
    // Get tasks without pending dependencies
    const tasksWithDependencies = pendingTasks.filter(task => 
        task.dependencies && task.dependencies.length > 0
    );
    
    // Find the first task that has all dependencies completed
    for (const task of tasksWithDependencies) {
        const allDependenciesDone = task.dependencies.every(depId => {
            const depTask = allTasks.tasks.find(t => t.id === depId);
            return depTask && depTask.status === 'done';
        });
        
        if (allDependenciesDone) {
            return task;
        }
    }
    
    // If no task with satisfied dependencies, return first pending task without dependencies
    const taskWithoutDependencies = pendingTasks.find(task => 
        !task.dependencies || task.dependencies.length === 0
    );
    
    if (taskWithoutDependencies) {
        return taskWithoutDependencies;
    }
    
    // If all tasks have unsatisfied dependencies, return the one with the fewest
    return pendingTasks.sort((a, b) => 
        (a.dependencies?.length || 0) - (b.dependencies?.length || 0)
    )[0];
};
