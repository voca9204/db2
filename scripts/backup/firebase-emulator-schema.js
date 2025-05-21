/**
 * Firebase 에뮬레이터 테스트 데이터 스키마 정의
 * 
 * 이 스크립트는 DB2 프로젝트의 Firebase 에뮬레이터에 필요한 데이터 스키마를 정의합니다.
 * 스키마 정의는 에뮬레이터 데이터 시드 생성 시 사용됩니다.
 */

// 데이터 컬렉션 및 필드 구조 정의
const dataSchema = {
  // 사용자 컬렉션
  users: {
    fields: {
      id: { type: 'string', description: '사용자 ID' },
      userId: { type: 'string', description: '사용자 고유 식별자' },
      name: { type: 'string', description: '사용자 이름 (민감 정보로 취급)' },
      email: { type: 'string', description: '사용자 이메일' },
      role: { type: 'string', description: '사용자 역할 (admin, user 등)' },
      status: { type: 'number', description: '사용자 상태 코드' },
      createdAt: { type: 'timestamp', description: '생성 시간' },
      lastLoginAt: { type: 'timestamp', description: '마지막 로그인 시간' }
    },
    description: '사용자 정보를 저장하는 컬렉션',
    notes: '민감 정보인 name 필드는 결과에 표시하지 않아야 함'
  },
  
  // 고가치 사용자 컬렉션
  highValueUsers: {
    fields: {
      userId: { type: 'string', description: '사용자 고유 식별자' },
      totalBet: { type: 'number', description: '총 베팅 금액' },
      totalDeposit: { type: 'number', description: '총 입금 금액' },
      netBet: { type: 'number', description: '순 베팅 금액' },
      activeDays: { type: 'number', description: '활동 일수' },
      lastActive: { type: 'timestamp', description: '마지막 활동 시간' },
      status: { type: 'string', description: '사용자 상태 (active, inactive)' },
      segment: { type: 'string', description: '사용자 세그먼트 분류' }
    },
    description: '고가치 사용자 분석 데이터를 저장하는 컬렉션',
    notes: '원본 데이터는 MariaDB에서 가져옴'
  },
  
  // 이벤트 컬렉션
  events: {
    fields: {
      id: { type: 'string', description: '이벤트 ID' },
      name: { type: 'string', description: '이벤트 이름' },
      description: { type: 'string', description: '이벤트 설명' },
      reward: { type: 'number', description: '이벤트 보상 금액' },
      startDate: { type: 'timestamp', description: '이벤트 시작 일시' },
      endDate: { type: 'timestamp', description: '이벤트 종료 일시' },
      status: { type: 'string', description: '이벤트 상태 (active, inactive, ended)' },
      targetSegment: { type: 'string', description: '대상 사용자 세그먼트' }
    },
    description: '마케팅 이벤트 정보를 저장하는 컬렉션'
  },
  
  // 이벤트 참여 컬렉션
  eventParticipants: {
    fields: {
      userId: { type: 'string', description: '사용자 ID' },
      eventId: { type: 'string', description: '이벤트 ID' },
      joinedAt: { type: 'timestamp', description: '참여 시간' },
      reward: { type: 'number', description: '지급된 보상' },
      status: { type: 'string', description: '참여 상태 (joined, rewarded, completed)' }
    },
    description: '이벤트 참여 정보를 저장하는 컬렉션'
  },
  
  // 분석 보고서 컬렉션
  analysisReports: {
    fields: {
      id: { type: 'string', description: '보고서 ID' },
      title: { type: 'string', description: '보고서 제목' },
      description: { type: 'string', description: '보고서 설명' },
      createdAt: { type: 'timestamp', description: '생성 시간' },
      createdBy: { type: 'string', description: '생성자 ID' },
      type: { type: 'string', description: '보고서 유형' },
      data: { type: 'map', description: '보고서 데이터' },
      status: { type: 'string', description: '보고서 상태' }
    },
    description: '분석 보고서 결과를 저장하는 컬렉션'
  },
  
  // 설정 컬렉션
  settings: {
    fields: {
      key: { type: 'string', description: '설정 키' },
      value: { type: 'any', description: '설정 값' },
      description: { type: 'string', description: '설정 설명' },
      lastUpdated: { type: 'timestamp', description: '마지막 업데이트 시간' },
      updatedBy: { type: 'string', description: '업데이트한 사용자' }
    },
    description: '시스템 설정을 저장하는 컬렉션'
  }
};

// 샘플 데이터 생성 함수
function generateSampleData(admin) {
  const sampleData = {};
  const now = admin.firestore.Timestamp.now();
  
  // 사용자 샘플 데이터
  sampleData.users = [
    {
      id: 'user1',
      userId: 'testuser1',
      name: '홍길동',
      email: 'user1@example.com',
      role: 'admin',
      status: 0,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)), // 60일 전
      lastLoginAt: now
    },
    {
      id: 'user2',
      userId: 'testuser2',
      name: '김철수',
      email: 'user2@example.com',
      role: 'user',
      status: 0,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)), // 45일 전
      lastLoginAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)) // 10일 전
    },
    {
      id: 'user3',
      userId: 'testuser3',
      name: '이영희',
      email: 'user3@example.com',
      role: 'user',
      status: 0,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)), // 30일 전
      lastLoginAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 25 * 24 * 60 * 60 * 1000)) // 25일 전
    }
  ];
  
  // 고가치 사용자 샘플 데이터
  sampleData.highValueUsers = [
    {
      userId: 'testuser1',
      totalBet: 5000000,
      totalDeposit: 3000000,
      netBet: 4500000,
      activeDays: 45,
      lastActive: now,
      status: 'active',
      segment: 'whale'
    },
    {
      userId: 'testuser2',
      totalBet: 2000000,
      totalDeposit: 1500000,
      netBet: 1800000,
      activeDays: 30,
      lastActive: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)), // 10일 전
      status: 'inactive',
      segment: 'medium-spender'
    },
    {
      userId: 'testuser3',
      totalBet: 8000000,
      totalDeposit: 5000000,
      netBet: 7500000,
      activeDays: 20,
      lastActive: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 25 * 24 * 60 * 60 * 1000)), // 25일 전
      status: 'inactive',
      segment: 'former-whale'
    }
  ];
  
  // 이벤트 샘플 데이터
  sampleData.events = [
    {
      id: 'event1',
      name: '신규 가입 보너스',
      description: '신규 가입자에게 제공되는 보너스',
      reward: 10000,
      startDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)), // 30일 전
      endDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), // 30일 후
      status: 'active',
      targetSegment: 'new-users'
    },
    {
      id: 'event2',
      name: '재방문 보너스',
      description: '30일 이상 접속하지 않은 사용자를 위한 보너스',
      reward: 5000,
      startDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)), // 15일 전
      endDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)), // 15일 후
      status: 'active',
      targetSegment: 'inactive-users'
    },
    {
      id: 'event3',
      name: 'VIP 특별 보너스',
      description: '고가치 사용자를 위한 특별 보너스',
      reward: 50000,
      startDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)), // 10일 전
      endDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)), // 20일 후
      status: 'active',
      targetSegment: 'whale'
    }
  ];
  
  // 이벤트 참여 샘플 데이터
  sampleData.eventParticipants = [
    {
      userId: 'testuser1',
      eventId: 'event3',
      joinedAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)), // 5일 전
      reward: 50000,
      status: 'rewarded'
    },
    {
      userId: 'testuser2',
      eventId: 'event2',
      joinedAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)), // 10일 전
      reward: 5000,
      status: 'rewarded'
    },
    {
      userId: 'testuser3',
      eventId: 'event2',
      joinedAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)), // 8일 전
      reward: 5000,
      status: 'joined'
    }
  ];
  
  // 분석 보고서 샘플 데이터
  sampleData.analysisReports = [
    {
      id: 'report1',
      title: '고가치 사용자 분석 보고서',
      description: '고가치 사용자의 활동 및 이벤트 참여 분석',
      createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)), // 5일 전
      createdBy: 'user1',
      type: 'high-value-users',
      data: {
        totalUsers: 3,
        activeUsers: 1,
        inactiveUsers: 2,
        totalBetting: 15000000,
        totalDeposit: 9500000,
        conversionRate: 0.33
      },
      status: 'completed'
    },
    {
      id: 'report2',
      title: '이벤트 효과 분석 보고서',
      description: '이벤트 참여 및 전환율 분석',
      createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)), // 3일 전
      createdBy: 'user1',
      type: 'event-effect',
      data: {
        totalEvents: 3,
        totalParticipants: 3,
        conversionRate: 0.67,
        totalReward: 60000
      },
      status: 'completed'
    }
  ];
  
  // 설정 샘플 데이터
  sampleData.settings = [
    {
      key: 'highValueUserThreshold',
      value: 1000000,
      description: '고가치 사용자로 분류되는 최소 베팅 금액',
      lastUpdated: now,
      updatedBy: 'user1'
    },
    {
      key: 'inactivityThreshold',
      value: 14,
      description: '비활성 사용자로 분류되는 최소 미활동 일수',
      lastUpdated: now,
      updatedBy: 'user1'
    },
    {
      key: 'eventRecommendationEnabled',
      value: true,
      description: '이벤트 추천 기능 활성화 여부',
      lastUpdated: now,
      updatedBy: 'user1'
    }
  ];
  
  return sampleData;
}

// 스키마 및 샘플 데이터 내보내기
module.exports = {
  dataSchema,
  generateSampleData
};
