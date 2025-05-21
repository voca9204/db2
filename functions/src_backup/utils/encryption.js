/**
 * 암호화 유틸리티
 * 데이터베이스 자격 증명 및 민감한 데이터 보호
 */

const crypto = require('crypto');
const { getContextLogger } = require('./logger');

// 암호화 설정
const ALGORITHM = 'aes-256-gcm'; // GCM 모드 (인증 포함)
const KEY_LENGTH = 32; // 256 비트
const IV_LENGTH = 16; // 128 비트
const AUTH_TAG_LENGTH = 16; // 128 비트
const SALT_LENGTH = 64; // 솔트 길이

/**
 * 암호화 키 생성
 * 환경 변수 또는 시크릿 매니저에서 키 가져오기
 * 
 * @param {string} password 암호화 비밀번호
 * @param {string} salt 솔트 (선택적)
 * @return {Buffer} 암호화 키 버퍼
 */
const deriveKey = (password, salt = null) => {
  // 제공된 솔트가 없으면 새로 생성
  const usedSalt = salt ? Buffer.from(salt, 'hex') : crypto.randomBytes(SALT_LENGTH);
  
  // PBKDF2로 키 유도 (보안 강화)
  const key = crypto.pbkdf2Sync(password, usedSalt, 100000, KEY_LENGTH, 'sha256');
  
  return {
    key,
    salt: usedSalt.toString('hex')
  };
};

/**
 * 데이터 암호화
 * GCM 모드 사용 (인증 제공)
 * 
 * @param {string|object} data 암호화할 데이터
 * @param {string} password 암호화 비밀번호
 * @return {string} 암호화된 데이터 (솔트:iv:인증태그:암호문)
 */
const encrypt = (data, password = process.env.ENCRYPTION_KEY) => {
  if (!password) {
    throw new Error('Encryption key is required');
  }
  
  try {
    // 객체인 경우 문자열로 변환
    const dataString = typeof data === 'object' ? JSON.stringify(data) : String(data);
    
    // 암호화 키 생성
    const { key, salt } = deriveKey(password);
    
    // 초기화 벡터 생성
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // 암호화 수행 (GCM 모드)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(dataString, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // 인증 태그 가져오기
    const authTag = cipher.getAuthTag().toString('hex');
    
    // 솔트, IV, 인증 태그, 암호문 결합
    return `${salt}:${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error) {
    getContextLogger().error('Encryption failed:', error.message);
    throw new Error('Failed to encrypt data');
  }
};

/**
 * 데이터 복호화
 * 
 * @param {string} encryptedData 암호화된 데이터
 * @param {string} password 암호화 비밀번호
 * @param {boolean} parseJson JSON 파싱 여부
 * @return {string|object} 복호화된 데이터
 */
const decrypt = (encryptedData, password = process.env.ENCRYPTION_KEY, parseJson = false) => {
  if (!password) {
    throw new Error('Encryption key is required');
  }
  
  try {
    // 암호화된 데이터 파싱
    const [salt, ivHex, authTagHex, encrypted] = encryptedData.split(':');
    
    if (!salt || !ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid encrypted data format');
    }
    
    // 키 유도
    const { key } = deriveKey(password, salt);
    
    // 초기화 벡터와 인증 태그 복원
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    // 복호화 수행
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    // JSON 파싱 요청 시
    if (parseJson) {
      try {
        return JSON.parse(decrypted);
      } catch (jsonError) {
        getContextLogger().warn('Failed to parse decrypted data as JSON:', jsonError.message);
        return decrypted;
      }
    }
    
    return decrypted;
  } catch (error) {
    getContextLogger().error('Decryption failed:', error.message);
    throw new Error('Failed to decrypt data');
  }
};

/**
 * 데이터베이스 자격 증명 암호화
 * 
 * @param {Object} credentials 암호화할 자격 증명
 * @param {string} password 암호화 비밀번호
 * @return {string} 암호화된 자격 증명
 */
const encryptCredentials = (credentials, password = process.env.ENCRYPTION_KEY) => {
  return encrypt(credentials, password);
};

/**
 * 데이터베이스 자격 증명 복호화
 * 
 * @param {string} encryptedCredentials 암호화된 자격 증명
 * @param {string} password 암호화 비밀번호
 * @return {Object} 복호화된 자격 증명
 */
const decryptCredentials = (encryptedCredentials, password = process.env.ENCRYPTION_KEY) => {
  return decrypt(encryptedCredentials, password, true);
};

/**
 * 해시 생성 (단방향)
 * 
 * @param {string} data 해시 데이터
 * @param {string} algorithm 해시 알고리즘
 * @return {string} 해시값
 */
const createHash = (data, algorithm = 'sha256') => {
  return crypto.createHash(algorithm).update(data).digest('hex');
};

/**
 * HMAC 생성 (키 사용)
 * 
 * @param {string} data HMAC 데이터
 * @param {string} key HMAC 키
 * @param {string} algorithm HMAC 알고리즘
 * @return {string} HMAC 값
 */
const createHmac = (data, key = process.env.HMAC_KEY, algorithm = 'sha256') => {
  if (!key) {
    throw new Error('HMAC key is required');
  }
  
  return crypto.createHmac(algorithm, key).update(data).digest('hex');
};

module.exports = {
  encrypt,
  decrypt,
  encryptCredentials,
  decryptCredentials,
  createHash,
  createHmac
};
