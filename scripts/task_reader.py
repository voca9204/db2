#!/usr/bin/env python3
"""
Task Reader Script

This script provides a simple way to read and process the tasks.json file,
even when the file is very large. It supports reading specific tasks,
filtering tasks by status, and extracting subtasks.

Usage:
    python task_reader.py [--task ID] [--status STATUS] [--subtasks] [--output OUTPUT]

Options:
    --task ID       Show specific task by ID
    --status        Filter tasks by status (pending, in-progress, done, etc.)
    --subtasks      Include subtasks in the output
    --output        Output file path (default: stdout)
"""

import os
import sys
import json
import argparse
from datetime import datetime


def parse_args():
    parser = argparse.ArgumentParser(description='Read and process tasks.json')
    parser.add_argument('--task', type=int, help='Show specific task by ID')
    parser.add_argument('--status', help='Filter tasks by status')
    parser.add_argument('--subtasks', action='store_true', help='Include subtasks in the output')
    parser.add_argument('--output', help='Output file path (default: stdout)')
    return parser.parse_args()


def read_task_by_id(task_id, input_path='tasks/tasks.json'):
    """Read a specific task by ID using grep to avoid loading the entire file."""
    try:
        # First find the task in the file using grep
        import subprocess
        cmd = f"grep -n '\"id\": {task_id},' {input_path}"
        grep_output = subprocess.getoutput(cmd)
        
        if not grep_output:
            print(f"Task {task_id} not found.")
            return None
        
        # Get the line number where the task starts
        line_num = int(grep_output.split(':')[0])
        
        # Read the task JSON object using sed by capturing content between { and its matching }
        # This is a simplification and might not work for all complex JSON structures
        cmd = f"sed -n '{line_num},/^      }}$/p' {input_path}"
        task_json_str = subprocess.getoutput(cmd)
        
        # Add enclosing brackets to make it valid JSON
        task_json_str = "{" + task_json_str + "}"
        
        # Parse the JSON
        task = json.loads(task_json_str)
        return task
    except Exception as e:
        print(f"Error reading task {task_id}: {e}")
        return None


def read_tasks_by_status(status, input_path='tasks/tasks.json', include_subtasks=False):
    """Read tasks filtered by status using grep and sed."""
    try:
        # Find all task ranges with the status
        import subprocess
        cmd = f"grep -n '\"status\": \"{status}\"' {input_path}"
        grep_output = subprocess.getoutput(cmd)
        
        if not grep_output:
            print(f"No tasks with status '{status}' found.")
            return []
        
        # Process each match
        tasks = []
        for line in grep_output.splitlines():
            line_num = int(line.split(':')[0])
            
            # Go backwards to find the start of the task JSON object
            cmd = f"sed -n '{max(1, line_num-20)},{line_num}p' {input_path} | grep -n '\"id\": '"
            id_line = subprocess.getoutput(cmd)
            
            if id_line:
                # Extract the task ID
                import re
                task_id_match = re.search(r'"id": (\d+)', id_line)
                if task_id_match:
                    task_id = int(task_id_match.group(1))
                    # Read the full task using the task_id
                    task = read_task_by_id(task_id, input_path)
                    if task and (include_subtasks or 'subtasks' not in task):
                        tasks.append(task)
        
        return tasks
    except Exception as e:
        print(f"Error reading tasks with status '{status}': {e}")
        return []


def main():
    args = parse_args()
    
    # Default input path
    input_path = 'tasks/tasks.json'
    
    # Read specific task or filtered tasks
    if args.task:
        task = read_task_by_id(args.task, input_path)
        if task:
            output = json.dumps(task, indent=2, ensure_ascii=False)
            if args.output:
                with open(args.output, 'w', encoding='utf-8') as f:
                    f.write(output)
            else:
                print(output)
    elif args.status:
        tasks = read_tasks_by_status(args.status, input_path, args.subtasks)
        if tasks:
            output = json.dumps({"tasks": tasks}, indent=2, ensure_ascii=False)
            if args.output:
                with open(args.output, 'w', encoding='utf-8') as f:
                    f.write(output)
            else:
                print(output)
    else:
        print("Please specify either --task or --status.")
        sys.exit(1)


if __name__ == "__main__":
    main()
