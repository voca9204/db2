/**
 * Firebase 스키마 및 인덱스 검증 스크립트
 * 
 * Firestore 스키마 및 인덱스 설정을 검증합니다.
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// 프로젝트 루트 경로
const projectRoot = path.resolve(__dirname, '../..');

// 검증할 파일 경로
const firestoreIndexesPath = path.join(projectRoot, 'firestore.indexes.json');

// 결과 보고서 경로
const reportsDir = path.join(projectRoot, 'reports/validation');

/**
 * Firestore 인덱스 검증
 * @returns {Promise<Object>} 검증 결과
 */
async function validateFirestoreIndexes() {
  try {
    if (!fs.existsSync(firestoreIndexesPath)) {
      return {
        valid: false,
        errors: ['Firestore 인덱스 파일을 찾을 수 없습니다: firestore.indexes.json']
      };
    }
    
    // 인덱스 파일 읽기
    const indexesContent = fs.readFileSync(firestoreIndexesPath, 'utf8');
    let indexes;
    
    try {
      indexes = JSON.parse(indexesContent);
    } catch (error) {
      return {
        valid: false,
        errors: [`Firestore 인덱스 파일이 유효한 JSON이 아닙니다: ${error.message}`]
      };
    }
    
    // 인덱스 구조 검증
    if (!indexes.indexes || !Array.isArray(indexes.indexes)) {
      return {
        valid: false,
        errors: ['Firestore 인덱스 파일이 올바른 구조가 아닙니다. "indexes" 배열이 필요합니다.']
      };
    }
    
    const warnings = [];
    const allCollections = new Set();
    const allFieldPaths = new Map();
    
    // 인덱스 항목 검증
    for (let i = 0; i < indexes.indexes.length; i++) {
      const index = indexes.indexes[i];
      
      // 필수 필드 확인
      if (!index.collectionGroup) {
        warnings.push(`인덱스 #${i+1}: 필수 필드 "collectionGroup"이 없습니다.`);
      }
      
      if (!index.queryScope) {
        warnings.push(`인덱스 #${i+1}: 필수 필드 "queryScope"이 없습니다.`);
      }
      
      if (!index.fields || !Array.isArray(index.fields) || index.fields.length === 0) {
        warnings.push(`인덱스 #${i+1}: 필수 필드 "fields"가 없거나 비어 있습니다.`);
        continue;
      }
      
      // 컬렉션 추적
      if (index.collectionGroup) {
        allCollections.add(index.collectionGroup);
      }
      
      // 필드 경로 추적
      for (const field of index.fields) {
        if (!field.fieldPath) {
          warnings.push(`인덱스 #${i+1}: 필드 항목에 "fieldPath"가 없습니다.`);
          continue;
        }
        
        if (!field.order && !field.arrayConfig) {
          warnings.push(`인덱스 #${i+1}: 필드 "${field.fieldPath}"에 "order" 또는 "arrayConfig"가 없습니다.`);
        }
        
        // 필드 경로 중복 확인
        const collectionKey = index.collectionGroup || 'unknown';
        const fieldKey = `${collectionKey}:${field.fieldPath}`;
        
        if (!allFieldPaths.has(fieldKey)) {
          allFieldPaths.set(fieldKey, []);
        }
        
        allFieldPaths.get(fieldKey).push({
          indexNumber: i + 1,
          order: field.order,
          arrayConfig: field.arrayConfig
        });
      }
    }
    
    // 중복 필드 경로 검사
    for (const [fieldKey, instances] of allFieldPaths) {
      if (instances.length > 1) {
        const [collection, fieldPath] = fieldKey.split(':');
        warnings.push(`필드 "${fieldPath}"(컬렉션: "${collection}")가 여러 인덱스에 중복됩니다: 인덱스 #${instances.map(i => i.indexNumber).join(', #')}`);
      }
    }
    
    // Firebase CLI를 사용하여 인덱스 검증
    try {
      const command = `firebase --project=db888 firestore:indexes > /dev/null`;
      await execPromise(command, { cwd: projectRoot });
    } catch (error) {
      warnings.push(`Firebase CLI 인덱스 검증 오류: ${error.message}`);
    }
    
    return {
      valid: warnings.length === 0,
      warnings,
      collections: Array.from(allCollections),
      fieldPaths: Object.fromEntries(allFieldPaths),
      indexCount: indexes.indexes.length
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error.message]
    };
  }
}

/**
 * Firebase 소스 코드에서 사용되는 컬렉션과 인덱스 추출
 * @returns {Promise<Object>} 추출 결과
 */
async function extractCollectionsFromCode() {
  try {
    // 소스 코드 검색
    const functionsDir = path.join(projectRoot, 'functions');
    if (!fs.existsSync(functionsDir)) {
      return {
        valid: false,
        errors: ['Functions 디렉토리를 찾을 수 없습니다.']
      };
    }
    
    // 소스 파일 검색
    const { stdout } = await execPromise(
      `find ${functionsDir} -type f -name "*.js" -exec grep -l "collection\\|where\\|orderBy" {} \\;`
    );
    
    const sourceFiles = stdout.trim().split('\n').filter(file => file);
    
    const collections = new Set();
    const queryPatterns = new Map();
    
    // 소스 파일에서 컬렉션 및 쿼리 패턴 추출
    for (const file of sourceFiles) {
      if (!fs.existsSync(file)) continue;
      
      const content = fs.readFileSync(file, 'utf8');
      const fileRelativePath = path.relative(projectRoot, file);
      
      // 컬렉션 참조 추출
      const collectionRegex = /collection\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      let match;
      
      while ((match = collectionRegex.exec(content)) !== null) {
        collections.add(match[1]);
      }
      
      // 쿼리 패턴 추출 (where + orderBy 결합)
      const lines = content.split('\n');
      let inQueryChain = false;
      let currentQuery = {
        conditions: [],
        orderBy: [],
        line: 0,
        file: fileRelativePath
      };
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 쿼리 체인 시작 감지
        if (line.includes('collection(') || line.includes('.collection(')) {
          inQueryChain = true;
          currentQuery = {
            conditions: [],
            orderBy: [],
            line: i + 1,
            file: fileRelativePath
          };
          
          // 컬렉션 이름 추출
          const collectionMatch = line.match(/collection\s*\(\s*['"]([^'"]+)['"]\s*\)/);
          if (collectionMatch) {
            currentQuery.collection = collectionMatch[1];
          }
        }
        
        // where 조건 추출
        if (inQueryChain && line.includes('.where(')) {
          const whereMatch = line.match(/\.where\s*\(\s*['"]([^'"]+)['"]\s*,/);
          if (whereMatch) {
            currentQuery.conditions.push(whereMatch[1]);
          }
        }
        
        // orderBy 추출
        if (inQueryChain && line.includes('.orderBy(')) {
          const orderByMatch = line.match(/\.orderBy\s*\(\s*['"]([^'"]+)['"]\s*,?\s*['"]?([^'"]*)/);
          if (orderByMatch) {
            const field = orderByMatch[1];
            const direction = orderByMatch[2].trim() || 'asc';
            currentQuery.orderBy.push({ field, direction });
          }
        }
        
        // 쿼리 체인 종료 감지 (.get(), .onSnapshot() 등)
        if (inQueryChain && (
          line.includes('.get(') || 
          line.includes('.onSnapshot(') || 
          line.includes(';') || 
          line.includes('}'))) {
          
          inQueryChain = false;
          
          // 의미 있는 쿼리만 저장 (조건 또는 정렬이 있는 경우)
          if (currentQuery.conditions.length > 0 || currentQuery.orderBy.length > 0) {
            const key = `${currentQuery.collection || 'unknown'}-${currentQuery.conditions.join('&')}-${currentQuery.orderBy.map(o => `${o.field}:${o.direction}`).join('&')}`;
            
            if (!queryPatterns.has(key)) {
              queryPatterns.set(key, []);
            }
            
            queryPatterns.get(key).push({
              file: currentQuery.file,
              line: currentQuery.line,
              collection: currentQuery.collection,
              conditions: [...currentQuery.conditions],
              orderBy: [...currentQuery.orderBy]
            });
          }
        }
      }
    }
    
    return {
      valid: true,
      collections: Array.from(collections),
      queryPatterns: Object.fromEntries(queryPatterns)
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error.message]
    };
  }
}

/**
 * 인덱스와 코드 간의 일관성 검증
 * @param {Object} indexesResult 인덱스 검증 결과
 * @param {Object} codeResult 코드 분석 결과
 * @returns {Object} 검증 결과
 */
function validateConsistency(indexesResult, codeResult) {
  if (!indexesResult.valid || !codeResult.valid) {
    return {
      valid: false,
      errors: [
        ...(indexesResult.errors || []),
        ...(codeResult.errors || [])
      ]
    };
  }
  
  const warnings = [];
  
  // 코드에서 사용하는 컬렉션이 인덱스에 없는 경우 확인
  for (const collection of codeResult.collections) {
    if (!indexesResult.collections.includes(collection)) {
      warnings.push(`코드에서 사용하는 컬렉션 "${collection}"에 대한 인덱스가 정의되어 있지 않습니다.`);
    }
  }
  
  // 효율적인 쿼리를 위한 인덱스 권장 사항
  const recommendations = [];
  
  // 쿼리 패턴 분석
  for (const patternInfo of Object.values(codeResult.queryPatterns)) {
    for (const query of patternInfo) {
      if (query.conditions.length > 0 && query.orderBy.length > 0) {
        // where + orderBy 조합이 있는지 확인
        const hasMatchingIndex = indexesResult.collections.some(collection => 
          collection === query.collection
        );
        
        if (!hasMatchingIndex) {
          const fields = [
            ...query.conditions.map(field => `${field}: ASCENDING/DESCENDING`),
            ...query.orderBy.map(({field, direction}) => `${field}: ${direction.toUpperCase()}`)
          ].join(', ');
          
          recommendations.push(`${query.file}:${query.line} - 컬렉션 "${query.collection}"에 대해 다음 필드를 포함하는 복합 인덱스를 추가하는 것이 좋습니다: ${fields}`);
        }
      }
    }
  }
  
  return {
    valid: warnings.length === 0,
    warnings,
    recommendations,
    collectionsInCode: codeResult.collections,
    collectionsInIndexes: indexesResult.collections
  };
}

/**
 * Firebase 스키마 및 인덱스 검증
 * @returns {Promise<Object>} 검증 결과
 */
async function validateSchema() {
  console.log('Firebase 스키마 및 인덱스 검증 시작...');
  
  // 결과 저장 디렉토리 생성
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  // Firestore 인덱스 검증
  console.log('Firestore 인덱스 검증 중...');
  const indexesResult = await validateFirestoreIndexes();
  
  // 소스 코드에서 컬렉션 및 쿼리 패턴 추출
  console.log('소스 코드에서 컬렉션 및 쿼리 패턴 분석 중...');
  const codeResult = await extractCollectionsFromCode();
  
  // 일관성 검증
  console.log('인덱스와 코드 간의 일관성 검증 중...');
  const consistencyResult = validateConsistency(indexesResult, codeResult);
  
  // 검증 결과 집계
  const results = {
    timestamp: new Date().toISOString(),
    indexes: indexesResult,
    code: codeResult,
    consistency: consistencyResult,
    valid: indexesResult.valid && codeResult.valid && consistencyResult.valid
  };
  
  // 결과 출력
  console.log('\nFirebase 스키마 및 인덱스 검증 결과:');
  console.log(`- Firestore 인덱스 유효성: ${indexesResult.valid ? '✓' : '✗'}`);
  
  if (indexesResult.warnings && indexesResult.warnings.length > 0) {
    console.log('\nFirestore 인덱스 경고:');
    indexesResult.warnings.forEach((warning, index) => {
      console.log(`  ${index + 1}. ${warning}`);
    });
  }
  
  console.log(`- 소스 코드 컬렉션 분석: ${codeResult.valid ? '✓' : '✗'}`);
  
  if (codeResult.collections && codeResult.collections.length > 0) {
    console.log(`\n소스 코드에서 발견된 컬렉션: ${codeResult.collections.length}개`);
    codeResult.collections.forEach((collection, index) => {
      console.log(`  ${index + 1}. ${collection}`);
    });
  }
  
  console.log(`- 일관성 검증: ${consistencyResult.valid ? '✓' : '✗'}`);
  
  if (consistencyResult.warnings && consistencyResult.warnings.length > 0) {
    console.log('\n일관성 경고:');
    consistencyResult.warnings.forEach((warning, index) => {
      console.log(`  ${index + 1}. ${warning}`);
    });
  }
  
  if (consistencyResult.recommendations && consistencyResult.recommendations.length > 0) {
    console.log('\n인덱스 권장 사항:');
    consistencyResult.recommendations.forEach((recommendation, index) => {
      console.log(`  ${index + 1}. ${recommendation}`);
    });
  }
  
  // 결과 저장
  const reportPath = path.join(reportsDir, `schema-validation-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n검증 보고서가 저장되었습니다: ${reportPath}`);
  
  return results;
}

// 스크립트가 직접 실행된 경우에만 실행
if (require.main === module) {
  validateSchema()
    .then(results => {
      // 결과에 따라 종료 코드 설정
      process.exit(results.valid ? 0 : 1);
    })
    .catch(error => {
      console.error('스키마 검증 중 오류 발생:', error);
      process.exit(1);
    });
}

module.exports = {
  validateSchema,
  validateFirestoreIndexes,
  extractCollectionsFromCode,
  validateConsistency
};
