# Firebase Functions API 아키텍처 설계

## 개요
이 문서는 고가치 사용자 분석 시스템의 Firebase Functions 기반 API 아키텍처 설계에 대한 내용을 담고 있습니다. 본 설계는 재사용성, 유지보수성, 확장성을 극대화하는 것을 목표로 합니다.

## 아키텍처 원칙
- **단일 책임 원칙(SRP)**: 각 모듈은 하나의 책임만 가져야 함
- **관심사 분리(Separation of Concerns)**: 서로 다른 기능은 분리된 모듈로 구현
- **DRY(Don't Repeat Yourself)**: 코드 중복 최소화
- **KISS(Keep It Simple, Stupid)**: 단순하고 이해하기 쉬운 설계 유지
- **확장성(Scalability)**: 새로운 기능을 쉽게 추가할 수 있는 구조
- **테스트 용이성(Testability)**: 각 모듈을 독립적으로 테스트할 수 있어야 함

## 디렉토리 구조
```
/functions
  /src
    /api
      /controllers     # 컨트롤러 (HTTP 요청/응답 처리)
      /services        # 비즈니스 로직
      /models          # 데이터 모델 및 유형 정의
      /routes          # API 라우팅
      /middlewares     # 미들웨어
      /validators      # 입력 유효성 검사
      /utils           # 유틸리티 함수
    /config            # 구성 설정
    /database          # 데이터베이스 연결 및 쿼리
    /jobs              # 스케줄링된 작업
    /middleware        # 전역 미들웨어
    /utils             # 전역 유틸리티
  /tests               # 테스트 코드
  index.js             # 진입점
```

## 계층 구조
1. **라우팅 계층(Routes)**: URL 경로와 HTTP 메서드 정의, 컨트롤러 연결
2. **컨트롤러 계층(Controllers)**: HTTP 요청 처리, 서비스 계층 호출, 응답 반환
3. **서비스 계층(Services)**: 비즈니스 로직 구현, 데이터 처리
4. **데이터 접근 계층(Database)**: 데이터베이스 쿼리 및 트랜잭션 처리

## 컴포넌트 설계

### 1. 기본 컨트롤러(BaseController)
모든 컨트롤러의 기본이 되는 추상 클래스로, 공통 기능을 제공합니다.

```javascript
class BaseController {
  constructor() {
    this.service = null;
  }
  
  // 비동기 핸들러 래핑 (오류 처리)
  asyncHandler(fn) {
    return async (req, res, next) => {
      try {
        await fn(req, res, next);
      } catch (error) {
        next(error);
      }
    };
  }
  
  // 성공 응답
  sendSuccess(res, data, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data
    });
  }
  
  // 페이지네이션 응답
  sendPaginated(res, data, page, limit, total, message = 'Success') {
    return res.status(200).json({
      success: true,
      message,
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  }
}
```

### 2. 쿼리 빌더(QueryBuilder)
SQL 쿼리를 동적으로 생성하는 유틸리티입니다.

```javascript
class QueryBuilder {
  constructor(baseQuery) {
    this.baseQuery = baseQuery;
    this.conditions = [];
    this.params = [];
    this.sorts = [];
    this.pagination = null;
  }
  
  where(condition, ...params) {
    this.conditions.push(condition);
    this.params.push(...params);
    return this;
  }
  
  orderBy(field, direction = 'ASC') {
    this.sorts.push(`${field} ${direction}`);
    return this;
  }
  
  limit(limit, offset) {
    this.pagination = { limit, offset };
    return this;
  }
  
  build() {
    let query = this.baseQuery;
    
    // WHERE 절 추가
    if (this.conditions.length > 0) {
      query += ' WHERE ' + this.conditions.join(' AND ');
    }
    
    // ORDER BY 절 추가
    if (this.sorts.length > 0) {
      query += ' ORDER BY ' + this.sorts.join(', ');
    }
    
    // LIMIT/OFFSET 절 추가
    if (this.pagination) {
      query += ` LIMIT ${this.pagination.limit} OFFSET ${this.pagination.offset}`;
    }
    
    return { query, params: this.params };
  }
  
  // 카운트 쿼리 생성
  buildCount() {
    // 기본 쿼리에서 SELECT 절을 COUNT 쿼리로 변경
    const countQuery = this.baseQuery.replace(/SELECT .* FROM/i, 'SELECT COUNT(*) as total FROM');
    
    let query = countQuery;
    
    // WHERE 절 추가
    if (this.conditions.length > 0) {
      query += ' WHERE ' + this.conditions.join(' AND ');
    }
    
    return { query, params: this.params };
  }
}
```

### 3. 검증 미들웨어(ValidationMiddleware)
요청 데이터의 유효성을 검사하는 미들웨어입니다.

```javascript
const createValidationMiddleware = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: error.details.map(detail => ({
          field: detail.context.key,
          message: detail.message
        }))
      });
    }
    
    // 유효성 검사를 통과한 값으로 요청 본문 교체
    req.body = value;
    next();
  };
};
```

### 4. 범용 쿼리 API(GenericQueryAPI)
다양한 필터링 및 정렬 옵션을 지원하는 범용 쿼리 API입니다.

```javascript
class GenericQueryController extends BaseController {
  constructor(service) {
    super();
    this.service = service;
  }
  
  // 범용 쿼리 처리 메서드
  query = this.asyncHandler(async (req, res) => {
    const { 
      filters = {}, 
      sort = {},
      page = 1, 
      limit = 20,
      fields = []
    } = req.body;
    
    const result = await this.service.query({
      filters,
      sort,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      fields
    });
    
    this.sendPaginated(
      res,
      result.data,
      result.page,
      result.limit,
      result.total,
      'Query executed successfully'
    );
  });
}
```

### 5. API 버전 관리(VersionedRoutes)
API 버전 관리를 위한 라우터 래퍼입니다.

```javascript
const express = require('express');

const createVersionedRouter = (version = 'v1') => {
  const router = express.Router();
  
  // API 버전 정보 미들웨어
  router.use((req, res, next) => {
    req.apiVersion = version;
    next();
  });
  
  return router;
};

// 사용 예:
// const v1Router = createVersionedRouter('v1');
// const v2Router = createVersionedRouter('v2');
// app.use('/api/v1', v1Router);
// app.use('/api/v2', v2Router);
```

## API 엔드포인트 설계

### 1. 핵심 API 엔드포인트
자주 사용되는 분석 기능을 위한 전용 엔드포인트입니다.

#### 고가치 사용자 분석 API
- `GET /api/v1/users/high-value/active` - 활성 고가치 사용자 조회
- `GET /api/v1/users/high-value/dormant` - 휴면 고가치 사용자 조회
- `GET /api/v1/users/high-value/segments` - 고가치 사용자 세그먼트 분석
- `GET /api/v1/users/high-value/:userId` - 특정 사용자 상세 정보 조회
- `GET /api/v1/users/high-value/reactivation/targets` - 재활성화 대상 사용자 추천

#### 이벤트 분석 API
- `GET /api/v1/events/effect` - 이벤트 효과 분석
- `GET /api/v1/events/participation` - 이벤트 참여 분석
- `GET /api/v1/events/conversion` - 이벤트 전환율 분석
- `GET /api/v1/events/:eventId/details` - 특정 이벤트 상세 분석

### 2. 범용 쿼리 API
다양한 필터링 옵션을 지원하는 유연한 쿼리 API입니다.

- `POST /api/v1/query/users` - 사용자 데이터 쿼리
- `POST /api/v1/query/events` - 이벤트 데이터 쿼리
- `POST /api/v1/query/logs` - 로그 데이터 쿼리
- `POST /api/v1/query/metrics` - 지표 데이터 쿼리

요청 본문 예시:
```json
{
  "filters": {
    "lastActivity": { "gte": "2025-01-01" },
    "netBet": { "gte": 50000 }
  },
  "sort": {
    "field": "netBet",
    "direction": "desc"
  },
  "page": 1,
  "limit": 20,
  "fields": ["userId", "userName", "netBet", "lastActivity"]
}
```

### 3. 분석 작업 API
분석 작업 요청 및 결과 관리를 위한 API입니다.

- `POST /api/v1/analytics/jobs` - 분석 작업 요청
- `GET /api/v1/analytics/jobs` - 분석 작업 목록 조회
- `GET /api/v1/analytics/jobs/:jobId` - 분석 작업 상태 조회
- `GET /api/v1/analytics/results/:resultId` - 분석 결과 조회

### 4. 대시보드 데이터 API
대시보드에서 필요한 데이터를 제공하는 API입니다.

- `GET /api/v1/dashboard/summary` - 주요 지표 요약
- `GET /api/v1/dashboard/charts/userSegments` - 사용자 세그먼트 차트 데이터
- `GET /api/v1/dashboard/charts/conversionRates` - 전환율 차트 데이터
- `GET /api/v1/dashboard/charts/eventEffects` - 이벤트 효과 차트 데이터

## 공통 유틸리티

### 1. 응답 포맷터(ResponseFormatter)
일관된 API 응답 형식을 제공하는 유틸리티입니다.

```javascript
const formatSuccess = (data, message = 'Success') => {
  return {
    success: true,
    message,
    data
  };
};

const formatError = (message = 'Error', errors = null, statusCode = 500) => {
  return {
    success: false,
    message,
    errors,
    statusCode
  };
};

const formatPaginated = (data, page, limit, total, message = 'Success') => {
  return {
    success: true,
    message,
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};
```

### 2. 데이터 필터링(DataFilters)
데이터 필터링 및 정렬을 위한 유틸리티입니다.

```javascript
const applyFilters = (data, filters) => {
  return data.filter(item => {
    return Object.entries(filters).every(([field, condition]) => {
      // 비교 연산 처리
      if (typeof condition === 'object') {
        return Object.entries(condition).every(([op, value]) => {
          switch (op) {
            case 'eq': return item[field] === value;
            case 'ne': return item[field] !== value;
            case 'gt': return item[field] > value;
            case 'gte': return item[field] >= value;
            case 'lt': return item[field] < value;
            case 'lte': return item[field] <= value;
            case 'in': return value.includes(item[field]);
            case 'nin': return !value.includes(item[field]);
            default: return true;
          }
        });
      }
      
      // 직접 비교
      return item[field] === condition;
    });
  });
};

const applySorting = (data, sort) => {
  const { field, direction = 'asc' } = sort;
  
  return [...data].sort((a, b) => {
    if (a[field] < b[field]) return direction === 'asc' ? -1 : 1;
    if (a[field] > b[field]) return direction === 'asc' ? 1 : -1;
    return 0;
  });
};

const applyPagination = (data, page, limit) => {
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  
  return {
    data: data.slice(startIndex, endIndex),
    total: data.length,
    page,
    limit
  };
};
```

### 3. 오류 처리(ErrorHandler)
일관된 오류 처리를 위한 유틸리티입니다.

```javascript
class AppError extends Error {
  constructor(message, statusCode, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true; // 운영상 오류 표시
  }
}

const catchAsync = fn => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  
  // 개발 환경에서는 상세 오류 정보 반환
  if (process.env.NODE_ENV === 'development') {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
      stack: err.stack,
      statusCode: err.statusCode
    });
  }
  
  // 프로덕션 환경에서는 민감한 정보 제외
  if (!err.isOperational) {
    return res.status(500).json({
      success: false,
      message: 'Something went wrong',
      statusCode: 500
    });
  }
  
  return res.status(err.statusCode).json({
    success: false,
    message: err.message,
    errors: err.errors,
    statusCode: err.statusCode
  });
};
```

## Firebase 통합 전략

### 1. Firebase Authentication 통합
사용자 인증을 위한 Firebase Authentication 통합 방법입니다.

```javascript
const admin = require('firebase-admin');

// 인증 미들웨어
const authenticate = async (req, res, next) => {
  try {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    
    if (!idToken) {
      throw new AppError('Unauthorized: No token provided', 401);
    }
    
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    next(new AppError('Unauthorized: Invalid token', 401));
  }
};

// 역할 기반 접근 제어 미들웨어
const authorize = (roles = []) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError('Unauthorized: User not authenticated', 401);
      }
      
      const userDoc = await admin.firestore().collection('users').doc(req.user.uid).get();
      
      if (!userDoc.exists) {
        throw new AppError('Unauthorized: User profile not found', 401);
      }
      
      const userData = userDoc.data();
      const userRoles = userData.roles || [];
      
      const hasPermission = roles.some(role => userRoles.includes(role));
      
      if (!hasPermission) {
        throw new AppError('Forbidden: Insufficient permissions', 403);
      }
      
      req.userProfile = userData;
      next();
    } catch (error) {
      next(error);
    }
  };
};
```

### 2. Firestore 데이터 접근 계층
Firestore 데이터 접근을 위한 계층입니다.

```javascript
class FirestoreRepository {
  constructor(collectionName) {
    this.collection = admin.firestore().collection(collectionName);
  }
  
  async findById(id) {
    const doc = await this.collection.doc(id).get();
    
    if (!doc.exists) {
      return null;
    }
    
    return {
      id: doc.id,
      ...doc.data()
    };
  }
  
  async find(filters = {}, sort = {}, limit = 20, page = 1) {
    let query = this.collection;
    
    // 필터 적용
    Object.entries(filters).forEach(([field, value]) => {
      query = query.where(field, '==', value);
    });
    
    // 정렬 적용
    if (sort.field) {
      query = query.orderBy(sort.field, sort.direction || 'asc');
    }
    
    // 페이지네이션 적용
    const startAt = (page - 1) * limit;
    query = query.offset(startAt).limit(limit);
    
    const snapshot = await query.get();
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // 총 문서 수 조회
    const countSnapshot = await this.collection.count().get();
    const total = countSnapshot.data().count;
    
    return {
      data,
      total,
      page,
      limit
    };
  }
  
  async create(data) {
    const docRef = await this.collection.add({
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    const doc = await docRef.get();
    
    return {
      id: doc.id,
      ...doc.data()
    };
  }
  
  async update(id, data) {
    await this.collection.doc(id).update({
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return this.findById(id);
  }
  
  async delete(id) {
    await this.collection.doc(id).delete();
    return { id };
  }
}
```

## 성능 최적화 전략

### 1. 캐싱 전략
자주 요청되는 데이터에 대한 캐싱 전략입니다.

```javascript
// 인메모리 캐시 (개발 및 소규모 배포용)
const memoryCache = new Map();

const cacheMiddleware = (key, ttl = 60 * 1000) => {
  return (req, res, next) => {
    // 캐시 키 생성
    const cacheKey = typeof key === 'function'
      ? key(req)
      : `${req.originalUrl || req.url}`;
    
    // 캐시된 데이터 확인
    const cachedData = memoryCache.get(cacheKey);
    
    if (cachedData && cachedData.expiresAt > Date.now()) {
      return res.json(cachedData.data);
    }
    
    // 원본 JSON 메서드 저장
    const originalJson = res.json;
    
    // JSON 메서드 재정의
    res.json = function(data) {
      // 캐시에 응답 저장
      memoryCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + ttl
      });
      
      // 원본 JSON 메서드 호출
      return originalJson.call(this, data);
    };
    
    next();
  };
};

// 프로덕션 환경에서는 Firestore 또는 Redis를 사용한 분산 캐싱으로 대체
```

### 2. 쿼리 최적화
데이터베이스 쿼리 최적화 전략입니다.

```javascript
// 쿼리 실행 시간 측정 및 로깅
const measureQueryTime = async (fn, query, params) => {
  const start = Date.now();
  try {
    return await fn(query, params);
  } finally {
    const duration = Date.now() - start;
    
    // 느린 쿼리 로깅 (100ms 이상)
    if (duration > 100) {
      console.warn(`Slow query (${duration}ms): ${query}`);
    }
  }
};

// 쿼리 결과 캐싱
const executeQueryWithCache = async (query, params, ttl = 60 * 1000) => {
  // 캐시 키 생성
  const cacheKey = `query:${query}:${JSON.stringify(params)}`;
  
  // 캐시된 결과 확인
  const cachedResult = memoryCache.get(cacheKey);
  
  if (cachedResult && cachedResult.expiresAt > Date.now()) {
    return cachedResult.data;
  }
  
  // 쿼리 실행
  const result = await executeQuery(query, params);
  
  // 결과 캐싱
  memoryCache.set(cacheKey, {
    data: result,
    expiresAt: Date.now() + ttl
  });
  
  return result;
};
```

## API 문서화
OpenAPI(Swagger) 명세를 사용한 API 문서화 방법입니다.

```javascript
// express-swagger-generator를 사용한 API 문서화
const expressSwagger = require('express-swagger-generator');

const options = {
  swaggerDefinition: {
    info: {
      description: 'High Value User Analytics API',
      title: 'DB2 API Documentation',
      version: '1.0.0',
    },
    host: 'localhost:5001',
    basePath: '/api/v1',
    produces: [
      'application/json'
    ],
    schemes: ['http', 'https'],
    securityDefinitions: {
      Bearer: {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization',
        description: 'Bearer token',
      }
    }
  },
  basedir: __dirname,
  files: ['./src/api/routes/**/*.js']
};

// API 문서화 적용
expressSwagger(app)(options);
```

## 구현 로드맵
1. 기본 구조 및 공통 컴포넌트 구현
2. 핵심 API 엔드포인트 구현
3. 범용 쿼리 API 구현
4. Firebase Authentication 통합
5. Firestore 데이터 접근 계층 구현
6. 캐싱 및 성능 최적화
7. API 문서화

## 예상 이점
- 코드 중복 최소화로 유지보수성 향상
- 일관된 API 응답 형식으로 클라이언트 연동 용이
- 모듈화된 구조로 테스트 용이성 확보
- 확장 가능한 설계로 새로운 기능 추가 편리
- 성능 최적화 전략으로 응답 시간 개선
- 문서화를 통한 개발자 경험 향상
