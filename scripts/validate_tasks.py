#!/usr/bin/env python3
"""
Task File Validator Script

This script validates the task file structure to ensure all required files exist
and have the correct structure for Task Master compatibility.

Usage:
    python validate_tasks.py [--dir DIRPATH] [--fix]

Options:
    --dir    Directory containing task files (default: tasks/)
    --fix    Attempt to fix common issues automatically
"""

import os
import sys
import json
import argparse
from datetime import datetime


def parse_args():
    parser = argparse.ArgumentParser(description='Validate task file structure')
    parser.add_argument('--dir', default='tasks/', help='Directory containing task files')
    parser.add_argument('--fix', action='store_true', help='Attempt to fix common issues automatically')
    return parser.parse_args()


def validate_task_index(task_dir, fix=False):
    """Validate the task index file."""
    index_path = os.path.join(task_dir, "tasks_index.json")
    issues = []
    
    if not os.path.exists(index_path):
        issues.append(f"Task index file not found at {index_path}")
        if fix:
            # We can't fix a missing index file without additional information
            pass
        return issues
    
    try:
        with open(index_path, 'r', encoding='utf-8') as f:
            index = json.load(f)
        
        # Check if index has the required structure
        if not isinstance(index, dict):
            issues.append("Task index is not a dictionary/object")
            return issues
        
        if "tasks" not in index:
            issues.append("Task index missing 'tasks' array")
            if fix:
                index["tasks"] = []
        
        if "metadata" not in index:
            issues.append("Task index missing 'metadata' object")
            if fix:
                index["metadata"] = {
                    "lastUpdated": datetime.now().isoformat(),
                    "totalTasks": len(index.get("tasks", [])),
                    "completedTasks": 0
                }
        
        # Check task entries
        if "tasks" in index:
            for i, task in enumerate(index["tasks"]):
                if "id" not in task:
                    issues.append(f"Task at index {i} is missing 'id' field")
                if "file" not in task:
                    task_id = task.get("id", f"unknown_{i}")
                    issues.append(f"Task {task_id} is missing 'file' field")
                    if fix:
                        task["file"] = f"task_{task_id}.json"
                else:
                    task_path = os.path.join(task_dir, task["file"])
                    if not os.path.exists(task_path):
                        issues.append(f"Task file not found: {task_path}")
        
        # Save fixed index if needed
        if fix and issues:
            with open(index_path, 'w', encoding='utf-8') as f:
                json.dump(index, f, indent=2, ensure_ascii=False)
            issues.append("Fixed task index file")
        
        return issues
    
    except Exception as e:
        issues.append(f"Error processing task index: {str(e)}")
        return issues


def validate_task_files(task_dir, fix=False):
    """Validate individual task files."""
    index_path = os.path.join(task_dir, "tasks_index.json")
    issues = []
    
    if not os.path.exists(index_path):
        issues.append(f"Task index file not found at {index_path}")
        return issues
    
    try:
        with open(index_path, 'r', encoding='utf-8') as f:
            index = json.load(f)
        
        if "tasks" not in index:
            issues.append("Task index missing 'tasks' array")
            return issues
        
        for task_info in index["tasks"]:
            task_id = task_info.get("id")
            task_file = task_info.get("file")
            
            if not task_file:
                continue  # Already reported in validate_task_index
            
            task_path = os.path.join(task_dir, task_file)
            if not os.path.exists(task_path):
                if fix:
                    # Create a minimal valid task file
                    minimal_task = {
                        "id": task_id,
                        "title": f"Task {task_id}",
                        "description": "This is a placeholder task created by the validator",
                        "status": "pending",
                        "dependencies": []
                    }
                    with open(task_path, 'w', encoding='utf-8') as f:
                        json.dump(minimal_task, f, indent=2, ensure_ascii=False)
                    issues.append(f"Created placeholder task file: {task_path}")
                continue  # Already reported in validate_task_index
            
            try:
                with open(task_path, 'r', encoding='utf-8') as f:
                    task = json.load(f)
                
                # Check required fields
                required_fields = ["id", "title", "description", "status"]
                for field in required_fields:
                    if field not in task:
                        issues.append(f"Task {task_id} is missing required field: {field}")
                        if fix and field != "id":  # We can't fix a missing ID
                            if field == "title":
                                task[field] = f"Task {task_id}"
                            elif field == "description":
                                task[field] = "No description provided"
                            elif field == "status":
                                task[field] = "pending"
                
                # Check ID consistency
                if "id" in task and task["id"] != task_id:
                    issues.append(f"Task ID mismatch: {task_path} has ID {task['id']} but index expects {task_id}")
                    if fix:
                        task["id"] = task_id
                        issues.append(f"Fixed ID in {task_path}")
                
                # Save fixed task if needed
                if fix and issues:
                    with open(task_path, 'w', encoding='utf-8') as f:
                        json.dump(task, f, indent=2, ensure_ascii=False)
            
            except Exception as e:
                issues.append(f"Error processing task file {task_path}: {str(e)}")
        
        return issues
    
    except Exception as e:
        issues.append(f"Error loading task index: {str(e)}")
        return issues


def validate_taskmaster_compat(task_dir, fix=False):
    """Validate Task Master compatibility files."""
    taskmaster_dir = os.path.join(task_dir, "taskmaster")
    issues = []
    
    if not os.path.exists(taskmaster_dir):
        issues.append(f"Task Master compatibility directory not found at {taskmaster_dir}")
        if fix:
            os.makedirs(taskmaster_dir, exist_ok=True)
            issues.append(f"Created Task Master compatibility directory: {taskmaster_dir}")
        else:
            return issues
    
    required_files = ["index.js", "get_tasks.js", "get_task.js", "next_task.js"]
    for file in required_files:
        file_path = os.path.join(taskmaster_dir, file)
        if not os.path.exists(file_path):
            issues.append(f"Missing Task Master compatibility file: {file}")
            # We can't fix missing files without knowing their contents
    
    return issues


def main():
    args = parse_args()
    
    print(f"Validating task files in {args.dir}")
    
    # Validate task index
    print("\nValidating task index...")
    index_issues = validate_task_index(args.dir, args.fix)
    for issue in index_issues:
        print(f"- {issue}")
    
    # Validate task files
    print("\nValidating task files...")
    file_issues = validate_task_files(args.dir, args.fix)
    for issue in file_issues:
        print(f"- {issue}")
    
    # Validate Task Master compatibility
    print("\nValidating Task Master compatibility...")
    compat_issues = validate_taskmaster_compat(args.dir, args.fix)
    for issue in compat_issues:
        print(f"- {issue}")
    
    # Summary
    total_issues = len(index_issues) + len(file_issues) + len(compat_issues)
    if total_issues == 0:
        print("\n✅ Validation successful. No issues found!")
    else:
        print(f"\n❌ Validation found {total_issues} issues.")
        if args.fix:
            print("Attempted to fix issues automatically. Please review the changes.")
        else:
            print("Run with --fix to attempt automatic fixes.")


if __name__ == "__main__":
    main()
