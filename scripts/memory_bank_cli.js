#!/usr/bin/env node

/**
 * Memory Bank CLI - DB2 프로젝트 상태 관리
 * 
 * 사용법:
 *   node memory_bank_cli.js update "작업 상태 내용"
 *   node memory_bank_cli.js status
 *   node memory_bank_cli.js task 18 "태스크 제목"
 */

const path = require('path');
const { memory_bank_update, memory_bank_status, memory_bank_set_current_task } = require('./memory_bank');

// 프로젝트 루트 경로
const projectRoot = process.env.PROJECT_ROOT || path.resolve(__dirname, '..');

// 명령어 처리
const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
  case 'update':
    // 프로젝트 상태 업데이트
    const content = args[0] || '';
    const result = memory_bank_update(projectRoot, content);
    console.log(result.message);
    break;
    
  case 'status':
    // 현재 상태 확인
    const status = memory_bank_status(projectRoot);
    console.log('=== DB2 프로젝트 상태 ===');
    console.log(`마지막 업데이트: ${status.lastUpdate}`);
    console.log('\n=== 활성 태스크 ===');
    status.tasks.forEach(task => {
      console.log(`- #${task.id} ${task.title} (${task.status})`);
    });
    console.log('\n=== 상태 내용 ===');
    console.log(status.status);
    break;
    
  case 'task':
    // 현재 태스크 설정
    const taskId = parseInt(args[0], 10);
    const taskTitle = args[1] || '';
    
    if (isNaN(taskId)) {
      console.error('오류: 유효한 태스크 ID를 입력하세요.');
      process.exit(1);
    }
    
    const taskResult = memory_bank_set_current_task(projectRoot, taskId, taskTitle);
    console.log(taskResult.message);
    break;
    
  default:
    console.log(`
Memory Bank CLI - DB2 프로젝트 상태 관리

사용법:
  node memory_bank_cli.js update "작업 상태 내용"  - 프로젝트 상태 업데이트
  node memory_bank_cli.js status                  - 현재 상태 확인
  node memory_bank_cli.js task 18 "태스크 제목"     - 현재 태스크 설정
`);
}
