/**
 * Google Cloud Secret Manager 설정 스크립트
 * 데이터베이스 연결 정보를 Google Cloud Secret Manager에 저장
 */

require('dotenv').config();
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { execSync } = require('child_process');
const fs = require('fs');
const readline = require('readline');
const admin = require('firebase-admin');
const { encrypt } = require('../src/utils/encryption');

// 인증 초기화
if (!admin.apps.length) {
  admin.initializeApp();
}

// Secret Manager 클라이언트 초기화
const secretManagerClient = new SecretManagerServiceClient();

// 대화형 인터페이스 생성
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * 사용자 입력 프롬프트 함수
 * @param {string} question 질문 텍스트
 * @return {Promise<string>} 사용자 입력 값
 */
const prompt = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
};

/**
 * Google Cloud 프로젝트 ID 가져오기
 * @return {Promise<string>} Google Cloud 프로젝트 ID
 */
const getProjectId = async () => {
  try {
    // 환경 변수에서 가져오기
    const projectId = process.env.GCLOUD_PROJECT || 
                     process.env.GCP_PROJECT || 
                     (await admin.app().options.credential.getProjectId());
    
    if (projectId) {
      return projectId;
    }
    
    // gcloud 명령어로 가져오기
    const output = execSync('gcloud config get-value project');
    return output.toString().trim();
  } catch (error) {
    console.error('Error getting project ID:', error.message);
    
    // 사용자 입력 요청
    return prompt('Enter your Google Cloud project ID: ');
  }
};

/**
 * Secret Manager에 시크릿 생성
 * @param {string} secretId 시크릿 ID
 * @param {string} payload 시크릿 데이터
 * @param {string} projectId Google Cloud 프로젝트 ID
 * @return {Promise<void>}
 */
const createOrUpdateSecret = async (secretId, payload, projectId) => {
  const parent = `projects/${projectId}`;
  
  try {
    // 기존 시크릿 확인
    try {
      await secretManagerClient.getSecret({
        name: `${parent}/secrets/${secretId}`
      });
      
      console.log(`Secret ${secretId} already exists. Adding new version.`);
    } catch (error) {
      // 시크릿이 없으면 생성
      if (error.code === 5) { // NOT_FOUND
        console.log(`Creating new secret ${secretId}`);
        await secretManagerClient.createSecret({
          parent,
          secretId,
          secret: {
            replication: {
              automatic: {}
            }
          }
        });
      } else {
        throw error;
      }
    }
    
    // 시크릿 버전 추가
    const [version] = await secretManagerClient.addSecretVersion({
      parent: `${parent}/secrets/${secretId}`,
      payload: {
        data: Buffer.from(payload)
      }
    });
    
    console.log(`Added secret version ${version.name}`);
    
    return version.name;
  } catch (error) {
    console.error(`Error creating/updating secret ${secretId}:`, error.message);
    throw error;
  }
};

/**
 * 데이터베이스 자격 증명을 Secret Manager에 저장
 * @return {Promise<boolean>} 성공 여부
 */
const configureSecretManager = async () => {
  console.log('┌─────────────────────────────────────────────────┐');
  console.log('│ Google Cloud Secret Manager Configuration Setup  │');
  console.log('└─────────────────────────────────────────────────┘');
  
  try {
    // Google Cloud 프로젝트 ID 가져오기
    const projectId = await getProjectId();
    console.log(`Using Google Cloud project: ${projectId}`);
    
    // 데이터베이스 자격 증명 가져오기
    let dbHost = process.env.DB_HOST || '';
    let dbUser = process.env.DB_USER || '';
    let dbPassword = process.env.DB_PASSWORD || '';
    let dbName = process.env.DB_NAME || '';
    
    // 사용자 입력 처리
    if (!dbHost) {
      dbHost = await prompt('Database host: ');
    }
    
    if (!dbUser) {
      dbUser = await prompt('Database user: ');
    }
    
    if (!dbPassword) {
      dbPassword = await prompt('Database password: ');
    }
    
    if (!dbName) {
      dbName = await prompt('Database name: ');
    }
    
    // 입력값 확인
    if (!dbHost || !dbUser || !dbPassword || !dbName) {
      console.error('Error: All database connection parameters are required');
      rl.close();
      return false;
    }
    
    // 자격 증명 객체 생성
    const credentials = {
      host: dbHost,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      // SSL 설정
      ssl: process.env.DB_SSL === 'true' ? {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      } : undefined,
      // 추가 설정
      connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '5000', 10),
      timezone: process.env.DB_TIMEZONE || '+09:00'
    };
    
    // JSON 문자열로 변환 (암호화 없음)
    const jsonCredentials = JSON.stringify(credentials);
    
    // 확인 요청
    const confirm = await prompt('\nSave this configuration to Google Cloud Secret Manager? (y/N): ');
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('Configuration canceled.');
      rl.close();
      return false;
    }
    
    // Secret Manager에 저장
    console.log('\nSaving configuration to Google Cloud Secret Manager...');
    
    const secretName = 'db-credentials';
    await createOrUpdateSecret(secretName, jsonCredentials, projectId);
    
    // 별도의 시크릿으로도 저장 (옵션)
    const separate = await prompt('Also store as separate secrets? (y/N): ');
    
    if (separate.toLowerCase() === 'y' || separate.toLowerCase() === 'yes') {
      await Promise.all([
        createOrUpdateSecret('db-host', dbHost, projectId),
        createOrUpdateSecret('db-user', dbUser, projectId),
        createOrUpdateSecret('db-password', dbPassword, projectId),
        createOrUpdateSecret('db-name', dbName, projectId)
      ]);
    }
    
    console.log('\nDatabase credentials successfully stored in Google Cloud Secret Manager');
    rl.close();
    return true;
  } catch (error) {
    console.error('Error configuring Secret Manager:', error.message);
    rl.close();
    return false;
  }
};

// 스크립트가 직접 실행될 때 설정 실행
if (require.main === module) {
  configureSecretManager().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Configuration script failed:', error);
    process.exit(1);
  });
}

module.exports = { configureSecretManager };
