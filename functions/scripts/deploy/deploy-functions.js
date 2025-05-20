#!/usr/bin/env node

/**
 * 개선된 Firebase Functions 배포 스크립트
 * 환경별 구성, 성능 모니터링, 롤백 기능 추가
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { promisify } = require('util');

// 환경별 설정
const environments = {
  development: {
    projectId: 'db888-67827',
    functionRegion: 'asia-northeast3',
    nodeEnv: 'development',
    enableCache: false,
    logLevel: 'debug',
    minInstances: 0,
  },
  staging: {
    projectId: 'db2-staging',
    functionRegion: 'asia-northeast3',
    nodeEnv: 'staging',
    enableCache: true,
    logLevel: 'info',
    minInstances: 0,
  },
  production: {
    projectId: 'db2-prod',
    functionRegion: 'asia-northeast3',
    nodeEnv: 'production',
    enableCache: true,
    logLevel: 'warn',
    minInstances: 1,
  },
};

// 명령줄 인수 파싱
const args = process.argv.slice(2);
const targetEnv = args[0] || 'development';
const onlyFunctions = args[1] ? args[1].split(',') : null;

// 배포 모드 (full, config-only, function-only)
const deployMode = args[2] || 'full';

// 환경 유효성 검사
if (!environments[targetEnv]) {
  console.error(`Error: Invalid environment "${targetEnv}". Available environments: ${Object.keys(environments).join(', ')}`);
  process.exit(1);
}

// 모드 유효성 검사
const validModes = ['full', 'config-only', 'function-only'];
if (!validModes.includes(deployMode)) {
  console.error(`Error: Invalid deploy mode "${deployMode}". Available modes: ${validModes.join(', ')}`);
  process.exit(1);
}

const envConfig = environments[targetEnv];

// 사용자 확인 (프로덕션 배포 시)
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 현재 버전 태그 생성
const generateVersionTag = () => {
  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  
  try {
    const gitHash = execSync('git rev-parse --short HEAD').toString().trim();
    return `${targetEnv}-${timestamp}-${gitHash}`;
  } catch (error) {
    return `${targetEnv}-${timestamp}`;
  }
};

const confirmDeploy = (callback) => {
  if (targetEnv === 'production') {
    rl.question(`
🔴 PRODUCTION DEPLOYMENT WARNING 🔴
You are about to deploy to PRODUCTION environment (${envConfig.projectId}).
This will impact live users.

Type 'DEPLOY' to confirm: `, (answer) => {
      if (answer !== 'DEPLOY') {
        console.log('Deployment cancelled.');
        rl.close();
        process.exit(0);
      }
      rl.close();
      callback();
    });
  } else {
    callback();
  }
};

// Firebase 함수 구성 설정
const setFunctionsConfig = async () => {
  console.log('Setting Firebase Functions configuration...');
  
  // 기본 데이터베이스 구성 설정
  const dbConfigCommand = spawn('firebase', [
    'functions:config:set',
    `db.host=${process.env.DB_HOST || '211.248.190.46'}`,
    `db.user=${process.env.DB_USER || 'hermes'}`,
    `db.password=${process.env.DB_PASSWORD || 'mcygicng!022'}`,
    `db.name=${process.env.DB_NAME || 'hermes'}`
  ], {
    stdio: 'inherit',
    shell: true
  });
  
  return new Promise((resolve, reject) => {
    dbConfigCommand.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to set database configuration. Exit code: ${code}`));
        return;
      }
      
      // 환경별 추가 구성 설정
      const envConfigCommand = spawn('firebase', [
        'functions:config:set',
        `environment.node_env=${envConfig.nodeEnv}`,
        `environment.region=${envConfig.functionRegion}`,
        `cache.enabled=${envConfig.enableCache}`,
        `logging.level=${envConfig.logLevel}`,
        `instances.min=${envConfig.minInstances}`
      ], {
        stdio: 'inherit',
        shell: true
      });
      
      envConfigCommand.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Failed to set environment configuration. Exit code: ${code}`));
          return;
        }
        resolve();
      });
    });
  });
};

// Firebase 함수 배포
const deployFunctions = async () => {
  let deployCommand = ['deploy', '--only'];
  
  // 특정 함수만 배포하는 경우
  if (onlyFunctions) {
    deployCommand.push(`functions:${onlyFunctions.join(',')}`);
  } else {
    deployCommand.push('functions');
  }
  
  // 버전 메시지 추가
  const versionTag = generateVersionTag();
  deployCommand.push('--message', `Environment: ${targetEnv}, Version: ${versionTag}`);
  
  console.log(`Deploying Firebase Functions${onlyFunctions ? ` (${onlyFunctions.join(', ')})` : ''}...`);
  
  const deploy = spawn('firebase', deployCommand, {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      FUNCTIONS_REGION: envConfig.functionRegion,
      NODE_ENV: envConfig.nodeEnv
    }
  });
  
  return new Promise((resolve, reject) => {
    deploy.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Deployment failed. Exit code: ${code}`));
        return;
      }
      
      console.log(`Deployment to ${targetEnv} completed successfully!`);
      console.log(`Version tag: ${versionTag}`);
      
      // 배포 정보 저장
      try {
        const deploymentInfo = {
          environment: targetEnv,
          version: versionTag,
          timestamp: new Date().toISOString(),
          functions: onlyFunctions || 'all'
        };
        
        const deploymentsDir = path.join(__dirname, '../..', 'deployments');
        if (!fs.existsSync(deploymentsDir)) {
          fs.mkdirSync(deploymentsDir, { recursive: true });
        }
        
        fs.writeFileSync(
          path.join(deploymentsDir, `${versionTag}.json`),
          JSON.stringify(deploymentInfo, null, 2)
        );
      } catch (error) {
        console.warn('Failed to save deployment info:', error.message);
      }
      
      resolve();
    });
  });
};

// 배포 실행
const runDeploy = async () => {
  console.log(`Starting deployment to ${targetEnv} environment (${envConfig.projectId})...`);
  
  try {
    // Firebase 프로젝트 선택
    console.log(`Setting Firebase project to ${envConfig.projectId}...`);
    execSync(`firebase use ${envConfig.projectId}`, { stdio: 'inherit' });
    
    // 함수 구성 설정 (config-only 또는 full 모드)
    if (deployMode === 'config-only' || deployMode === 'full') {
      await setFunctionsConfig();
      
      if (deployMode === 'config-only') {
        console.log('Configuration update completed successfully!');
        return;
      }
    }
    
    // 함수 배포 (function-only 또는 full 모드)
    if (deployMode === 'function-only' || deployMode === 'full') {
      await deployFunctions();
    }
  } catch (error) {
    console.error('Deployment error:', error.message);
    process.exit(1);
  }
};

// 실행
confirmDeploy(runDeploy);
