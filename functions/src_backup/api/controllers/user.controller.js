/**
 * 사용자 관리 컨트롤러
 * Firebase Authentication 및 Firestore를 사용한 사용자 관리
 */

const admin = require('firebase-admin');
const { getContextLogger } = require('../../utils/logger');
const { success, error } = require('../utils/response');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/error-handler');

/**
 * 사용자 목록 조회
 * @param {Request} req - Express 요청 객체
 * @param {Response} res - Express 응답 객체
 * @param {Function} next - 다음 미들웨어 함수
 */
const listUsers = async (req, res, next) => {
  const logger = getContextLogger();
  const { maxResults = 1000, pageToken } = req.query;
  
  try {
    // Firebase Auth에서 사용자 목록 조회
    const result = await admin.auth().listUsers(parseInt(maxResults), pageToken);
    
    // 사용자 목록에 Firestore의 역할 정보 추가
    const usersWithRoles = await addUserRoles(result.users);
    
    // 응답 반환
    res.json(success({
      users: usersWithRoles,
      pageToken: result.pageToken
    }, 'Users retrieved successfully'));
  } catch (err) {
    logger.error('Error listing users:', err);
    next(err);
  }
};

/**
 * 새 사용자 생성
 * @param {Request} req - Express 요청 객체
 * @param {Response} res - Express 응답 객체
 * @param {Function} next - 다음 미들웨어 함수
 */
const createUser = async (req, res, next) => {
  const logger = getContextLogger();
  const { email, password, displayName, roles = ['user'], disabled = false } = req.body;
  
  try {
    // 이메일 주소 중복 확인
    try {
      const existingUser = await admin.auth().getUserByEmail(email);
      if (existingUser) {
        throw new ConflictError(`User with email ${email} already exists`);
      }
    } catch (userNotFoundError) {
      // 사용자가 존재하지 않으면 정상 진행
      if (userNotFoundError.code !== 'auth/user-not-found') {
        throw userNotFoundError;
      }
    }
    
    // Firebase Auth에 사용자 생성
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName,
      disabled
    });
    
    // Firestore에 추가 사용자 정보 저장
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      email,
      displayName,
      roles,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    logger.info(`Created new user: ${email} (${userRecord.uid})`);
    
    // 응답 반환
    res.status(201).json(success({
      uid: userRecord.uid,
      email,
      displayName,
      roles,
      disabled
    }, 'User created successfully'));
  } catch (err) {
    logger.error('Error creating user:', err);
    
    // Firebase Auth 에러 처리
    if (err.code === 'auth/email-already-exists') {
      return next(new ConflictError('Email already in use'));
    } else if (err.code === 'auth/invalid-email') {
      return next(new ValidationError('Invalid email format'));
    } else if (err.code === 'auth/invalid-password') {
      return next(new ValidationError('Password must be at least 6 characters'));
    }
    
    next(err);
  }
};

/**
 * 사용자 정보 조회
 * @param {Request} req - Express 요청 객체
 * @param {Response} res - Express 응답 객체
 * @param {Function} next - 다음 미들웨어 함수
 */
const getUser = async (req, res, next) => {
  const logger = getContextLogger();
  const { uid } = req.params;
  
  try {
    // Firebase Auth에서 사용자 정보 조회
    const userRecord = await admin.auth().getUser(uid);
    
    // Firestore에서 추가 정보 조회
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    let userData = {};
    
    if (userDoc.exists) {
      userData = userDoc.data();
    }
    
    // 응답 반환
    res.json(success({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      disabled: userRecord.disabled,
      emailVerified: userRecord.emailVerified,
      metadata: {
        creationTime: userRecord.metadata.creationTime,
        lastSignInTime: userRecord.metadata.lastSignInTime
      },
      roles: userData.roles || ['user']
    }, 'User retrieved successfully'));
  } catch (err) {
    logger.error(`Error getting user ${uid}:`, err);
    
    if (err.code === 'auth/user-not-found') {
      return next(new NotFoundError(`User with ID ${uid} not found`));
    }
    
    next(err);
  }
};

/**
 * 사용자 정보 업데이트
 * @param {Request} req - Express 요청 객체
 * @param {Response} res - Express 응답 객체
 * @param {Function} next - 다음 미들웨어 함수
 */
const updateUser = async (req, res, next) => {
  const logger = getContextLogger();
  const { uid } = req.params;
  const { email, password, displayName, disabled, roles } = req.body;
  
  try {
    // Firebase Auth 업데이트 정보 준비
    const authUpdate = {};
    
    if (email !== undefined) authUpdate.email = email;
    if (password !== undefined) authUpdate.password = password;
    if (displayName !== undefined) authUpdate.displayName = displayName;
    if (disabled !== undefined) authUpdate.disabled = disabled;
    
    // Firebase Auth 사용자 정보 업데이트
    const userRecord = await admin.auth().updateUser(uid, authUpdate);
    
    // Firestore 업데이트 정보 준비
    const firestoreUpdate = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    if (email !== undefined) firestoreUpdate.email = email;
    if (displayName !== undefined) firestoreUpdate.displayName = displayName;
    if (roles !== undefined) firestoreUpdate.roles = roles;
    
    // Firestore 사용자 정보 업데이트
    await admin.firestore().collection('users').doc(uid).set(firestoreUpdate, { merge: true });
    
    logger.info(`Updated user: ${uid}`);
    
    // 변경된 사용자 정보 조회
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    let userData = {};
    
    if (userDoc.exists) {
      userData = userDoc.data();
    }
    
    // 응답 반환
    res.json(success({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      disabled: userRecord.disabled,
      roles: userData.roles || ['user']
    }, 'User updated successfully'));
  } catch (err) {
    logger.error(`Error updating user ${uid}:`, err);
    
    if (err.code === 'auth/user-not-found') {
      return next(new NotFoundError(`User with ID ${uid} not found`));
    } else if (err.code === 'auth/email-already-exists') {
      return next(new ConflictError('Email already in use'));
    } else if (err.code === 'auth/invalid-email') {
      return next(new ValidationError('Invalid email format'));
    } else if (err.code === 'auth/invalid-password') {
      return next(new ValidationError('Password must be at least 6 characters'));
    }
    
    next(err);
  }
};

/**
 * 사용자 삭제
 * @param {Request} req - Express 요청 객체
 * @param {Response} res - Express 응답 객체
 * @param {Function} next - 다음 미들웨어 함수
 */
const deleteUser = async (req, res, next) => {
  const logger = getContextLogger();
  const { uid } = req.params;
  
  try {
    // 요청한 사용자가 자신을 삭제하려는지 확인
    if (uid === req.user.uid) {
      return next(new ValidationError('Cannot delete your own account'));
    }
    
    // 사용자 존재 여부 확인
    try {
      await admin.auth().getUser(uid);
    } catch (userNotFoundError) {
      if (userNotFoundError.code === 'auth/user-not-found') {
        return next(new NotFoundError(`User with ID ${uid} not found`));
      }
      throw userNotFoundError;
    }
    
    // Firebase Auth에서 ��용자 삭제
    await admin.auth().deleteUser(uid);
    
    // Firestore에서 사용자 정보 삭제
    await admin.firestore().collection('users').doc(uid).delete();
    
    logger.info(`Deleted user: ${uid}`);
    
    // 응답 반환
    res.json(success(null, 'User deleted successfully'));
  } catch (err) {
    logger.error(`Error deleting user ${uid}:`, err);
    next(err);
  }
};

/**
 * 현재 인증된 사용자 정보 조회
 * @param {Request} req - Express 요청 객체
 * @param {Response} res - Express 응답 객체
 * @param {Function} next - 다음 미들웨어 함수
 */
const getCurrentUser = async (req, res, next) => {
  const logger = getContextLogger();
  
  try {
    // 인증된 사용자 확인
    if (!req.user) {
      return next(new NotFoundError('User not authenticated'));
    }
    
    const uid = req.user.uid;
    
    // Firebase Auth에서 사용자 정보 조회
    const userRecord = await admin.auth().getUser(uid);
    
    // Firestore에서 추가 정보 조회
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    let userData = {};
    
    if (userDoc.exists) {
      userData = userDoc.data();
    }
    
    // 응답 반환
    res.json(success({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      emailVerified: userRecord.emailVerified,
      roles: userData.roles || ['user'],
      metadata: {
        creationTime: userRecord.metadata.creationTime,
        lastSignInTime: userRecord.metadata.lastSignInTime
      }
    }, 'Current user retrieved successfully'));
  } catch (err) {
    logger.error('Error getting current user:', err);
    next(err);
  }
};

/**
 * 현재 인증된 사용자 정보 업데이트
 * @param {Request} req - Express 요청 객체
 * @param {Response} res - Express 응답 객체
 * @param {Function} next - 다음 미들웨어 함수
 */
const updateCurrentUser = async (req, res, next) => {
  const logger = getContextLogger();
  
  try {
    // 인증된 사용자 확인
    if (!req.user) {
      return next(new NotFoundError('User not authenticated'));
    }
    
    const uid = req.user.uid;
    const { displayName } = req.body;
    
    // Firebase Auth 업데이트 정보 준비
    const authUpdate = {};
    
    if (displayName !== undefined) authUpdate.displayName = displayName;
    
    // Firebase Auth 사용자 정보 업데이트
    const userRecord = await admin.auth().updateUser(uid, authUpdate);
    
    // Firestore 업데이트 정보 준비
    const firestoreUpdate = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    if (displayName !== undefined) firestoreUpdate.displayName = displayName;
    
    // Firestore 사용자 정보 업데이트
    await admin.firestore().collection('users').doc(uid).set(firestoreUpdate, { merge: true });
    
    logger.info(`User updated their profile: ${uid}`);
    
    // 변경된 사용자 정보 조회
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    let userData = {};
    
    if (userDoc.exists) {
      userData = userDoc.data();
    }
    
    // 응답 반환
    res.json(success({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      roles: userData.roles || ['user']
    }, 'Profile updated successfully'));
  } catch (err) {
    logger.error('Error updating current user:', err);
    next(err);
  }
};

/**
 * 사용자 목록에 Firestore의 역할 정보 추가
 * @param {Array} users - Firebase Auth 사용자 목록
 * @return {Promise<Array>} 역할 정보가 추가된 사용자 목록
 */
async function addUserRoles(users) {
  // Firestore에서 모든 사용자 역할 정보 일괄 조회
  const userRoles = {};
  const snapshot = await admin.firestore().collection('users').get();
  
  snapshot.forEach(doc => {
    const data = doc.data();
    userRoles[doc.id] = data.roles || ['user'];
  });
  
  // 사용자 정보에 역할 추가
  return users.map(user => ({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    disabled: user.disabled,
    emailVerified: user.emailVerified,
    metadata: {
      creationTime: user.metadata.creationTime,
      lastSignInTime: user.metadata.lastSignInTime
    },
    roles: userRoles[user.uid] || ['user']
  }));
}

module.exports = {
  listUsers,
  createUser,
  getUser,
  updateUser,
  deleteUser,
  getCurrentUser,
  updateCurrentUser
};
