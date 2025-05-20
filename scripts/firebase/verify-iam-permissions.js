/**
 * IAM 권한 검증 스크립트
 * 
 * 현재 인증된 서비스 계정이 가진 IAM 권한을 검증하고
 * Firebase Functions 배포 및 실행에 필요한 권한이 있는지 확인합니다.
 * 
 * 실행 방법:
 * - node scripts/firebase/verify-iam-permissions.js
 */

// 환경 변수 로드
require('dotenv').config();

// 필요한 모듈 불러오기
const { initializeFirebaseApp, getProjectId } = require('../../functions/src/firebase/admin');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// 필요한 IAM 권한 목록
const requiredRoles = [
  'roles/firebase.admin',
  'roles/firebasefunctions.admin',
  'roles/firebaseauth.admin',
  'roles/datastore.user',
  'roles/storage.objectAdmin',
  'roles/logging.logWriter',
  'roles/monitoring.metricWriter'
];

/**
 * IAM 권한 검증 함수
 */
async function verifyIamPermissions() {
  try {
    console.log('🔍 IAM 권한 검증 시작...');
    console.log('-------------------------------------------');
    
    // Firebase 앱 초기화
    initializeFirebaseApp();
    const projectId = getProjectId();
    console.log(`✓ 프로젝트 ID: ${projectId}`);
    
    // gcloud 명령어 실행 가능 여부 확인
    try {
      await execAsync('gcloud --version');
      console.log('✓ gcloud CLI가 설치되어 있습니다.');
    } catch (error) {
      console.error('❌ gcloud CLI가 설치되어 있지 않습니다. 권한 검증을 위해 gcloud CLI가 필요합니다.');
      console.error('  - https://cloud.google.com/sdk/docs/install 에서 설치해주세요.');
      process.exit(1);
    }
    
    // 현재 인증된 계정 확인
    let serviceAccountEmail;
    try {
      const { stdout } = await execAsync('gcloud auth list --filter=status:ACTIVE --format="value(account)"');
      serviceAccountEmail = stdout.trim();
      
      if (!serviceAccountEmail) {
        throw new Error('인증된 계정이 없습니다.');
      }
      
      console.log(`✓ 현재 인증된 계정: ${serviceAccountEmail}`);
    } catch (error) {
      console.error('❌ 인증된 계정 정보를 가져오는데 실패했습니다.');
      console.error('  - gcloud auth login 명령어로 로그인해주세요.');
      process.exit(1);
    }
    
    // 프로젝트 IAM 정책 가져오기
    console.log('\n📋 프로젝트 IAM 정책 조회 중...');
    let projectPolicy;
    try {
      const { stdout } = await execAsync(`gcloud projects get-iam-policy ${projectId} --format=json`);
      projectPolicy = JSON.parse(stdout);
      console.log('✓ IAM 정책을 성공적으로 가져왔습니다.');
    } catch (error) {
      console.error('❌ IAM 정책을 가져오는데 실패했습니다.');
      console.error('  - 오류 메시지:', error.message);
      process.exit(1);
    }
    
    // Compute Engine 서비스 계정 권한 조회
    const computeServiceAccount = `${projectId.split(':').pop()}@appspot.gserviceaccount.com`; // default App Engine SA
    const computeEngineServiceAccount = projectPolicy.bindings
      .find(binding => binding.role === 'roles/compute.serviceAgent')?.members
      .find(member => member.startsWith('serviceAccount:'))
      ?.replace('serviceAccount:', '');
    
    console.log('\n👤 서비스 계정 정보:');
    console.log(`  - App Engine 서비스 계정: ${computeServiceAccount}`);
    console.log(`  - Compute Engine 서비스 계정: ${computeEngineServiceAccount || '(없음)'}`);
    
    // 권한 검증
    console.log('\n🔒 필요한 IAM 권한 검증:');
    
    // 현재 계정의 역할 목록 수집
    const memberRoles = projectPolicy.bindings
      .filter(binding => binding.members.includes(`user:${serviceAccountEmail}`) || 
                          binding.members.includes(`serviceAccount:${serviceAccountEmail}`))
      .map(binding => binding.role);
    
    // Firebase 기능 사용 권한 검사
    const hadPermissions = [];
    const missingPermissions = [];
    
    for (const role of requiredRoles) {
      // 정확한 역할 일치 또는 상위 역할 포함 여부 확인
      const hasRole = memberRoles.some(memberRole => {
        return memberRole === role || 
               memberRole === 'roles/owner' || 
               memberRole === 'roles/editor';
      });
      
      if (hasRole) {
        hadPermissions.push(role);
      } else {
        missingPermissions.push(role);
      }
    }
    
    // 결과 출력
    if (hadPermissions.length > 0) {
      console.log('\n✅ 보유 중인 권한:');
      hadPermissions.forEach(role => console.log(`  - ${role}`));
    }
    
    if (missingPermissions.length > 0) {
      console.log('\n⚠️ 누락된 권한:');
      missingPermissions.forEach(role => console.log(`  - ${role}`));
      console.log('\n다음 명령어로 권한을 추가할 수 있습니다:');
      missingPermissions.forEach(role => {
        console.log(`  gcloud projects add-iam-policy-binding ${projectId} --member="user:${serviceAccountEmail}" --role="${role}"`);
      });
    } else {
      console.log('\n✅ 모든 필요한 권한을 보유하고 있습니다.');
    }
    
    // Compute Engine 서비스 계정 확인
    if (!computeEngineServiceAccount) {
      console.log('\n⚠️ Compute Engine 서비스 계정이 없거나 확인할 수 없습니다.');
      console.log('  - Firebase Functions 배포에 필요한 서비스 계정을 생성해야 할 수 있습니다.');
      console.log('  - Google Cloud Console > IAM 및 관리 > 서비스 계정에서 확인하세요.');
    }
    
    console.log('\n-------------------------------------------');
    console.log('✅ IAM 권한 검증 완료!');
    console.log('-------------------------------------------');
    
    // 부가 정보 제공
    if (missingPermissions.length > 0 || !computeEngineServiceAccount) {
      console.log('\n🔧 문제 해결 방법:');
      console.log('1. Google Cloud Console(https://console.cloud.google.com)에 로그인합니다.');
      console.log(`2. 프로젝트 선택 드롭다운에서 '${projectId}' 프로젝트를 선택합니다.`);
      console.log('3. 왼쪽 메뉴에서 "IAM 및 관리 > IAM"을 선택합니다.');
      console.log('4. "IAM 역할 부여" 버튼을 클릭하고 필요한 권한을 추가합니다.');
      console.log('5. Compute Engine API가 활성화되어 있는지 확인합니다:');
      console.log('   - "API 및 서비스 > 라이브러리"에서 "Compute Engine API" 검색 후 활성화');
      console.log('6. 서비스 계정이 없다면 생성:');
      console.log('   - "IAM 및 관리 > 서비스 계정"에서 "서비스 계정 생성" 버튼 클릭');
    }
  } catch (error) {
    console.error('\n❌ IAM 권한 검증 실패!');
    console.error('-------------------------------------------');
    console.error('오류 메시지:', error.message);
    console.error('오류 세부 정보:', error);
    process.exit(1);
  }
}

// 검증 실행
verifyIamPermissions();
