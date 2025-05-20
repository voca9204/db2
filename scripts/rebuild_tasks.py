#!/usr/bin/env python3
"""
Task JSON Rebuilder Script

This script rebuilds a tasks.json file from split task files, enabling compatibility
with tools that expect a single monolithic tasks.json file.

Usage:
    python rebuild_tasks.py [--input DIRPATH] [--output FILEPATH]

Options:
    --input     Directory containing split task files (default: tasks/)
    --output    Path for the output tasks.json file (default: tasks/tasks.json)
"""

import os
import sys
import json
import argparse
from datetime import datetime


def parse_args():
    parser = argparse.ArgumentParser(description='Rebuild tasks.json from split files')
    parser.add_argument('--input', default='tasks/', help='Directory containing split task files')
    parser.add_argument('--output', default='tasks/tasks.json', help='Path for the output tasks.json file')
    return parser.parse_args()


def load_task_index(input_dir):
    """Load task index file to get task IDs and files."""
    index_path = os.path.join(input_dir, "tasks_index.json")
    if not os.path.exists(index_path):
        print(f"Error: Task index file not found at {index_path}")
        sys.exit(1)
    
    try:
        with open(index_path, 'r', encoding='utf-8') as f:
            index = json.load(f)
        return index
    except Exception as e:
        print(f"Error loading task index: {e}")
        sys.exit(1)


def load_task_files(task_index, input_dir):
    """Load individual task files and assemble tasks list."""
    tasks = []
    
    # Sort tasks by ID to maintain original order
    sorted_tasks = sorted(task_index.get('tasks', []), key=lambda t: int(t.get('id', 0)))
    
    for task_info in sorted_tasks:
        task_id = task_info.get('id')
        task_file = task_info.get('file')
        
        if not task_file:
            print(f"Warning: Task {task_id} has no file specified")
            continue
        
        task_path = os.path.join(input_dir, task_file)
        if not os.path.exists(task_path):
            print(f"Warning: Task file not found at {task_path}")
            continue
        
        try:
            with open(task_path, 'r', encoding='utf-8') as f:
                task = json.load(f)
            tasks.append(task)
        except Exception as e:
            print(f"Error loading task file {task_path}: {e}")
    
    return tasks


def main():
    args = parse_args()
    
    # Load task index
    print(f"Loading task index from {args.input}")
    task_index = load_task_index(args.input)
    
    # Load individual task files
    print("Loading individual task files")
    tasks = load_task_files(task_index, args.input)
    
    if not tasks:
        print("No tasks were found or could be loaded.")
        sys.exit(1)
    
    # Create tasks.json
    tasks_json = {
        "tasks": tasks,
        "metadata": {
            "lastRebuild": datetime.now().isoformat(),
            "taskCount": len(tasks)
        }
    }
    
    # Save to output file
    try:
        print(f"Saving rebuilt tasks.json to {args.output}")
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(tasks_json, f, indent=2, ensure_ascii=False)
        print(f"Successfully rebuilt tasks.json with {len(tasks)} tasks")
    except Exception as e:
        print(f"Error saving tasks.json: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
