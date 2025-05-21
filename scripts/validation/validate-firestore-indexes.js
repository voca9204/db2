/**
 * Firestore 인덱스 검증 모듈
 * 
 * 이 모듈은 Firestore 인덱스 정의 파일을 검증하고, 
 * 쿼리 성능에 대한 인덱스 영향을 분석하며,
 * 누락되거나 불필요한 인덱스를 감지합니다.
 */

const fs = require('fs');
const path = require('path');
const colors = require('colors/safe');
const admin = require('firebase-admin');
const { execSync } = require('child_process');

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
 * Firestore 인덱스 정의 파일 찾기
 * @returns {string|null} 인덱스 정의 파일 경로 또는 null
 */
function findIndexesFile() {
  const possiblePaths = [
    path.join(PROJECT_ROOT, 'firestore.indexes.json'),
    path.join(PROJECT_ROOT, 'firebase/firestore.indexes.json')
  ];
  
  for (const indexPath of possiblePaths) {
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
  }
  
  return null;
}
/**
 * Firebase Admin SDK 초기화
 */
function initializeFirebase() {
  if (admin.apps.length === 0) {
    try {
      // 서비스 계정 키 경로
      const serviceAccount = path.join(PROJECT_ROOT, 'firebase/service-account.json');
      
      if (fs.existsSync(serviceAccount)) {
        admin.initializeApp({
          credential: admin.credential.cert(require(serviceAccount))
        });
        log.info('Firebase Admin SDK가 서비스 계정으로 초기화되었습니다.');
      } else {
        // 애플리케이션 기본 자격 증명 사용
        admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || 'db888'
        });
        log.info('Firebase Admin SDK가 애플리케이션 기본 자격 증명으로 초기화되었습니다.');
      }
    } catch (error) {
      log.error(`Firebase 초기화 오류: ${error.message}`);
      throw error;
    }
  }
  
  return admin.firestore();
}

/**
 * 인덱스 정의 파일 검증
 * @param {string} indexesFile 인덱스 정의 파일 경로
 * @returns {Object} 검증 결과
 */
function validateIndexesFile(indexesFile) {
  log.info(`인덱스 정의 파일 검증 중: ${indexesFile}`);
  
  try {
    const indexesContent = fs.readFileSync(indexesFile, 'utf8');
    let indexes;
    
    try {
      indexes = JSON.parse(indexesContent);
    } catch (error) {
      return {
        valid: false,
        errors: [`인덱스 정의 파일 JSON 파싱 오류: ${error.message}`]
      };
    }    
    const issues = [];
    const warnings = [];
    
    // 인덱스 정의 검사
    if (!indexes.indexes) {
      issues.push('인덱스 정의 파일에 "indexes" 배열이 없습니다.');
    } else if (!Array.isArray(indexes.indexes)) {
      issues.push('"indexes" 필드가 배열이 아닙니다.');
    } else {
      // 각 인덱스 정의 검사
      indexes.indexes.forEach((index, i) => {
        // 컬렉션 ID 검사
        if (!index.collectionGroup) {
          issues.push(`인덱스 #${i + 1}: "collectionGroup" 필드가 없습니다.`);
        }
        
        // 쿼리 범위 검사
        if (!index.queryScope) {
          issues.push(`인덱스 #${i + 1}: "queryScope" 필드가 없습니다.`);
        } else if (index.queryScope !== 'COLLECTION' && index.queryScope !== 'COLLECTION_GROUP') {
          issues.push(`인덱스 #${i + 1}: 유효하지 않은 "queryScope" 값: ${index.queryScope}`);
        }
        
        // 필드 검사
        if (!index.fields || !Array.isArray(index.fields) || index.fields.length === 0) {
          issues.push(`인덱스 #${i + 1}: "fields" 배열이 없거나 비어 있습니다.`);
        } else {
          // 각 필드 검사
          index.fields.forEach((field, j) => {
            if (!field.fieldPath) {
              issues.push(`인덱스 #${i + 1}, 필드 #${j + 1}: "fieldPath" 필드가 없습니다.`);
            }
            
            if (!field.order && !field.arrayConfig) {
              issues.push(`인덱스 #${i + 1}, 필드 #${j + 1}: "order" 또는 "arrayConfig" 필드가 없습니다.`);
            }
            
            if (field.order && field.order !== 'ASCENDING' && field.order !== 'DESCENDING') {
              issues.push(`인덱스 #${i + 1}, 필드 #${j + 1}: 유효하지 않은 "order" 값: ${field.order}`);
            }
            
            if (field.arrayConfig && field.arrayConfig !== 'CONTAINS') {
              issues.push(`인덱스 #${i + 1}, 필드 #${j + 1}: 유효하지 않은 "arrayConfig" 값: ${field.arrayConfig}`);
            }
          });
        }
      });      
      // 중복 인덱스 검사
      const indexSignatures = new Map();
      
      indexes.indexes.forEach((index, i) => {
        if (!index.collectionGroup || !index.fields) return;
        
        const signature = generateIndexSignature(index);
        
        if (indexSignatures.has(signature)) {
          const duplicate = indexSignatures.get(signature);
          warnings.push(`인덱스 #${i + 1}와 #${duplicate + 1}가 중복됩니다. 컬렉션: ${index.collectionGroup}`);
        } else {
          indexSignatures.set(signature, i);
        }
      });
    }
    
    return {
      valid: issues.length === 0,
      issues,
      warnings,
      indexCount: indexes.indexes ? indexes.indexes.length : 0,
      collections: indexes.indexes ? [...new Set(indexes.indexes.map(i => i.collectionGroup))] : []
    };
  } catch (error) {
    log.error(`인덱스 정의 파일 검증 중 오류 발생: ${error.message}`);
    
    return {
      valid: false,
      errors: [error.message]
    };
  }
}

/**
 * 인덱스 서명 생성 (중복 검사용)
 * @param {Object} index 인덱스 정의
 * @returns {string} 인덱스 서명
 */
function generateIndexSignature(index) {
  const fields = index.fields.map(field => {
    if (field.order) {
      return `${field.fieldPath}:${field.order}`;
    } else if (field.arrayConfig) {
      return `${field.fieldPath}:${field.arrayConfig}`;
    }
    return field.fieldPath;
  }).join(',');
  
  return `${index.collectionGroup}|${index.queryScope}|${fields}`;
}