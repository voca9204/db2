# 재사용 가능한 Firebase Functions API 아키텍처 설계

## 1. 아키텍처 개요

이 문서는 `db2` 프로젝트의 Firebase Functions 기반 API 아키텍처를 정의합니다. 이 아키텍처는 다양한 분석 요구사항을 유연하게 처리할 수 있는 재사용 가능한 구조를 제공합니다.

### 1.1 설계 원칙

- **단일 책임 원칙(SRP)**: 각 모듈은 하나의 책임만을 가집니다.
- **관심사 분리(SoC)**: UI, 비즈니스 로직, 데이터 접근 계층을 분리합니다.
- **재사용성**: 공통 함수와 유틸리티를 분리하여 코드 중복을 최소화합니다.
- **확장성**: 새로운 기능 추가가 기존 코드를 크게 변경하지 않도록 합니다.
- **보안**: 인증, 권한 부여, 데이터 유효성 검사를 기본으로 적용합니다.
- **성능**: 서버리스 환경에 최적화된 패턴을 사용합니다.
- **테스트 용이성**: 모든 컴포넌트가 테스트 가능한 구조로 설계합니다.

## 2. 계층화된 아키텍처

API 아키텍처는 다음과 같은 계층으로 구성됩니다:

```
[클라이언트] ↔ [라우터] ↔ [컨트롤러] ↔ [서비스] ↔ [데이터 접근 계층] ↔ [데이터베이스]
```

### 2.1 계층별 역할

1. **라우터 계층 (Router Layer)**
   - HTTP 엔드포인트 정의
   - 요청 라우팅
   - 기본 미들웨어 적용 (CORS, 바디 파싱 등)

2. **컨트롤러 계층 (Controller Layer)**
   - 요청 데이터 검증
   - 응답 형식 정의
   - 오류 처리
   - 응답 코드 관리

3. **서비스 계층 (Service Layer)**
   - 비즈니스 로직 구현
   - 트랜잭션 관리
   - 데이터 접근 계층 조율

4. **데이터 접근 계층 (Data Access Layer)**
   - 데이터베이스 쿼리 실행
   - 데이터 변환 (DTO 매핑)
   - 데이터 캐싱

5. **공통 유틸리티 계층 (Shared Utilities)**
   - 로깅
   - 오류 처리
   - 인증 및 권한 부여
   - 유효성 검사
   - 데이터 변환

## 3. 모듈 구조

### 3.1 기본 디렉토리 구조

```
src/
├── api/
│   ├── controllers/
│   │   ├── base.controller.js
│   │   ├── high-value-user.controller.js
│   │   └── ...
│   ├── routes/
│   │   ├── index.js
│   │   ├── high-value-user.routes.js
│   │   └── ...
│   ├── services/
│   │   ├── base.service.js
│   │   ├── high-value-user.service.js
│   │   └── ...
│   ├── models/
│   │   ├── base.model.js
│   │   ├── user.model.js
│   │   └── ...
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   ├── validation.middleware.js
│   │   └── ...
│   ├── validators/
│   │   ├── high-value-user.validator.js
│   │   └── ...
│   └── utils/
│       ├── response.js
│       ├── query-builder.js
│       └── ...
├── database/
│   ├── repositories/
│   │   ├── base.repository.js
│   │   ├── user.repository.js
│   │   └── ...
│   └── entities/
│       ├── user.entity.js
│       └── ...
├── common/
│   ├── constants/
│   │   ├── error-codes.js
│   │   └── ...
│   ├── enums/
│   │   ├── user-status.enum.js
│   │   └── ...
│   └── types/
│       ├── index.d.ts
│       └── ...
└── utils/
    ├── logger.js
    ├── errors.js
    ├── encryption.js
    └── ...
```

## 4. 핵심 컴포넌트

### 4.1 기본 클래스 (Base Classes)

모든 컨트롤러, 서비스, 리포지토리는 기본 클래스를 상속받아 공통 기능을 재사용합니다.

#### 4.1.1 BaseController

```javascript
class BaseController {
  constructor(service) {
    this.service = service;
    this.logger = getContextLogger();
  }

  asyncHandler(fn) {
    return async (req, res, next) => {
      try {
        await fn(req, res, next);
      } catch (error) {
        next(error);
      }
    };
  }

  sendSuccess(res, data, message = 'Success', statusCode = 200) { ... }
  sendPaginated(res, data, page, limit, total, message = 'Success') { ... }
  sendError(res, message = 'Error', statusCode = 500, errors = null) { ... }
  validateSchema(schema, data) { ... }
}
```

#### 4.1.2 BaseService

```javascript
class BaseService {
  constructor(repositoryName, columnMapping = {}) {
    this.repository = new BaseRepository(repositoryName, columnMapping);
    this.logger = getContextLogger();
  }

  async getById(id, options = {}) { ... }
  async getAll(options = {}) { ... }
  async create(data, options = {}) { ... }
  async update(id, data, options = {}) { ... }
  async delete(id, options = {}) { ... }
}
```

#### 4.1.3 BaseRepository

```javascript
class BaseRepository {
  constructor(tableName, columnMapping = {}) {
    this.tableName = tableName;
    this.columnMapping = columnMapping;
    this.logger = getContextLogger();
  }

  async findById(id, options = {}) { ... }
  async findAll(options = {}) { ... }
  async create(data, options = {}) { ... }
  async update(id, data, options = {}) { ... }
  async delete(id, options = {}) { ... }
}
```

### 4.2 유틸리티 클래스

#### 4.2.1 QueryBuilder

동적 SQL 쿼리 생성을 위한 빌더 패턴 구현:

```javascript
class QueryBuilder {
  constructor(baseQuery) {
    this.baseQuery = baseQuery;
    this.conditions = [];
    this.orderClauses = [];
    this.limitValue = null;
    this.offsetValue = null;
    this.params = [];
  }

  where(condition, ...params) { ... }
  andWhere(condition, ...params) { ... }
  orWhere(condition, ...params) { ... }
  orderBy(column, direction = 'ASC') { ... }
  limit(limit, offset = 0) { ... }
  build() { ... }
  buildCount() { ... }
}
```

#### 4.2.2 ResponseWrapper

일관된 API 응답 포맷을 제공하는 래퍼:

```javascript
class ResponseWrapper {
  static success(data = null, message = 'Success', meta = {}) { ... }
  static error(message = 'Error', statusCode = 500, errors = []) { ... }
  static paginated(data, pagination, message = 'Success') { ... }
}
```

### 4.3 미들웨어

#### 4.3.1 인증 미들웨어

```javascript
const authenticate = async (req, res, next) => { ... }
const authorize = (roles = []) => async (req, res, next) => { ... }
```

#### 4.3.2 유효성 검사 미들웨어

```javascript
const validateQuery = (schema) => (req, res, next) => { ... }
const validateBody = (schema) => (req, res, next) => { ... }
const validateParams = (schema) => (req, res, next) => { ... }
```

#### 4.3.3 오류 처리 미들웨어

```javascript
const errorHandler = (err, req, res, next) => { ... }
const notFoundHandler = (req, res, next) => { ... }
```

## 5. 재사용 가능한 패턴

### 5.1 공통 쿼리 파라미터 처리

모든 리스트 API에 적용 가능한 공통 쿼리 파라미터:

```javascript
const commonQuerySchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  sortBy: Joi.string().default('id'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});
```

### 5.2 데이터 필터링 및 정렬

```javascript
const buildFilterConditions = (filters, columnMapping) => { ... }
const applySorting = (query, sortBy, sortOrder, columnMapping) => { ... }
```

### 5.3.3 페이지네이션

```javascript
const applyPagination = (query, page, limit) => { ... }
const createPaginationInfo = (total, page, limit) => { ... }
```

## 6. 버전 관리 전략

API 버전 관리를 위한 미들웨어:

```javascript
const createVersionedRouter = (version) => {
  const router = express.Router();
  
  // 버전별 로깅 및 모니터링
  router.use((req, res, next) => {
    req.apiVersion = version;
    next();
  });
  
  return router;
};
```

## 7. 데이터 접근 계층 (DAL) 구현

### 7.1 리포지토리 패턴

```javascript
// MariaDB 리포지토리
class MariaDBRepository extends BaseRepository { ... }

// Firestore 리포지토리
class FirestoreRepository extends BaseRepository { ... }
```

### 7.2 캐싱 전략

```javascript
const withCache = (fn, key, ttl = 300) => async (...args) => { ... }
```

## 8. 오류 처리 전략

### 8.1 사용자 정의 오류 클래스

```javascript
class ApiError extends Error {
  constructor(message, statusCode = 500, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

class ValidationError extends ApiError {
  constructor(message = 'Validation failed', errors = []) {
    super(message, 400, errors);
  }
}
```

## 9. 로깅 및 모니터링

### 9.1 컨텍스트 기반 로깅

```javascript
const getContextLogger = () => {
  const traceId = asyncHooks.executionAsyncId();
  return createLogger(traceId);
};
```

## 10. 배포 및 환경 설정

### 10.1 환경별 설정

개발, 스테이징, 프로덕션 환경에 따른 설정 분리:

```javascript
const getEnvironmentConfig = (env = process.env.NODE_ENV) => {
  const configs = {
    development: { ... },
    staging: { ... },
    production: { ... }
  };
  
  return configs[env] || configs.development;
};
```

## 11. 결론

이 아키텍처 설계는 고가치 사용자 분석 API를 위한 재사용 가능하고 확장 가능한 프레임워크를 제공합니다. 모듈화된 구조, 계층화된 설계, 재사용 가능한 컴포넌트를 통해 코드 중복을 최소화하고 새로운 기능을 쉽게 추가할 수 있습니다.

특히 사용자 행동 분석, 이벤트 효과 분석, 재활성화 전략과 같은 다양한 분석 요구사항에 효과적으로 대응할 수 있는 유연한 구조를 제공합니다.
