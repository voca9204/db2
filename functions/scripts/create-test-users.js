/**
 * Firebase Authentication 테스트 사용자 생성 스크립트
 */

const admin = require('firebase-admin');

// Firebase Admin SDK 초기화
if (admin.apps.length === 0) {
  admin.initializeApp();
}

async function createTestUsers() {
  console.log('🔧 Firebase Authentication 테스트 사용자 생성 시작...');
  
  const testUsers = [
    {
      uid: 'test-admin-001',
      email: 'admin@test.com',
      password: 'testpassword123',
      displayName: 'Test Admin User',
      roles: ['admin']
    },
    {
      uid: 'test-analyst-001', 
      email: 'analyst@test.com',
      password: 'testpassword123',
      displayName: 'Test Analyst User',
      roles: ['analyst']
    }
  ];

  try {
    for (const userData of testUsers) {
      console.log(`👤 사용자 생성 중: ${userData.email}`);
      
      try {
        const userRecord = await admin.auth().createUser({
          uid: userData.uid,
          email: userData.email,
          password: userData.password,
          displayName: userData.displayName,
          emailVerified: true
        });
        
        console.log(`✅ Firebase Auth 사용자 생성 성공: ${userRecord.uid}`);
        
        // Firestore에 사용자 프로필 생성
        await admin.firestore().collection('users').doc(userData.uid).set({
          uid: userData.uid,
          email: userData.email,
          name: userData.displayName,
          roles: userData.roles,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
          isTestUser: true
        });
        
        console.log(`✅ Firestore 프로필 생성 성공: ${userData.uid}`);
        
      } catch (error) {
        if (error.code === 'auth/uid-already-exists') {
          console.log(`⚠️  사용자가 이미 존재함: ${userData.email}`);
          
          // 기존 사용자의 Firestore 프로필 업데이트
          await admin.firestore().collection('users').doc(userData.uid).set({
            uid: userData.uid,
            email: userData.email,
            name: userData.displayName,
            roles: userData.roles,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            isTestUser: true
          }, { merge: true });
          
          console.log(`✅ 기존 사용자 프로필 업데이트 완료: ${userData.uid}`);
        } else {
          console.error(`❌ 사용자 생성 실패: ${userData.email}`, error.message);
        }
      }
    }
    
    console.log('\n🎉 모든 테스트 사용자 생성 완료!');
    
  } catch (error) {
    console.error('❌ 테스트 사용자 생성 중 오류:', error);
  }
}

// 실행
if (require.main === module) {
  createTestUsers().then(() => process.exit(0));
}

module.exports = { createTestUsers };
