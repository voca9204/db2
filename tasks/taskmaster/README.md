# Task Master Compatibility Layer

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
