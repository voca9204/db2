/**
 * 환경 구성 검증 모듈
 * 
 * 이 모듈은 Firebase 프로젝트의 다중 환경 구성을 검증하고
 * 환경 간 일관성 및 안전성을 분석합니다.
 */

const fs = require('fs');
const path = require('path');
const colors = require('colors/safe');
const yaml = require('js-yaml');
const { execSync } = require('child_process');
const deepEqual = require('deep-equal');

// 프로젝트 루트 경로
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const REPORT_DIR = path.join(__dirname, 'reports');

// 로그 함수
const log = {
  info: (msg) => console.log(colors.cyan(`[INFO] ${msg}`)),
  warn: (msg) => console.log(colors.yellow(`[WARN] ${msg}`)),
  error: (msg) => console.log(colors.red(`[ERROR] ${msg}`)),
  success: (msg) => console.log(colors.green(`[SUCCESS] ${msg}`))
};

/**
 * 환경 구성 파일 찾기
 * @returns {Object} 환경별 구성 파일 경로
 */
function findEnvironmentFiles() {
  log.info('환경 구성 파일 찾는 중...');
  
  const environments = {
    firebase: {},
    functions: {},
    other: {}
  };
  
  // Firebase 구성 파일
  const firebaseConfigPatterns = [
    { pattern: 'firebase.json', env: 'default' },
    { pattern: 'firebase.*.json', env: 'custom' }
  ];  
  for (const { pattern, env } of firebaseConfigPatterns) {
    const files = findFiles(pattern);
    
    for (const file of files) {
      const basename = path.basename(file);
      
      if (basename === 'firebase.json') {
        environments.firebase.default = file;
      } else {
        const envName = basename.replace('firebase.', '').replace('.json', '');
        environments.firebase[envName] = file;
      }
    }
  }
  
  // Functions 환경 변수 파일
  const functionsEnvPatterns = [
    { pattern: 'functions/.env', env: 'default' },
    { pattern: 'functions/.env.*', env: 'custom' },
    { pattern: '.env', env: 'default' },
    { pattern: '.env.*', env: 'custom' }
  ];
  
  for (const { pattern, env } of functionsEnvPatterns) {
    const files = findFiles(pattern);
    
    for (const file of files) {
      const basename = path.basename(file);
      
      if (basename === '.env') {
        environments.functions.default = file;
      } else {
        const envName = basename.replace('.env.', '');
        environments.functions[envName] = file;
      }
    }
  }
  
  // 기타 구성 파일
  const otherConfigPatterns = [
    { pattern: '.firebaserc', env: 'default' },
    { pattern: 'firestore.rules', env: 'default' },
    { pattern: 'firestore.*.rules', env: 'custom' },
    { pattern: 'storage.rules', env: 'default' },
    { pattern: 'storage.*.rules', env: 'custom' }
  ];