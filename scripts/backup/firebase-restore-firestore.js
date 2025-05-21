/**
 * Firebase Firestore 데이터 복원 스크립트
 * 
 * 이 스크립트는 백업된 Firestore 데이터를 Firebase 프로젝트로 복원합니다.
 * Firebase Admin SDK를 사용하여 직접 복원하는 방식입니다.
 * 
 * 주의: 이 스크립트는 프로덕션 데이터베이스에 영향을 미칠 수 있습니다.
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// 프로젝트 루트 경로
const projectRoot = path.resolve(__dirname, '../..');

// 백업 디렉토리 경로
const backupDir = process.argv[2];

if (!backupDir) {
  console.error('백업 디렉토리 경로를 지정하세요.');
  process.exit(1);
}

if (!fs.existsSync(backupDir)) {
  console.error(`백업 디렉토리가 존재하지 않습니다: ${backupDir}`);
  process.exit(1);
}

// Firebase Admin SDK 초기화
function initializeFirebase() {
  // 서비스 계정 키 파일 경로
  const serviceAccountPath = path.join(projectRoot, 'firebase/service-account.json');
  
  if (!fs.existsSync(serviceAccountPath)) {
    console.error('서비스 계정 키 파일이 존재하지 않습니다.');
    console.error(`예상 경로: ${serviceAccountPath}`);
    process.exit(1);
  }
  
  try {
    // Admin SDK 초기화
    const serviceAccount = require(serviceAccountPath);
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    
    return admin.firestore();
  } catch (error) {
    console.error('Firebase 초기화 중 오류 발생:', error);
    process.exit(1);
  }
}

// 백업 데이터 로드
function loadBackupData(backupDir) {
  console.log(`백업 데이터 로드 중: ${backupDir}`);
  
  try {
    // firestore_export 디렉토리 확인
    let firestoreExportDir = path.join(backupDir, 'firestore_export');
    if (!fs.existsSync(firestoreExportDir)) {
      firestoreExportDir = backupDir;
    }
    
    // 모든 컬렉션 파일 찾기
    const backupData = {};
    
    // 에뮬레이터 백업 포맷 확인 (all_namespaces 디렉토리)
    const allNamespacesDir = path.join(firestoreExportDir, 'all_namespaces');
    if (fs.existsSync(allNamespacesDir)) {
      console.log('에뮬레이터 백업 형식 감지: all_namespaces 디렉토리 사용');
      
      const collectionsDir = path.join(allNamespacesDir, 'kind_');
      if (fs.existsSync(collectionsDir)) {
        const collections = fs.readdirSync(collectionsDir)
          .filter(file => file.endsWith('.export_metadata'));
        
        for (const collection of collections) {
          const collectionName = collection.replace('.export_metadata', '');
          const documentsDir = path.join(collectionsDir, collectionName);
          const documentsMetadataFile = path.join(collectionsDir, `${collectionName}.export_metadata`);
          
          if (fs.existsSync(documentsMetadataFile) && fs.statSync(documentsMetadataFile).isFile()) {
            // 문서 메타데이터 파일 읽기
            const metadata = JSON.parse(fs.readFileSync(documentsMetadataFile, 'utf8'));
            backupData[collectionName] = { metadata, documents: [] };
            
            // 문서 찾기
            const documentFiles = fs.readdirSync(collectionsDir)
              .filter(file => file.startsWith(`${collectionName}_`) && file.endsWith('.json'));
            
            for (const docFile of documentFiles) {
              const docPath = path.join(collectionsDir, docFile);
              const docData = JSON.parse(fs.readFileSync(docPath, 'utf8'));
              backupData[collectionName].documents.push(docData);
            }
            
            console.log(`컬렉션 로드: ${collectionName} (${backupData[collectionName].documents.length}개 문서)`);
          }
        }
      }
    } 
    // 직접 백업 포맷 확인 (컬렉션별 JSON 파일)
    else {
      console.log('직접 백업 형식 감지: 컬렉션별 JSON 파일 사용');
      
      const files = fs.readdirSync(firestoreExportDir)
        .filter(file => file.endsWith('.json'));
      
      for (const file of files) {
        const collectionName = file.replace('.json', '');
        const filePath = path.join(firestoreExportDir, file);
        
        if (fs.statSync(filePath).isFile()) {
          const documents = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          backupData[collectionName] = { 
            metadata: { count: documents.length },
            documents 
          };
          
          console.log(`컬렉션 로드: ${collectionName} (${documents.length}개 문서)`);
        }
      }
    }
    
    return backupData;
  } catch (error) {
    console.error('백업 데이터 로드 중 오류 발생:', error);
    process.exit(1);
  }
}

// Firestore 데이터 복원
async function restoreFirestore(db, backupData) {
  console.log('\nFirestore 데이터 복원 시작...');
  
  try {
    // 각 컬렉션 처리
    for (const [collectionName, collectionData] of Object.entries(backupData)) {
      const { documents } = collectionData;
      
      console.log(`컬렉션 복원 중: ${collectionName} (${documents.length}개 문서)`);
      
      // 배치 단위로 처리
      const batchSize = 500;
      let processed = 0;
      
      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = db.batch();
        const chunk = documents.slice(i, i + batchSize);
        
        for (const doc of chunk) {
          let docId;
          let docData;
          
          // 직접 백업 형식
          if (doc.id && doc.data) {
            docId = doc.id;
            docData = doc.data;
          } 
          // 에뮬레이터 백업 형식
          else if (doc.name && doc.fields) {
            // name 형식: projects/proj/databases/(default)/documents/collection/docId
            const nameParts = doc.name.split('/');
            docId = nameParts[nameParts.length - 1];
            
            // fields 필드를 추출하여 docData로 변환
            docData = convertFirestoreFieldsToData(doc.fields);
          } else {
            console.warn(`알 수 없는 문서 형식 건너뜀: ${JSON.stringify(doc).substring(0, 100)}...`);
            continue;
          }
          
          const docRef = db.collection(collectionName).doc(docId);
          batch.set(docRef, docData);
        }
        
        await batch.commit();
        processed += chunk.length;
        console.log(`  ${processed}/${documents.length} 문서 처리 완료`);
      }
      
      console.log(`컬렉션 복원 완료: ${collectionName}`);
    }
    
    console.log('\nFirestore 데이터 복원이 성공적으로 완료되었습니다!');
  } catch (error) {
    console.error('Firestore 데이터 복원 중 오류 발생:', error);
    process.exit(1);
  }
}

// Firestore 필드 구조를 일반 객체로 변환
function convertFirestoreFieldsToData(fields) {
  if (!fields) return {};
  
  const result = {};
  
  for (const [key, value] of Object.entries(fields)) {
    if (value.stringValue !== undefined) {
      result[key] = value.stringValue;
    } else if (value.integerValue !== undefined) {
      result[key] = parseInt(value.integerValue, 10);
    } else if (value.doubleValue !== undefined) {
      result[key] = parseFloat(value.doubleValue);
    } else if (value.booleanValue !== undefined) {
      result[key] = value.booleanValue;
    } else if (value.timestampValue !== undefined) {
      result[key] = new Date(value.timestampValue);
    } else if (value.nullValue !== undefined) {
      result[key] = null;
    } else if (value.arrayValue !== undefined) {
      result[key] = (value.arrayValue.values || []).map(item => {
        return convertFirestoreFieldsToData({ value: item }).value;
      });
    } else if (value.mapValue !== undefined) {
      result[key] = convertFirestoreFieldsToData(value.mapValue.fields || {});
    } else if (value.geoPointValue !== undefined) {
      result[key] = new admin.firestore.GeoPoint(
        value.geoPointValue.latitude,
        value.geoPointValue.longitude
      );
    } else if (value.referenceValue !== undefined) {
      result[key] = db.doc(value.referenceValue.replace(/^projects\/[^\/]+\/databases\/[^\/]+\/documents\//, ''));
    } else {
      console.warn(`알 수 없는 필드 유형 건너뜀: ${key}:`, value);
    }
  }
  
  return result;
}

// 메인 함수
async function main() {
  console.log('Firebase Firestore 데이터 복원 시작...');
  
  // Firebase 초기화
  const db = initializeFirebase();
  
  // 백업 데이터 로드
  const backupData = loadBackupData(backupDir);
  
  // 데이터 검증
  const collectionCount = Object.keys(backupData).length;
  if (collectionCount === 0) {
    console.error('복원할 데이터가 없습니다.');
    process.exit(1);
  }
  
  // 복원 진행 확인
  console.log(`\n총 ${collectionCount}개의 컬렉션을 복원합니다.`);
  
  // 데이터 복원
  await restoreFirestore(db, backupData);
}

// 메인 함수 실행
main().catch(console.error);
