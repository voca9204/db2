/**
 * Firestore 스키마 검증 스크립트
 * 
 * 이 스크립트는 Firebase Firestore 데이터 스키마를 검증합니다.
 * JSON Schema를 사용하여 컬렉션 스키마를 정의하고, 
 * 실제 데이터와 비교하여 검증합니다.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const colors = require('colors/safe');

// 환경 변수 로드
require('dotenv').config();

// 스키마 디렉토리 경로
const SCHEMA_DIR = path.join(__dirname, 'schemas');
const REPORT_DIR = path.join(__dirname, 'reports');
const PROJECT_ROOT = path.join(__dirname, '../..');

// JSON Schema 검증기 초기화
const ajv = new Ajv({ 
  allErrors: true, 
  strict: false,
  strictSchema: false,
  strictTypes: false 
});

// 로그 함수
const log = {
  info: (msg) => console.log(colors.cyan(`[INFO] ${msg}`)),
  warn: (msg) => console.log(colors.yellow(`[WARN] ${msg}`)),
  error: (msg) => console.log(colors.red(`[ERROR] ${msg}`)),
  success: (msg) => console.log(colors.green(`[SUCCESS] ${msg}`))
};

/**
 * Firebase Admin SDK 초기화
 */
function initializeFirebase() {
  if (admin.apps.length === 0) {
    // 기본 앱으로 초기화
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
 * 컬렉션 스키마 로드
 * @returns {Object} 컬렉션 이름과 스키마 매핑
 */
function loadSchemas() {
  log.info('스키마 로드 중...');
  
  // 스키마 디렉토리 확인 및 생성
  if (!fs.existsSync(SCHEMA_DIR)) {
    fs.mkdirSync(SCHEMA_DIR, { recursive: true });
    log.warn('스키마 디렉토리가 생성되었습니다. 스키마 파일을 추가해주세요.');
    return {};
  }
  
  const schemas = {};
  const schemaFiles = fs.readdirSync(SCHEMA_DIR)
    .filter(file => file.endsWith('.json'));
  
  if (schemaFiles.length === 0) {
    log.warn('스키마 파일이 없습니다. 먼저 스키마 파일을 생성해주세요.');
    return {};
  }
  
  for (const file of schemaFiles) {
    try {
      const schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, file), 'utf8'));
      const collectionName = path.basename(file, '.json');
      schemas[collectionName] = schema;
      log.info(`${collectionName} 스키마를 로드했습니다.`);
    } catch (error) {
      log.error(`스키마 파일 ${file} 로드 오류: ${error.message}`);
    }
  }
  
  return schemas;
}

/**
 * Firestore 데이터 가져오기
 * @param {FirebaseFirestore.Firestore} db Firestore 인스턴스
 * @param {string} collectionName 컬렉션 이름
 * @returns {Promise<Array>} 문서 데이터 배열
 */
async function fetchCollectionData(db, collectionName) {
  try {
    log.info(`${collectionName} 컬렉션 데이터 가져오기...`);
    const snapshot = await db.collection(collectionName).get();
    
    if (snapshot.empty) {
      log.warn(`${collectionName} 컬렉션에 문서가 없습니다.`);
      return [];
    }
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data
      };
    });
  } catch (error) {
    log.error(`${collectionName} 컬렉션 데이터 가져오기 오류: ${error.message}`);
    return [];
  }
}

/**
 * 문서 데이터 유효성 검사
 * @param {Object} schema JSON Schema
 * @param {Array} documents 문서 데이터 배열
 * @returns {Object} 유효성 검사 결과
 */
function validateDocuments(schema, documents) {
  const validate = ajv.compile(schema);
  const results = {
    valid: [],
    invalid: []
  };
  
  for (const doc of documents) {
    const isValid = validate(doc);
    
    if (isValid) {
      results.valid.push(doc.id);
    } else {
      results.invalid.push({
        id: doc.id,
        errors: validate.errors
      });
    }
  }
  
  return results;
}

/**
 * 유효성 검사 결과 보고서 생성
 * @param {Object} results 컬렉션별 유효성 검사 결과
 */
function generateReport(results) {
  // 보고서 디렉토리 확인 및 생성
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const reportPath = path.join(REPORT_DIR, `schema-validation-${timestamp}.json`);
  
  // 요약 정보 계산
  const summary = {
    timestamp,
    collections: Object.keys(results).length,
    totalDocuments: 0,
    validDocuments: 0,
    invalidDocuments: 0,
    issues: {}
  };
  
  for (const [collection, result] of Object.entries(results)) {
    const validCount = result.valid.length;
    const invalidCount = result.invalid.length;
    const totalCount = validCount + invalidCount;
    
    summary.totalDocuments += totalCount;
    summary.validDocuments += validCount;
    summary.invalidDocuments += invalidCount;
    
    if (invalidCount > 0) {
      summary.issues[collection] = invalidCount;
    }
  }
  
  // 전체 보고서
  const report = {
    summary,
    results
  };
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log.success(`유효성 검사 보고서가 생성되었습니다: ${reportPath}`);
  
  return reportPath;
}

/**
 * 유효성 검사 결과 출력
 * @param {Object} results 컬렉션별 유효성 검사 결과
 */
function printResults(results) {
  console.log('\n=== Firestore 스키마 유효성 검사 결과 ===\n');
  
  let totalValid = 0;
  let totalInvalid = 0;
  
  for (const [collection, result] of Object.entries(results)) {
    const validCount = result.valid.length;
    const invalidCount = result.invalid.length;
    const totalCount = validCount + invalidCount;
    
    totalValid += validCount;
    totalInvalid += invalidCount;
    
    console.log(`${collection} 컬렉션: ${totalCount}개 문서 중 ${validCount}개 유효, ${invalidCount}개 유효하지 않음`);
    
    if (invalidCount > 0) {
      console.log(colors.yellow(`  - 유효하지 않은 문서:`));
      
      result.invalid.slice(0, 5).forEach(({ id, errors }) => {
        console.log(colors.yellow(`    - 문서 ID: ${id}`));
        errors.slice(0, 3).forEach(error => {
          console.log(colors.yellow(`      - ${error.instancePath}: ${error.message}`));
        });
        
        if (errors.length > 3) {
          console.log(colors.yellow(`      - ... 외 ${errors.length - 3}개 오류`));
        }
      });
      
      if (result.invalid.length > 5) {
        console.log(colors.yellow(`  - ... 외 ${result.invalid.length - 5}개 문서에 오류 있음`));
      }
    }
  }
  
  console.log('\n=== 요약 ===');
  console.log(`총 ${Object.keys(results).length}개 컬렉션, ${totalValid + totalInvalid}개 문서 검사`);
  console.log(`유효한 문서: ${totalValid}개`);
  console.log(`유효하지 않은 문서: ${totalInvalid}개`);
  
  if (totalInvalid === 0) {
    console.log(colors.green('\n모든 문서가 스키마 검증을 통과했습니다! 👍'));
  } else {
    console.log(colors.yellow(`\n${totalInvalid}개 문서에서 스키마 오류가 발견되었습니다. ���세한 내용은 보고서를 확인하세요.`));
  }
}

/**
 * 기본 스키마 템플릿 생성
 * @param {string} collectionName 컬렉션 이름
 * @param {Array} documents 샘플 문서 배열
 * @returns {Object} JSON Schema 템플릿
 */
function generateSchemaTemplate(collectionName, documents) {
  if (!documents || documents.length === 0) {
    return {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        id: { type: "string" }
      },
      required: ["id"]
    };
  }
  
  // 첫 번째 문서를 기반으로 스키마 생성
  const sampleDoc = documents[0];
  const properties = {
    id: { type: "string" }
  };
  const required = ["id"];
  
  for (const [key, value] of Object.entries(sampleDoc)) {
    if (key === 'id') continue;
    
    let propType;
    let propFormat;
    
    if (value === null) {
      propType = ["null", "string", "number", "boolean", "object", "array"];
    } else if (typeof value === 'string') {
      if (value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(.\d{3})?Z$/)) {
        propType = "string";
        propFormat = "date-time";
      } else {
        propType = "string";
      }
    } else if (typeof value === 'number') {
      propType = "number";
    } else if (typeof value === 'boolean') {
      propType = "boolean";
    } else if (Array.isArray(value)) {
      propType = "array";
      properties[key] = {
        type: "array",
        items: value.length > 0 ? 
          { type: typeof value[0] } : 
          { type: ["string", "number", "boolean", "object"] }
      };
      continue;
    } else if (typeof value === 'object') {
      propType = "object";
      properties[key] = {
        type: "object",
        properties: {},
        additionalProperties: true
      };
      continue;
    } else {
      propType = ["string", "number", "boolean", "object", "array", "null"];
    }
    
    properties[key] = propFormat ? 
      { type: propType, format: propFormat } : 
      { type: propType };
    
    // 다른 문서에서 이 필드가 없는 경우도 있을 수 있으므로
    // 모든 필드를 required로 설정하지 않음
    if (documents.every(doc => doc[key] !== undefined)) {
      required.push(key);
    }
  }
  
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties,
    required,
    additionalProperties: true
  };
}

/**
 * 누락된 스키마 파일 생성
 * @param {Object} collections 컬렉션 이름과 문서 매핑
 */
function generateMissingSchemas(collections) {
  for (const [collectionName, documents] of Object.entries(collections)) {
    const schemaPath = path.join(SCHEMA_DIR, `${collectionName}.json`);
    
    if (!fs.existsSync(schemaPath)) {
      log.info(`${collectionName} 컬렉션의 스키마 템플릿 생성 중...`);
      
      const schemaTemplate = generateSchemaTemplate(collectionName, documents);
      fs.writeFileSync(schemaPath, JSON.stringify(schemaTemplate, null, 2));
      
      log.success(`${collectionName} 스키마 템플릿이 생성되었습니다: ${schemaPath}`);
    }
  }
}

/**
 * 메인 함수
 */
async function main() {
  // 명령행 인수 처리
  const args = process.argv.slice(2);
  const generateTemplates = args.includes('--generate-templates');
  const collectionFilter = args.find(arg => arg.startsWith('--collection='))?.split('=')[1];
  
  try {
    log.info('Firestore 스키마 유효성 검사 시작...');
    
    // Firebase 초기화
    const db = initializeFirebase();
    
    // 스키마 로드
    const schemas = loadSchemas();
    
    // 컬렉션 데이터 가져오기
    const collections = {};
    
    // 특정 컬렉션만 검사하는 경우
    if (collectionFilter) {
      collections[collectionFilter] = await fetchCollectionData(db, collectionFilter);
    } 
    // 스키마가 정의된 모든 컬렉션 검사
    else if (Object.keys(schemas).length > 0) {
      for (const collectionName of Object.keys(schemas)) {
        collections[collectionName] = await fetchCollectionData(db, collectionName);
      }
    } 
    // 스키마가 없는 경우 모든 컬렉션 목록 가져오기
    else {
      log.info('정의된 스키마가 없어 사용 가능한 모든 컬렉션을 검색합니다...');
      
      try {
        const collectionsSnapshot = await db.listCollections();
        
        for (const collection of collectionsSnapshot) {
          const collectionName = collection.id;
          collections[collectionName] = await fetchCollectionData(db, collectionName);
          log.info(`컬렉션 발견: ${collectionName} (${collections[collectionName].length}개 문서)`);
        }
      } catch (error) {
        log.error(`컬렉션 목록 가져오기 오류: ${error.message}`);
      }
    }
    
    // 스키마 템플릿 생성
    if (generateTemplates) {
      generateMissingSchemas(collections);
      // 새로운 스키마 로드
      if (Object.keys(schemas).length === 0) {
        log.info('새로 생성된 스키마 로드 중...');
        Object.assign(schemas, loadSchemas());
      }
    }
    
    // 유효성 검사 수행
    const results = {};
    
    for (const [collectionName, documents] of Object.entries(collections)) {
      if (schemas[collectionName]) {
        log.info(`${collectionName} 컬렉션 유효성 검사 중... (${documents.length}개 문서)`);
        results[collectionName] = validateDocuments(schemas[collectionName], documents);
      } else {
        log.warn(`${collectionName} 컬렉션의 스키마가 정의되지 않았습니다. 스키마 파일을 생성하려면 --generate-templates 옵션을 사용하세요.`);
      }
    }
    
    // 결과 보고
    if (Object.keys(results).length > 0) {
      // 보고서 생성
      const reportPath = generateReport(results);
      
      // 결과 출력
      printResults(results);
    } else {
      log.warn('검증할 컬렉션이 없습니다.');
    }
    
  } catch (error) {
    log.error(`스키마 유효성 검사 중 오류 발생: ${error.message}`);
    log.error(error.stack);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  validateSchema: main,
  generateTemplates: async () => {
    const db = initializeFirebase();
    const collections = {};
    
    const collectionsSnapshot = await db.listCollections();
    for (const collection of collectionsSnapshot) {
      const collectionName = collection.id;
      collections[collectionName] = await fetchCollectionData(db, collectionName);
    }
    
    generateMissingSchemas(collections);
  }
};
