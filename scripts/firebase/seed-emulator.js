/**
 * Firebase 에뮬레이터 데이터 시드 스크립트
 * 
 * 로컬 개발 및 테스트를 위한 Firebase 에뮬레이터에 샘플 데이터를 생성합니다.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Firebase 에뮬레이터 URL 설정
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:11004';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:11007';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:11008';

// 서비스 계정 정보 로드 (에뮬레이터 모드에서는 사용되지 않지만 초기화에 필요)
const projectId = 'db888';
const serviceAccountPath = path.join(__dirname, '../../firebase/service-account.json');

// Firebase 앱 초기화
let app;
if (fs.existsSync(serviceAccountPath)) {
  // 서비스 계정 키가 있는 경우
  const serviceAccount = require(serviceAccountPath);
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId
  });
} else {
  // 서비스 계정 키가 없는 경우
  app = admin.initializeApp({
    projectId
  });
}

// Firestore 인스턴스 가져오기
const db = admin.firestore();

/**
 * 샘플 사용자 데이터
 */
const sampleUsers = [
  {
    id: 'user1',
    name: '김테스트',
    email: 'user1@example.com',
    role: 'admin',
    createdAt: admin.firestore.Timestamp.now()
  },
  {
    id: 'user2',
    name: '이개발',
    email: 'user2@example.com',
    role: 'user',
    createdAt: admin.firestore.Timestamp.now()
  },
  {
    id: 'user3',
    name: '박분석',
    email: 'user3@example.com',
    role: 'analyst',
    createdAt: admin.firestore.Timestamp.now()
  }
];

/**
 * 샘플 고가치 사용자 데이터
 */
const sampleHighValueUsers = [
  {
    userId: 'hv001',
    netBet: 2500000,
    totalDeposit: 3000000,
    activeDays: 25,
    lastActivity: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)), // 2일 전
    status: 'active',
    segment: 'high_roller',
    conversionRate: 0.85
  },
  {
    userId: 'hv002',
    netBet: 1500000,
    totalDeposit: 2000000,
    activeDays: 15,
    lastActivity: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)), // 15일 전
    status: 'inactive_recent',
    segment: 'frequent_bettor',
    conversionRate: 0.7
  },
  {
    userId: 'hv003',
    netBet: 3500000,
    totalDeposit: 4000000,
    activeDays: 30,
    lastActivity: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)), // 45일 전
    status: 'inactive_long',
    segment: 'high_roller',
    conversionRate: 0.9
  }
];

/**
 * 샘플 이벤트 데이터
 */
const sampleEvents = [
  {
    id: 'event1',
    name: '신규 사용자 웰컴 보너스',
    description: '신규 사용자 가입 시 지급되는 웰컴 보너스',
    reward: 10000,
    startDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
    endDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
    status: 'active',
    targetSegment: 'new_user'
  },
  {
    id: 'event2',
    name: '휴면 사용자 복귀 이벤트',
    description: '30일 이상 접속하지 않은 휴면 사용자 대상 복귀 이벤트',
    reward: 20000,
    startDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)),
    endDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)),
    status: 'active',
    targetSegment: 'inactive'
  },
  {
    id: 'event3',
    name: 'VIP 사용자 특별 이벤트',
    description: '고가치 사용자 대상 특별 이벤트',
    reward: 50000,
    startDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
    endDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    status: 'active',
    targetSegment: 'high_value'
  }
];

/**
 * 샘플 이벤트 참여 데이터
 */
const sampleEventParticipations = [
  {
    userId: 'hv001',
    eventId: 'event3',
    participationDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)),
    rewardClaimed: true,
    rewardAmount: 50000,
    convertedToDeposit: true,
    depositAmount: 200000,
    depositDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000))
  },
  {
    userId: 'hv002',
    eventId: 'event2',
    participationDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)),
    rewardClaimed: true,
    rewardAmount: 20000,
    convertedToDeposit: false,
    depositAmount: 0,
    depositDate: null
  },
  {
    userId: 'hv003',
    eventId: 'event2',
    participationDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 12 * 24 * 60 * 60 * 1000)),
    rewardClaimed: true,
    rewardAmount: 20000,
    convertedToDeposit: true,
    depositAmount: 100000,
    depositDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000))
  }
];

/**
 * Firestore 데이터 시드
 */
async function seedFirestore() {
  console.log('Firestore 데이터 시드 시작...');
  
  // 컬렉션 참조
  const usersRef = db.collection('users');
  const highValueUsersRef = db.collection('highValueUsers');
  const eventsRef = db.collection('events');
  const eventParticipationsRef = db.collection('eventParticipations');
  
  // 배치 작업
  const batch = db.batch();
  
  // 기존 데이터 삭제 (선택 사항)
  const clear = process.argv.includes('--clear');
  if (clear) {
    console.log('기존 데이터 삭제 중...');
    await deleteCollection(db, 'users');
    await deleteCollection(db, 'highValueUsers');
    await deleteCollection(db, 'events');
    await deleteCollection(db, 'eventParticipations');
  }
  
  // 사용자 데이터 추가
  console.log('사용자 데이터 추가 중...');
  sampleUsers.forEach(user => {
    const docRef = usersRef.doc(user.id);
    batch.set(docRef, user);
  });
  
  // 고가치 사용자 데이터 추가
  console.log('고가치 사용자 데이터 추가 중...');
  sampleHighValueUsers.forEach(user => {
    const docRef = highValueUsersRef.doc(user.userId);
    batch.set(docRef, user);
  });
  
  // 이벤트 데이터 추가
  console.log('이벤트 데이터 추가 중...');
  sampleEvents.forEach(event => {
    const docRef = eventsRef.doc(event.id);
    batch.set(docRef, event);
  });
  
  // 이벤트 참여 데이터 추가
  console.log('이벤트 참여 데이터 추가 중...');
  sampleEventParticipations.forEach((participation, index) => {
    const docRef = eventParticipationsRef.doc(`participation${index + 1}`);
    batch.set(docRef, participation);
  });
  
  // 배치 커밋
  await batch.commit();
  
  console.log('Firestore 데이터 시드 완료!');
}

/**
 * 컬렉션 삭제
 * @param {FirebaseFirestore.Firestore} db Firestore 인스턴스
 * @param {string} collectionPath 컬렉션 경로
 * @param {number} batchSize 배치 크기
 */
async function deleteCollection(db, collectionPath, batchSize = 50) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.limit(batchSize);
  
  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, batchSize, resolve, reject);
  });
}

/**
 * 쿼리 배치 삭제
 * @param {FirebaseFirestore.Firestore} db Firestore 인스턴스
 * @param {FirebaseFirestore.Query} query 쿼리
 * @param {number} batchSize 배치 크기
 * @param {Function} resolve Promise resolve 함수
 * @param {Function} reject Promise reject 함수
 */
function deleteQueryBatch(db, query, batchSize, resolve, reject) {
  query.get()
    .then(snapshot => {
      // 더 이상 삭제할 문서가 없으면 완료
      if (snapshot.size === 0) {
        return 0;
      }
      
      // 배치 삭제 설정
      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // 배치 커밋 및 다음 배치 처리
      return batch.commit()
        .then(() => snapshot.size);
    })
    .then(numDeleted => {
      if (numDeleted === 0) {
        resolve();
        return;
      }
      
      // 재귀적으로 다음 배치 삭제
      process.nextTick(() => {
        deleteQueryBatch(db, query, batchSize, resolve, reject);
      });
    })
    .catch(reject);
}

// 메인 함수 실행
seedFirestore()
  .then(() => {
    console.log('Firebase 에뮬레이터 데이터 시드 완료!');
    process.exit(0);
  })
  .catch(error => {
    console.error('에러:', error);
    process.exit(1);
  });
