#!/usr/bin/env node

/**
 * 배포 관리 스크립트
 * 배포 기록 조회, 롤백 및 관리 기능 제공
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// 배포 기록 디렉토리
const DEPLOYMENTS_DIR = path.join(__dirname, '..', 'deployments');

// 명령줄 인수 파싱
const args = process.argv.slice(2);
const command = args[0];
const subCommand = args[1];

// 배포 기록 조회
const listDeployments = () => {
  try {
    if (!fs.existsSync(DEPLOYMENTS_DIR)) {
      console.log('No deployment history found.');
      return [];
    }
    
    const deployments = fs.readdirSync(DEPLOYMENTS_DIR)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        try {
          const filePath = path.join(DEPLOYMENTS_DIR, file);
          const content = fs.readFileSync(filePath, 'utf8');
          return JSON.parse(content);
        } catch (err) {
          console.warn(`Error parsing deployment file ${file}:`, err.message);
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (deployments.length === 0) {
      console.log('No valid deployment records found.');
      return [];
    }
    
    console.log('\nDeployment History:');
    console.log('-'.repeat(100));
    console.log('| Version Tag'.padEnd(40) + '| Environment'.padEnd(15) + '| Timestamp'.padEnd(25) + '| Functions'.padEnd(20) + '|');
    console.log('-'.repeat(100));
    
    deployments.forEach(deployment => {
      const functions = typeof deployment.functions === 'string' 
        ? deployment.functions 
        : (Array.isArray(deployment.functions) ? deployment.functions.join(', ') : 'unknown');
      
      console.log(
        '| ' + deployment.version.padEnd(38) + 
        '| ' + deployment.environment.padEnd(13) + 
        '| ' + deployment.timestamp.padEnd(23) + 
        '| ' + functions.slice(0, 18).padEnd(18) + 
        '|'
      );
    });
    console.log('-'.repeat(100));
    
    return deployments;
  } catch (err) {
    console.error('Error listing deployments:', err.message);
    return [];
  }
};

// 롤백 실행
const rollback = (versionTag) => {
  if (!versionTag) {
    const deployments = listDeployments();
    if (deployments.length > 1) {
      versionTag = deployments[1].version; // 두 번째 최신 배포 (현재 제외)
    } else {
      console.error('No previous deployment found to rollback to.');
      return;
    }
  }
  
  const deploymentFile = path.join(DEPLOYMENTS_DIR, `${versionTag}.json`);
  
  if (!fs.existsSync(deploymentFile)) {
    console.error(`Deployment version "${versionTag}" not found.`);
    return;
  }
  
  try {
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    const { environment, functions } = deployment;
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question(`Are you sure you want to rollback to version ${versionTag} (${environment})? (y/N): `, (answer) => {
      if (answer.toLowerCase() !== 'y') {
        console.log('Rollback cancelled.');
        rl.close();
        return;
      }
      
      rl.close();
      
      console.log(`Rolling back to version ${versionTag}...`);
      
      // 함수 특정 버전 롤백
      const rollbackCommand = [
        'deploy:' + (environment === 'production' ? 'prod' : environment),
        ...(typeof functions === 'string' && functions !== 'all' ? [functions] : []),
        'function-only'
      ].filter(Boolean).join(':');
      
      console.log(`Executing: npm run ${rollbackCommand}`);
      
      try {
        execSync(`npm run ${rollbackCommand}`, { 
          stdio: 'inherit',
          cwd: path.join(__dirname, '..')
        });
        
        console.log(`Rollback to version ${versionTag} completed successfully!`);
      } catch (err) {
        console.error('Rollback failed:', err.message);
      }
    });
  } catch (err) {
    console.error(`Error reading deployment file ${versionTag}:`, err.message);
  }
};

// 명령 실행
const run = () => {
  switch (command) {
    case 'list':
      listDeployments();
      break;
    
    case 'rollback':
      rollback(subCommand);
      break;
    
    case 'clean':
      // 배포 기록 정리 (나중에 구현)
      console.log('Deployment history cleaning - Not implemented yet.');
      break;
    
    default:
      console.log(`
Deployment Management Script

Usage:
  node deployment-manager.js <command> [options]

Commands:
  list                    List all deployments
  rollback [version-tag]  Rollback to a specific version or the previous deployment
  clean                   Clean up old deployment records (not implemented yet)

Examples:
  node deployment-manager.js list
  node deployment-manager.js rollback
  node deployment-manager.js rollback staging-20250519-123045-a1b2c3d
      `);
  }
};

run();
