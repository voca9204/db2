#!/usr/bin/env python3
"""
Task JSON Splitter Script (Enhanced for Task Master Compatibility)

This script splits a large tasks.json file into smaller, more manageable files:
1. A main index file (tasks_index.json) that Task Master can read
2. Individual task files (task_[id].json) compatible with Task Master
3. Group files for related tasks (group_[category].json)
4. Optional compatibility layer for tools that still expect a single tasks.json

Usage:
    python split_tasks.py [--backup] [--input FILEPATH] [--output DIRPATH] [--taskmaster-compat]

Options:
    --backup           Create a backup of the original tasks.json file
    --input            Path to the input tasks.json file (default: tasks/tasks.json)
    --output           Directory to store the split files (default: tasks/)
    --taskmaster-compat Create Task Master compatible structure
"""

import os
import sys
import json
import shutil
import argparse
from datetime import datetime


def parse_args():
    parser = argparse.ArgumentParser(description='Split tasks.json into smaller files')
    parser.add_argument('--backup', action='store_true', help='Create a backup of the original file')
    parser.add_argument('--input', default='tasks/tasks.json', help='Path to the input tasks.json file')
    parser.add_argument('--output', default='tasks/', help='Directory to store the split files')
    parser.add_argument('--taskmaster-compat', action='store_true', help='Create Task Master compatible structure')
    return parser.parse_args()


def create_backup(input_path):
    """Create a backup of the original tasks.json file."""
    backup_path = f"{input_path}.bak.{datetime.now().strftime('%Y%m%d%H%M%S')}"
    print(f"Creating backup: {backup_path}")
    shutil.copy2(input_path, backup_path)
    return backup_path


def load_tasks(input_path):
    """Load tasks from the input JSON file."""
    print(f"Loading tasks from {input_path}")
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data
    except Exception as e:
        print(f"Error loading tasks: {e}")
        sys.exit(1)


def identify_task_groups(tasks):
    """Identify logical groups of tasks based on dependencies and categories."""
    groups = {
        "firebase": {"title": "Firebase Migration Tasks", "task_ids": []},
        "analysis": {"title": "Data Analysis Tasks", "task_ids": []},
        "dashboard": {"title": "Dashboard & Visualization Tasks", "task_ids": []},
        "database": {"title": "Database Related Tasks", "task_ids": []},
        "security": {"title": "Security & Authentication Tasks", "task_ids": []}
    }
    
    for task in tasks:
        # Assign task to group based on keywords in title or description
        task_id = task.get('id')
        title = task.get('title', '').lower()
        desc = task.get('description', '').lower()
        
        if any(kw in title or kw in desc for kw in ['firebase', 'function', 'cloud']):
            groups["firebase"]["task_ids"].append(task_id)
        elif any(kw in title or kw in desc for kw in ['analysis', 'analyze', 'analytic']):
            groups["analysis"]["task_ids"].append(task_id)
        elif any(kw in title or kw in desc for kw in ['dashboard', 'visualization', 'chart']):
            groups["dashboard"]["task_ids"].append(task_id)
        elif any(kw in title or kw in desc for kw in ['database', 'schema', 'query']):
            groups["database"]["task_ids"].append(task_id)
        elif any(kw in title or kw in desc for kw in ['security', 'auth', 'access']):
            groups["security"]["task_ids"].append(task_id)
    
    # Remove empty groups
    groups = {k: v for k, v in groups.items() if v["task_ids"]}
    return groups


def create_task_index(tasks, groups, output_path):
    """Create the main task index file."""
    task_index = {
        "metadata": {
            "lastUpdated": datetime.now().isoformat(),
            "totalTasks": len(tasks),
            "completedTasks": sum(1 for task in tasks if task.get('status') == 'done')
        },
        "tasks": [
            {
                "id": task.get('id'),
                "title": task.get('title'),
                "status": task.get('status'),
                "file": f"task_{task.get('id')}.json"
            }
            for task in tasks
        ],
        "groups": [
            {
                "name": group_name,
                "title": group_info["title"],
                "file": f"group_{group_name}.json"
            }
            for group_name, group_info in groups.items()
        ]
    }
    
    index_path = os.path.join(output_path, "tasks_index.json")
    print(f"Creating task index: {index_path}")
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(task_index, f, indent=2, ensure_ascii=False)


def create_individual_task_files(tasks, output_path):
    """Create individual JSON files for each task."""
    for task in tasks:
        task_id = task.get('id')
        task_path = os.path.join(output_path, f"task_{task_id}.json")
        print(f"Creating task file: {task_path}")
        with open(task_path, 'w', encoding='utf-8') as f:
            json.dump(task, f, indent=2, ensure_ascii=False)


def create_group_files(tasks, groups, output_path):
    """Create group files for related tasks."""
    task_dict = {task.get('id'): task for task in tasks}
    
    for group_name, group_info in groups.items():
        group_tasks = [task_dict.get(task_id) for task_id in group_info["task_ids"] if task_id in task_dict]
        
        group_data = {
            "name": group_name,
            "title": group_info["title"],
            "taskCount": len(group_tasks),
            "tasks": group_tasks
        }
        
        group_path = os.path.join(output_path, f"group_{group_name}.json")
        print(f"Creating group file: {group_path}")
        with open(group_path, 'w', encoding='utf-8') as f:
            json.dump(group_data, f, indent=2, ensure_ascii=False)


def create_taskmaster_compat_files(tasks, output_path):
    """Create Task Master compatible file structure."""
    # Create taskmaster modules directory
    taskmaster_dir = os.path.join(output_path, "taskmaster")
    os.makedirs(taskmaster_dir, exist_ok=True)
    
    # Create index.js file for Task Master
    index_js = """// Task Master compatibility index
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
"""
    
    with open(os.path.join(taskmaster_dir, "index.js"), 'w', encoding='utf-8') as f:
        f.write(index_js)
    
    # Create individual module files for Task Master commands
    get_tasks_js = """// Get tasks module for Task Master
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
"""
    
    get_task_js = """// Get task module for Task Master
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
"""
    
    next_task_js = """// Next task module for Task Master
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
"""
    
    with open(os.path.join(taskmaster_dir, "get_tasks.js"), 'w', encoding='utf-8') as f:
        f.write(get_tasks_js)
    
    with open(os.path.join(taskmaster_dir, "get_task.js"), 'w', encoding='utf-8') as f:
        f.write(get_task_js)
        
    with open(os.path.join(taskmaster_dir, "next_task.js"), 'w', encoding='utf-8') as f:
        f.write(next_task_js)
    
    # Create README file for Task Master compatibility
    readme = """# Task Master Compatibility Layer

This directory contains compatibility files that allow Task Master to work with the split task file structure.

## Files
- `index.js`: Core functionality for loading tasks from individual files
- `get_tasks.js`: Implementation of the `get_tasks` command
- `get_task.js`: Implementation of the `get_task` command
- `next_task.js`: Implementation of the `next_task` command

## Usage
Use Task Master commands as normal, pointing to this project:

```bash
npx taskmaster get_tasks --projectRoot=/path/to/project
npx taskmaster get_task --id=1 --projectRoot=/path/to/project
npx taskmaster next_task --projectRoot=/path/to/project
```

This compatibility layer will handle loading the tasks from the split files.
"""
    
    with open(os.path.join(taskmaster_dir, "README.md"), 'w', encoding='utf-8') as f:
        f.write(readme)
    
    print(f"Task Master compatibility files created in {taskmaster_dir}")


def main():
    args = parse_args()
    
    # Ensure output directory exists
    os.makedirs(args.output, exist_ok=True)
    
    # Create backup if requested
    if args.backup:
        backup_path = create_backup(args.input)
        print(f"Backup created at: {backup_path}")
    
    # Load tasks
    data = load_tasks(args.input)
    tasks = data.get('tasks', [])
    
    if not tasks:
        print("No tasks found in the input file.")
        sys.exit(1)
    
    # Identify task groups
    groups = identify_task_groups(tasks)
    
    # Create the split files
    create_task_index(tasks, groups, args.output)
    create_individual_task_files(tasks, args.output)
    create_group_files(tasks, groups, args.output)
    
    # Create Task Master compatibility files if requested
    if args.taskmaster_compat:
        create_taskmaster_compat_files(tasks, args.output)
    
    print("\nTask splitting completed successfully!")
    print(f"Task index: {os.path.join(args.output, 'tasks_index.json')}")
    print(f"Individual tasks: {len(tasks)} files")
    print(f"Task groups: {len(groups)} files")
    if args.taskmaster_compat:
        print(f"Task Master compatibility layer: {os.path.join(args.output, 'taskmaster')}")


if __name__ == "__main__":
    main()
