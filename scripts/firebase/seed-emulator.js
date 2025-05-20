/**
 * Firebase 에뮬레이터 테스트 데이터 설정 스크립트
 * 
 * Firestore 에뮬레이터에 테스트 데이터를 설정합니다.
 * - 고가치 사용자 데이터
 * - 이벤트 데이터
 * - 분석 결과 데이터
 * 
 * 실행 방법:
 * - 먼저 Firebase 에뮬레이터 실행: firebase emulators:start
 * - 다른 터미널에서 실행: node scripts/firebase/seed-emulator.js
 */

// 필요한 모듈 불러오기
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 테스트 환경에서는 에뮬레이터에 연결
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

// Firebase Admin SDK 초기화
admin.initializeApp({
  projectId: 'db888-67827'
});

const db = admin.firestore();

/**
 * 샘플 데이터 생성 및 저장
 */
async function seedFirestore() {
  console.log('🌱 Firestore 에뮬레이터에 테스트 데이터 설정 중...');
  console.log('---------------------------------------------');
  
  try {
    // 샘플 데이터 디렉토리 확인
    const dataDir = path.join(__dirname, '../../data/test');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`✓ 테스트 데이터 디렉토리 생성: ${dataDir}`);
    }
    
    // 고가치 사용자 샘플 데이터 생성 및 저장
    await seedHighValueUsers();
    
    // 이벤트 샘플 데이터 생성 및 저장
    await seedEvents();
    
    // 분석 결과 샘플 데이터 생성 및 저장
    await seedAnalyticsResults();
    
    console.log('---------------------------------------------');
    console.log('✅ Firestore 에뮬레이터 데이터 설정 완료!');
  } catch (error) {
    console.error('❌ Firestore 에뮬레이터 데이터 설정 실패:', error);
    throw error;
  }
}

/**
 * 고가치 사용자 샘플 데이터 생성 및 저장
 */
async function seedHighValueUsers() {
  console.log('\n📊 고가치 사용자 데이터 생성 중...');
  
  // 활성 고가치 사용자 샘플 데이터
  const activeUsers = Array.from({ length: 20 }, (_, i) => ({
    userId: `user-${i + 1}`,
    userName: `User ${i + 1}`,
    netBet: Math.floor(Math.random() * 500000) + 50000,
    playDays: Math.floor(Math.random() * 20) + 5,
    lastActivity: new Date(Date.now() - (Math.floor(Math.random() * 15) * 24 * 60 * 60 * 1000)).toISOString(),
    depositCount: Math.floor(Math.random() * 10) + 1,
    totalDeposit: Math.floor(Math.random() * 1000000) + 100000,
    isActive: true,
    inactiveDays: Math.floor(Math.random() * 15)
  }));
  
  // 휴면 고가치 사용자 샘플 데이터
  const dormantUsers = Array.from({ length: 20 }, (_, i) => ({
    userId: `user-${i + 101}`,
    userName: `User ${i + 101}`,
    netBet: Math.floor(Math.random() * 800000) + 50000,
    playDays: Math.floor(Math.random() * 30) + 5,
    lastActivity: new Date(Date.now() - ((Math.floor(Math.random() * 100) + 30) * 24 * 60 * 60 * 1000)).toISOString(),
    depositCount: Math.floor(Math.random() * 15) + 1,
    totalDeposit: Math.floor(Math.random() * 1500000) + 100000,
    isActive: false,
    inactiveDays: Math.floor(Math.random() * 100) + 30
  }));
  
  // 모든 사용자 데이터 합치기
  const highValueUsers = [...activeUsers, ...dormantUsers];
  
  // 데이터 저장
  const filePath = path.join(__dirname, '../../data/test/high-value-users.json');
  fs.writeFileSync(filePath, JSON.stringify(highValueUsers, null, 2));
  console.log(`✓ 샘플 데이터 파일 생성: ${filePath}`);
  
  // Firestore에 저장
  const highValueUsersBatch = db.batch();
  
  highValueUsers.forEach((user) => {
    const docRef = db.collection('highValueUsers').doc(user.userId);
    highValueUsersBatch.set(docRef, {
      ...user,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  
  await highValueUsersBatch.commit();
  console.log(`✓ ${highValueUsers.length}명의 고가치 사용자 데이터를 Firestore에 저장했습니다.`);
  
  // 최신 데이터 문서 생성
  await db.collection('highValueUsers').doc('latest').set({
    count: highValueUsers.length,
    active: activeUsers.length,
    dormant: dormantUsers.length,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log('✓ 고가치 사용자 최신 데이터 문서를 생성했습니다.');
}

/**
 * 이벤트 샘플 데이터 생성 및 저장
 */
async function seedEvents() {
  console.log('\n🎮 이벤트 데이터 생성 중...');
  
  // 이벤트 유형
  const eventTypes = ['출석 보상', '첫 충전 보너스', '복귀 보너스', '주간 도전', '특별 이벤트'];
  
  // 이벤트 샘플 데이터
  const events = Array.from({ length: 10 }, (_, i) => ({
    eventId: `event-${i + 1}`,
    eventName: `${eventTypes[i % eventTypes.length]} ${i + 1}`,
    startDate: new Date(Date.now() - ((Math.floor(Math.random() * 60) + 1) * 24 * 60 * 60 * 1000)).toISOString(),
    endDate: new Date(Date.now() + ((Math.floor(Math.random() * 30) + 1) * 24 * 60 * 60 * 1000)).toISOString(),
    description: `${eventTypes[i % eventTypes.length]} 이벤트 ${i + 1} 설명`,
    rewardType: i % 2 === 0 ? '게임 포인트' : '보너스 머니',
    rewardAmount: Math.floor(Math.random() * 10000) + 1000,
    targetUserType: i % 3 === 0 ? '모든 사용자' : (i % 3 === 1 ? '신규 사용자' : '휴면 사용자'),
    status: i < 8 ? 'active' : 'ended',
    participantCount: Math.floor(Math.random() * 1000) + 100,
    conversionRate: Math.random() * 0.3 + 0.1
  }));
  
  // 데이터 저장
  const filePath = path.join(__dirname, '../../data/test/events.json');
  fs.writeFileSync(filePath, JSON.stringify(events, null, 2));
  console.log(`✓ 샘플 데이터 파일 생성: ${filePath}`);
  
  // Firestore에 저장
  const eventsBatch = db.batch();
  
  events.forEach((event) => {
    const docRef = db.collection('events').doc(event.eventId);
    eventsBatch.set(docRef, {
      ...event,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  
  await eventsBatch.commit();
  console.log(`✓ ${events.length}개의 이벤트 데이터를 Firestore에 저장했습니다.`);
  
  // 이벤트 분석 최신 데이터 문서 생성
  await db.collection('eventAnalytics').doc('latest').set({
    count: events.length,
    active: events.filter(event => event.status === 'active').length,
    ended: events.filter(event => event.status === 'ended').length,
    avgConversionRate: events.reduce((sum, event) => sum + event.conversionRate, 0) / events.length,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log('✓ 이벤트 분석 최신 데이터 문서를 생성했습니다.');
}

/**
 * 분석 결과 샘플 데이터 생성 및 저장
 */
async function seedAnalyticsResults() {
  console.log('\n📈 분석 결과 데이터 생성 중...');
  
  // 사용자 세그먼트 샘플 데이터
  const userSegments = {
    activeWhales: {
      count: 12,
      avgSpend: 350000,
      retention: 0.85,
      conversionRate: 0.72
    },
    dormantWhales: {
      count: 28,
      avgSpend: 420000,
      retention: 0.12,
      conversionRate: 0.18
    },
    activeMidTier: {
      count: 45,
      avgSpend: 120000,
      retention: 0.78,
      conversionRate: 0.65
    },
    dormantMidTier: {
      count: 87,
      avgSpend: 140000,
      retention: 0.08,
      conversionRate: 0.21
    },
    activeLowTier: {
      count: 134,
      avgSpend: 30000,
      retention: 0.62,
      conversionRate: 0.48
    },
    dormantLowTier: {
      count: 245,
      avgSpend: 25000,
      retention: 0.05,
      conversionRate: 0.14
    }
  };
  
  // 전환율 메트릭 샘플 데이터
  const conversionMetrics = {
    overall: {
      eventParticipation: 0.32,
      eventToDeposit: 0.18,
      avgDepositAmount: 85000
    },
    byInactivityDuration: [
      { range: '30-60일', participation: 0.38, conversion: 0.25, avgDeposit: 95000 },
      { range: '61-90일', participation: 0.28, conversion: 0.19, avgDeposit: 82000 },
      { range: '91-180일', participation: 0.21, conversion: 0.12, avgDeposit: 75000 },
      { range: '180일 이상', participation: 0.15, conversion: 0.08, avgDeposit: 62000 }
    ],
    byEventType: [
      { type: '출석 보상', participation: 0.45, conversion: 0.15, avgDeposit: 65000 },
      { type: '첫 충전 보너스', participation: 0.25, conversion: 0.35, avgDeposit: 120000 },
      { type: '복귀 보너스', participation: 0.38, conversion: 0.28, avgDeposit: 95000 },
      { type: '주간 도전', participation: 0.22, conversion: 0.18, avgDeposit: 75000 },
      { type: '특별 이벤트', participation: 0.32, conversion: 0.22, avgDeposit: 85000 }
    ]
  };
  
  // Firestore에 저장 - 사용자 세그먼트
  await db.collection('userSegments').doc('latest').set({
    ...userSegments,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log('✓ 사용자 세그먼트 데이터를 Firestore에 저장했습니다.');
  
  // Firestore에 저장 - 전환율 메트릭
  await db.collection('conversionMetrics').doc('latest').set({
    ...conversionMetrics,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log('✓ 전환율 메트릭 데이터를 Firestore에 저장했습니다.');
  
  // 일일 스냅샷 생성
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  
  await db.collection('analyticsResults').doc('daily').collection(dateStr).doc('userSegments').set({
    ...userSegments,
    date: dateStr,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  
  await db.collection('analyticsResults').doc('daily').collection(dateStr).doc('conversionMetrics').set({
    ...conversionMetrics,
    date: dateStr,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  
  console.log(`✓ 일일 분석 스냅샷을 생성했습니다. (${dateStr})`);
}

// 함수 실행
seedFirestore().catch(error => {
  console.error('\n❌ 에뮬레이터 데이터 설정 실패!', error);
  process.exit(1);
});
