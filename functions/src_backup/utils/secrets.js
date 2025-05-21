/**
 * Firebase Secret Manager 유틸리티
 * 안전한 자격 증명 관리
 * 
 * 서버리스 환경에 최적화된 보안 강화 버전
 * - Google Cloud Secret Manager 지원 추가
 * - 자격 증명 암호화 및 캐싱 추가
 * - 로깅 및 오류 처리 개선
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { getContextLogger } = require('./logger');

// 메모리 내 캐시 (서버리스 콜드 스타트 최적화)
let credentialsCache = null;
let credentialsCacheExpiry = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15분

/**
 * Google Cloud Secret Manager에서 비밀값 로드
 * @param {string} secretName 비밀값 이름
 * @return {Promise<string>} 비밀값
 */
const getSecretFromSecretManager = async (secretName) => {
  const logger = getContextLogger();
  
  try {
    // Cloud Secret Manager 클라이언트 초기화
    const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
    const client = new SecretManagerServiceClient();
    
    // 프로젝트 ID 가져오기
    const projectId = process.env.GCLOUD_PROJECT || 
                      process.env.GCP_PROJECT || 
                      (await admin.app().options.credential.getProjectId());
    
    // 비밀값 경로 생성
    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    
    // 비밀값 액세스
    const [version] = await client.accessSecretVersion({ name });
    
    // 비밀값 내용 반환
    return version.payload.data.toString('utf8');
  } catch (error) {
    logger.warn(`Failed to get secret "${secretName}" from Secret Manager:`, error.message);
    return null;
  }
};

/**
 * 데이터베이스 연결 정보 가져오기
 * 우선순위:
 * 1. 메모리 캐시 (성능 최적화)
 * 2. Google Cloud Secret Manager (프로덕션)
 * 3. Firebase Config (스테이징)
 * 4. 환경 변수 (개발)
 * 5. 기본값 (폴백)
 * 
 * @param {string} environment 실행 환경 (production, staging, development)
 * @return {Object} 데이터베이스 연결 정보
 */
const getDatabaseCredentials = async (environment = process.env.NODE_ENV || 'development') => {
  const logger = getContextLogger();
  
  // 캐시 확인 (서버리스 환경의 콜드 스타트 최적화)
  const now = Date.now();
  if (credentialsCache && credentialsCacheExpiry > now) {
    logger.debug('Using cached database credentials');
    return credentialsCache;
  }
  
  // 캐시 만료 또는 미설정 시 새로 가져오기
  let dbConfig = null;
  
  // 프로덕션 환경에서는 Secret Manager 사용
  if (environment === 'production') {
    try {
      // Google Cloud Secret Manager에서 자격 증명 로드
      const dbJsonSecret = await getSecretFromSecretManager('db-credentials');
      
      if (dbJsonSecret) {
        try {
          dbConfig = JSON.parse(dbJsonSecret);
          if (dbConfig.host && dbConfig.user && dbConfig.password && dbConfig.database) {
            logger.info('Using database credentials from Google Cloud Secret Manager');
            
            // 캐시 설정
            credentialsCache = dbConfig;
            credentialsCacheExpiry = now + CACHE_TTL_MS;
            
            return dbConfig;
          }
        } catch (parseError) {
          logger.error('Failed to parse database credentials from Secret Manager:', parseError.message);
        }
      }
      
      // 개별 비밀값으로도 시도
      const [host, user, password, database] = await Promise.all([
        getSecretFromSecretManager('db-host'),
        getSecretFromSecretManager('db-user'),
        getSecretFromSecretManager('db-password'),
        getSecretFromSecretManager('db-name')
      ]);
      
      if (host && user && password && database) {
        dbConfig = { host, user, password, database };
        logger.info('Using individual database credentials from Google Cloud Secret Manager');
        
        // 캐시 설정
        credentialsCache = dbConfig;
        credentialsCacheExpiry = now + CACHE_TTL_MS;
        
        return dbConfig;
      }
    } catch (error) {
      logger.warn('Failed to get database credentials from Secret Manager:', error.message);
    }
  }
  
  // Firebase Config 사용 (프로덕션 및 스테이징)
  try {
    dbConfig = {
      host: functions.config().db?.host,
      user: functions.config().db?.user,
      password: functions.config().db?.password,
      database: functions.config().db?.name,
    };
    
    if (dbConfig.host && dbConfig.user && dbConfig.password && dbConfig.database) {
      logger.info('Using database credentials from Firebase Config');
      
      // 캐시 설정
      credentialsCache = dbConfig;
      credentialsCacheExpiry = now + CACHE_TTL_MS;
      
      return dbConfig;
    }
  } catch (error) {
    logger.warn('Failed to get database credentials from Firebase Config:', error.message);
  }
  
  // 개발 환경에서는 환경 변수 사용
  if (process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME) {
    logger.info('Using database credentials from environment variables');
    
    dbConfig = {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    };
    
    // 개발 환경에서도 짧은 TTL로 캐시 설정
    credentialsCache = dbConfig;
    credentialsCacheExpiry = now + (CACHE_TTL_MS / 3); // 5분
    
    return dbConfig;
  }
  
  // 기본값 (개발 환경용)
  logger.warn('Using default database credentials! This should only happen in development.');
  
  dbConfig = {
    host: '211.248.190.46',
    user: 'hermes',
    password: 'mcygicng!022',
    database: 'hermes',
  };
  
  // 캐시 설정 (짧은 TTL)
  credentialsCache = dbConfig;
  credentialsCacheExpiry = now + (CACHE_TTL_MS / 6); // 2.5분
  
  return dbConfig;
};

/**
 * 데이터베이스 자격 증명 암호화
 * 로컬 및 개발 환경에서 자격 증명 보호
 * 
 * @param {Object} credentials 암호화할 자격 증명
 * @param {string} key 암호화 키 (환경 변수에서 가져옴)
 * @return {string} 암호화된 자격 증명 문자열
 */
const encryptCredentials = (credentials, key = process.env.ENCRYPTION_KEY) => {
  if (!key) {
    return JSON.stringify(credentials);
  }
  
  try {
    // 암호화 키 및 초기화 벡터 생성
    const encKey = crypto.createHash('sha256').update(String(key)).digest('base64').substring(0, 32);
    const iv = crypto.randomBytes(16);
    
    // 암호화 처리
    const cipher = crypto.createCipheriv('aes-256-cbc', encKey, iv);
    let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // IV와 암호화된 데이터 결합
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    getContextLogger().error('Encryption failed:', error.message);
    return JSON.stringify(credentials);
  }
};

/**
 * 암호화된 데이터베이스 자격 증명 복호화
 * 
 * @param {string} encryptedText 암호화된 텍스트
 * @param {string} key 암호화 키 (환경 변수에서 가져옴)
 * @return {Object} 복호화된 자격 증명
 */
const decryptCredentials = (encryptedText, key = process.env.ENCRYPTION_KEY) => {
  if (!key || !encryptedText.includes(':')) {
    try {
      return JSON.parse(encryptedText);
    } catch (e) {
      return null;
    }
  }
  
  try {
    // 암호화 키 및 초기화 벡터 추출
    const encKey = crypto.createHash('sha256').update(String(key)).digest('base64').substring(0, 32);
    const textParts = encryptedText.split(':');
    const iv = Buffer.from(textParts[0], 'hex');
    
    // 복호화 처리
    const encryptedData = textParts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', encKey, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    getContextLogger().error('Decryption failed:', error.message);
    return null;
  }
};

/**
 * 민감한 정보가 제거된 데이터베이스 연결 정보 로깅용
 * @param {Object} credentials 데이터베이스 자격 증명
 * @return {Object} 비밀번호가 마스킹된 연결 정보
 */
const getSafeCredentials = (credentials) => {
  if (!credentials) return null;
  
  return {
    host: credentials.host,
    user: credentials.user,
    password: credentials.password ? '********' : null,
    database: credentials.database,
    // 연결 설정만 포함 (실제 비밀번호 제외)
    ssl: credentials.ssl,
    connectTimeout: credentials.connectTimeout,
    //connectionLimit, port 등 기타 구성 정보도 포함
  };
};

/**
 * 데이터베이스 자격 증명 저장 (로컬 캐시 또는 Firestore)
 * 
 * @param {Object} credentials 저장할 자격 증명
 * @param {string} environment 실행 환경
 * @return {Promise<boolean>} 성공 여부
 */
const storeCredentials = async (credentials, environment = process.env.NODE_ENV) => {
  // 프로덕션 환경에서는 저장하지 않음 (Google Secret Manager 사용)
  if (environment === 'production') {
    return false;
  }
  
  const logger = getContextLogger();
  
  try {
    // 개발 환경에서는 암호화하여 Firestore에 저장
    const encryptedCreds = encryptCredentials(credentials);
    
    // Firestore 저장
    await admin.firestore().collection('_system').doc('db_credentials').set({
      credentials: encryptedCreds,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      environment: environment
    });
    
    logger.info('Database credentials stored successfully');
    return true;
  } catch (error) {
    logger.warn('Failed to store database credentials:', error.message);
    return false;
  }
};

/**
 * Firestore에서 자격 증명 불러오기
 * 
 * @param {string} environment 실행 환경
 * @return {Promise<Object|null>} 자격 증명 또는 null
 */
const loadCredentialsFromFirestore = async (environment = process.env.NODE_ENV) => {
  const logger = getContextLogger();
  
  try {
    const doc = await admin.firestore().collection('_system').doc('db_credentials').get();
    
    if (doc.exists) {
      const data = doc.data();
      
      // 환경 확인
      if (data.environment !== environment) {
        logger.debug('Stored credentials are for a different environment');
        return null;
      }
      
      // 암호화된 자격 증명 복호화
      const credentials = decryptCredentials(data.credentials);
      
      if (credentials && credentials.host && credentials.user && credentials.password && credentials.database) {
        logger.info('Loaded database credentials from Firestore');
        return credentials;
      }
    }
    
    return null;
  } catch (error) {
    logger.warn('Failed to load database credentials from Firestore:', error.message);
    return null;
  }
};

/**
 * 모든 자격 증명 소스 확인
 * 서버리스 환경에 최적화된 버전
 */
const getCredentialsFromAllSources = async (environment = process.env.NODE_ENV) => {
  // 비동기 병렬 실행으로 최적화
  const [firestoreCreds, configCreds] = await Promise.allSettled([
    loadCredentialsFromFirestore(environment),
    getDatabaseCredentials(environment)
  ]);
  
  // 결과 선택
  if (firestoreCreds.status === 'fulfilled' && firestoreCreds.value) {
    return firestoreCreds.value;
  }
  
  if (configCreds.status === 'fulfilled' && configCreds.value) {
    return configCreds.value;
  }
  
  return null;
};

module.exports = {
  getDatabaseCredentials,
  getSafeCredentials,
  encryptCredentials,
  decryptCredentials,
  storeCredentials,
  loadCredentialsFromFirestore,
  getCredentialsFromAllSources
};
