/**
 * Firebase Secret Manager 설정 스크립트
 * Firebase Functions 설정에 데이터베이스 연결 정보 저장
 */

require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const readline = require('readline');

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
 * Firebase Functions 설정 명령 실행
 * @param {string} key 설정 키
 * @param {string} value 설정 값
 */
const setFirebaseConfig = (key, value) => {
  try {
    console.log(`Setting Firebase config: ${key}`);
    execSync(`firebase functions:config:set ${key}=${value}`);
    console.log(`Successfully set ${key}`);
    return true;
  } catch (error) {
    console.error(`Failed to set ${key}:`, error.message);
    return false;
  }
};

/**
 * 현재 Firebase Functions 설정 가져오기
 * @return {Object} 현재 설정 객체
 */
const getFirebaseConfig = () => {
  try {
    const output = execSync('firebase functions:config:get');
    return JSON.parse(output.toString());
  } catch (error) {
    console.error('Failed to get Firebase config:', error.message);
    return {};
  }
};

/**
 * 데이터베이스 설정 구성
 * 환경 변수 또는 사용자 입력으로부터 설정 로드
 */
const configureDatabaseSecrets = async () => {
  console.log('┌─────────────────────────────────────────────────┐');
  console.log('│ Firebase Functions Database Configuration Setup  │');
  console.log('└─────────────────────────────────────────────────┘');
  
  // .env 파일에서 기본값 로드
  let dbHost = process.env.DB_HOST || '';
  let dbUser = process.env.DB_USER || '';
  let dbPassword = process.env.DB_PASSWORD || '';
  let dbName = process.env.DB_NAME || '';
  
  // 현재 설정 가져오기
  const currentConfig = getFirebaseConfig();
  
  console.log('\nCurrent configuration:');
  console.log(JSON.stringify(currentConfig?.db || {}, null, 2));
  
  console.log('\nEnter new database configuration (press Enter to keep current value):');
  
  // 사용자 입력 처리
  if (!dbHost) {
    dbHost = await prompt(`Database host [${currentConfig?.db?.host || ''}]: `);
    if (!dbHost && currentConfig?.db?.host) dbHost = currentConfig.db.host;
  }
  
  if (!dbUser) {
    dbUser = await prompt(`Database user [${currentConfig?.db?.user || ''}]: `);
    if (!dbUser && currentConfig?.db?.user) dbUser = currentConfig.db.user;
  }
  
  if (!dbPassword) {
    dbPassword = await prompt(`Database password [hidden]: `);
    if (!dbPassword && currentConfig?.db?.password) dbPassword = currentConfig.db.password;
  }
  
  if (!dbName) {
    dbName = await prompt(`Database name [${currentConfig?.db?.name || ''}]: `);
    if (!dbName && currentConfig?.db?.name) dbName = currentConfig.db.name;
  }
  
  // 입력값 확인
  if (!dbHost || !dbUser || !dbPassword || !dbName) {
    console.error('Error: All database connection parameters are required');
    rl.close();
    return false;
  }
  
  // 확인 요청
  const confirm = await prompt('\nSave this configuration to Firebase? (y/N): ');
  
  if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
    console.log('Configuration canceled.');
    rl.close();
    return false;
  }
  
  // Firebase 설정 저장
  console.log('\nSaving configuration to Firebase...');
  
  const results = [
    setFirebaseConfig('db.host', dbHost),
    setFirebaseConfig('db.user', dbUser),
    setFirebaseConfig('db.password', dbPassword),
    setFirebaseConfig('db.name', dbName)
  ];
  
  const success = results.every(r => r);
  
  if (success) {
    console.log('\nConfiguration successfully saved to Firebase Secret Manager');
  } else {
    console.error('\nFailed to save some configuration values');
  }
  
  rl.close();
  return success;
};

// 스크립트가 직접 실행될 때 설정 실행
if (require.main === module) {
  configureDatabaseSecrets().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Configuration script failed:', error);
    process.exit(1);
  });
}

module.exports = { configureDatabaseSecrets };
