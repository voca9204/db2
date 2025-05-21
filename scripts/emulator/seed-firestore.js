/**
 * Firebase Emulator 시드 데이터 생성 스크립트
 * 
 * 이 스크립트는 Firebase 에뮬레이터에 테스트 데이터를 로드합니다.
 * 로컬 개발 환경에서 실제 데이터와 유사한 테스트 데이터를 사용할 수 있도록 합니다.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Firebase Admin SDK 초기화
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'db888-emulator'
  });
}

const db = admin.firestore();

// 시드 데이터 디렉토리
const seedsDir = path.join(__dirname, 'seeds');

/**
 * 샘플 사용자 데이터 생성 및 저장
 */
async function seedUsers() {
  console.log('사용자 데이터 시드 생성 중...');
  
  const users = [
    {
      userId: 'test001',
      status: 0,
      lastLogin: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3일 전
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30), // 30일 전
      totalDeposit: 150000,
      totalBet: 120000,
      isHighValue: true,
      metadata: {
        source: 'emulator',
        testUser: true
      }
    },
    {
      userId: 'test002',
      status: 0,
      lastLogin: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10), // 10일 전
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45), // 45일 전
      totalDeposit: 75000,
      totalBet: 60000,
      isHighValue: false,
      metadata: {
        source: 'emulator',
        testUser: true
      }
    },
    {
      userId: 'dormant001',
      status: 0,
      lastLogin: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90), // 90일 전
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 180), // 180일 전
      totalDeposit: 250000,
      totalBet: 220000,
      isHighValue: true,
      metadata: {
        source: 'emulator',
        testUser: true,
        dormant: true
      }
    },
    {
      userId: 'dormant002',
      status: 0,
      lastLogin: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60), // 60일 전
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 150), // 150일 전
      totalDeposit: 50000,
      totalBet: 45000,
      isHighValue: false,
      metadata: {
        source: 'emulator',
        testUser: true,
        dormant: true
      }
    },
    {
      userId: 'event001',
      status: 0,
      lastLogin: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2일 전
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 200), // 200일 전
      totalDeposit: 300000,
      totalBet: 280000,
      isHighValue: true,
      metadata: {
        source: 'emulator',
        testUser: true,
        reactivated: true
      }
    }
  ];
  
  const batch = db.batch();
  
  users.forEach(user => {
    const userRef = db.collection('users').doc(user.userId);
    batch.set(userRef, user);
  });
  
  await batch.commit();
  console.log(`${users.length}명의 사용자 데이터 추가 완료`);
  
  // 시드 데이터 파일로 저장
  fs.writeFileSync(
    path.join(seedsDir, 'users.json'),
    JSON.stringify(users, null, 2)
  );
}

/**
 * 샘플 이벤트 데이터 생성 및 저장
 */
async function seedEvents() {
  console.log('이벤트 데이터 시드 생성 중...');
  
  const events = [
    {
      id: 'event001',
      name: '신규 가입자 환영 이벤트',
      description: '첫 가입 시 보너스',
      startDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30), // 30일 전
      endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30일 후
      reward: 10000,
      active: true,
      criteria: {
        newUser: true,
        minimumDeposit: 0
      }
    },
    {
      id: 'event002',
      name: '첫 입금 보너스',
      description: '첫 입금 시 보너스',
      startDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30), // 30일 전
      endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30일 후
      reward: 20000,
      active: true,
      criteria: {
        firstDeposit: true,
        minimumDeposit: 50000
      }
    },
    {
      id: 'event003',
      name: '휴면 사용자 복귀 이벤트',
      description: '30일 이상 접속하지 않은 사용자 대상 보너스',
      startDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15), // 15일 전
      endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 15), // 15일 후
      reward: 15000,
      active: true,
      criteria: {
        dormantDays: 30,
        minimumPreviousDeposit: 10000
      }
    },
    {
      id: 'event004',
      name: 'VIP 사용자 특별 이벤트',
      description: '고액 사용자 대상 특별 혜택',
      startDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10), // 10일 전
      endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 20), // 20일 후
      reward: 50000,
      active: true,
      criteria: {
        totalDeposit: 200000,
        totalBet: 150000
      }
    },
    {
      id: 'event005',
      name: '신규 게임 출시 이벤트',
      description: '신규 게임 플레이 보너스',
      startDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5), // 5일 전
      endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 25), // 25일 후
      reward: 5000,
      active: true,
      criteria: {
        gameId: 'newgame001',
        minimumBet: 10000
      }
    }
  ];
  
  const batch = db.batch();
  
  events.forEach(event => {
    const eventRef = db.collection('events').doc(event.id);
    batch.set(eventRef, event);
  });
  
  await batch.commit();
  console.log(`${events.length}개의 이벤트 데이터 추가 완료`);
  
  // 시드 데이터 파일로 저장
  fs.writeFileSync(
    path.join(seedsDir, 'events.json'),
    JSON.stringify(events, null, 2)
  );
}

/**
 * 이벤트-사용자 관계 데이터 생성 및 저장
 */
async function seedEventParticipants() {
  console.log('이벤트 참여자 데이터 시드 생성 중...');
  
  const eventParticipants = [
    {
      id: 'ep001',
      eventId: 'event001',
      userId: 'test001',
      joinDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 25), // 25일 전
      rewardAmount: 10000,
      rewardPaid: true,
      paymentDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 25),
      metadata: {
        source: 'emulator'
      }
    },
    {
      id: 'ep002',
      eventId: 'event002',
      userId: 'test001',
      joinDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20), // 20일 전
      rewardAmount: 20000,
      rewardPaid: true,
      paymentDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20),
      metadata: {
        source: 'emulator'
      }
    },
    {
      id: 'ep003',
      eventId: 'event003',
      userId: 'dormant001',
      joinDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10), // 10일 전
      rewardAmount: 15000,
      rewardPaid: true,
      paymentDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10),
      metadata: {
        source: 'emulator'
      }
    },
    {
      id: 'ep004',
      eventId: 'event003',
      userId: 'dormant002',
      joinDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8), // 8일 전
      rewardAmount: 15000,
      rewardPaid: true,
      paymentDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8),
      metadata: {
        source: 'emulator'
      }
    },
    {
      id: 'ep005',
      eventId: 'event004',
      userId: 'test001',
      joinDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5), // 5일 전
      rewardAmount: 50000,
      rewardPaid: true,
      paymentDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
      metadata: {
        source: 'emulator'
      }
    },
    {
      id: 'ep006',
      eventId: 'event005',
      userId: 'test002',
      joinDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3일 전
      rewardAmount: 5000,
      rewardPaid: false,
      paymentDate: null,
      metadata: {
        source: 'emulator'
      }
    },
    {
      id: 'ep007',
      eventId: 'event003',
      userId: 'event001',
      joinDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12), // 12일 전
      rewardAmount: 15000,
      rewardPaid: true,
      paymentDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12),
      metadata: {
        source: 'emulator',
        subsequentDeposit: true,
        depositAmount: 100000,
        depositDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10)
      }
    }
  ];
  
  const batch = db.batch();
  
  eventParticipants.forEach(participant => {
    const participantRef = db.collection('eventParticipants').doc(participant.id);
    batch.set(participantRef, participant);
  });
  
  await batch.commit();
  console.log(`${eventParticipants.length}개의 이벤트 참여자 데이터 추가 완료`);
  
  // 시드 데이터 파일로 저장
  fs.writeFileSync(
    path.join(seedsDir, 'event-participants.json'),
    JSON.stringify(eventParticipants, null, 2)
  );
}

/**
 * 게임 트랜잭션 데이터 생성 및 저장
 */
async function seedGameTransactions() {
  console.log('게임 트랜잭션 데이터 시드 생성 중...');
  
  const transactions = [];
  const userIds = ['test001', 'test002', 'dormant001', 'dormant002', 'event001'];
  const gameTypes = ['slot', 'poker', 'blackjack', 'roulette', 'baccarat'];
  
  // 각 사용자별로 게임 트랜잭션 생성
  userIds.forEach(userId => {
    // 사용자별 10-20개의 트랜잭션 생성
    const txCount = Math.floor(Math.random() * 11) + 10;
    
    for (let i = 0; i < txCount; i++) {
      const gameType = gameTypes[Math.floor(Math.random() * gameTypes.length)];
      const betAmount = Math.floor(Math.random() * 10000) + 1000;
      const winLoss = Math.random() > 0.5 ? 
        Math.floor(Math.random() * betAmount * 2) : 
        -Math.floor(Math.random() * betAmount);
      
      // 트랜잭션 날짜는 사용자 유형에 따라 차등 설정
      let txDate;
      if (userId.startsWith('dormant')) {
        // 휴면 사용자는 60-180일 전 트랜잭션
        const daysAgo = Math.floor(Math.random() * 121) + 60;
        txDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * daysAgo);
      } else if (userId === 'event001') {
        // 재활성화된 사용자는 트랜잭션 혼합
        if (Math.random() > 0.7) {
          // 30% 트랜잭션은 최근 (이벤트 참여 후)
          const daysAgo = Math.floor(Math.random() * 8) + 1;
          txDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * daysAgo);
        } else {
          // 70% 트랜잭션은 오래됨 (휴면 기간)
          const daysAgo = Math.floor(Math.random() * 60) + 30;
          txDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * daysAgo);
        }
      } else {
        // 일반 사용자는 1-30일 전 트랜잭션
        const daysAgo = Math.floor(Math.random() * 30) + 1;
        txDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * daysAgo);
      }
      
      transactions.push({
        id: `tx${userId}${i}`,
        userId,
        gameType,
        betAmount,
        winLoss,
        date: txDate,
        metadata: {
          source: 'emulator',
          session: `session${userId}${Math.floor(i/3)}`
        }
      });
    }
  });
  
  // 배치 단위로 저장 (Firestore 배치 한도는 500개)
  const batchSize = 100;
  const batches = [];
  
  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = db.batch();
    const chunk = transactions.slice(i, i + batchSize);
    
    chunk.forEach(tx => {
      const txRef = db.collection('gameTransactions').doc(tx.id);
      batch.set(txRef, tx);
    });
    
    batches.push(batch.commit());
  }
  
  await Promise.all(batches);
  console.log(`${transactions.length}개의 게임 트랜잭션 데이터 추가 완료`);
  
  // 시드 데이터 파일로 저장
  fs.writeFileSync(
    path.join(seedsDir, 'game-transactions.json'),
    JSON.stringify(transactions, null, 2)
  );
}

/**
 * 모든 시드 데이터 로드
 */
async function seedAll() {
  console.log('Firebase Emulator 시드 데이터 로드 시작...');
  
  try {
    // 시드 디렉토리 확인 및 생성
    if (!fs.existsSync(seedsDir)) {
      fs.mkdirSync(seedsDir, { recursive: true });
    }
    
    // 각 데이터 타입 시드 생성
    await seedUsers();
    await seedEvents();
    await seedEventParticipants();
    await seedGameTransactions();
    
    console.log('\nFirebase Emulator 시드 데이터 로드 완료!');
  } catch (error) {
    console.error('시드 데이터 로드 중 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
seedAll().catch(console.error);
