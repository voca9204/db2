// Task Master compatibility index
const fs = require('fs');
const path = require('path');

// Task index mapping
const taskIndex = {};

// Helper to load a task by ID
function loadTaskById(id) {
    const taskPath = path.join(__dirname, '..', `task_${id}.json`);
    if (fs.existsSync(taskPath)) {
        return JSON.parse(fs.readFileSync(taskPath, 'utf8'));
    }
    return null;
}

// Get all tasks function
function getAllTasks() {
    const indexPath = path.join(__dirname, '..', 'tasks_index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    
    return {
        tasks: index.tasks.map(task => loadTaskById(task.id))
    };
}

// Get specific task function
function getTaskById(id) {
    return loadTaskById(id);
}

// Export functions
module.exports = {
    getAllTasks,
    getTaskById
};
