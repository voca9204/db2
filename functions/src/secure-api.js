/**
 * 보안이 적용된 API 엔드포인트
 * Firebase Authentication을 사용한 인증 및 권한 관리
 */

const functions = require('firebase-functions');
const cors = require('cors')({origin: true});
const admin = require('firebase-admin');
const { authenticate, authorize } = require('./middleware/auth');

// Firebase Admin SDK 초기화 (한 번만 실행)
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * 인증이 필요한 고가치 사용자 API
 */
exports.secureHighValueUsersApi = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      // 인증 미들웨어 적용
      await new Promise((resolve, reject) => {
        authenticate(req, res, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      // 권한 확인 미들웨어 적용
      await new Promise((resolve, reject) => {
        authorize(['admin', 'analyst'])(req, res, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      // 인증 성공 후 기존 로직 실행
      const mysql = require('mysql2/promise');
      const path = req.path;
      
      console.log('Authenticated API Path:', path);
      console.log('User:', req.user.uid, req.user.email);
      
      const connection = await mysql.createConnection({
        host: '211.248.190.46',
        user: 'hermes',
        password: 'mcygicng!022',
        database: 'hermes'
      });
      // 경로에 따른 쿼리 선택
      let query = '';
      let message = '';
      let criteria = {};
      
      if (path.includes('/active')) {
        query = `
          SELECT 
            userId,
            COUNT(DISTINCT gameDate) as gameDays,
            SUM(netBet) as totalNetBet,
            MAX(gameDate) as lastGameDate,
            DATEDIFF(CURDATE(), MAX(gameDate)) as daysSinceLastGame
          FROM game_scores 
          WHERE netBet > 0
          GROUP BY userId
          HAVING gameDays >= 7 AND totalNetBet > 50000 AND daysSinceLastGame <= 30
          ORDER BY totalNetBet DESC
          ${req.query.limit ? `LIMIT ${parseInt(req.query.limit)}` : 'LIMIT 100'}
        `;
        message = '활성 고가치 사용자 조회 완료 (인증됨)';
        criteria = { minGameDays: 7, minNetBet: 50000, maxDaysSinceLastGame: 30 };
        
      } else if (path.includes('/dormant')) {
        query = `
          SELECT 
            userId,
            COUNT(DISTINCT gameDate) as gameDays,
            SUM(netBet) as totalNetBet,
            MAX(gameDate) as lastGameDate,
            DATEDIFF(CURDATE(), MAX(gameDate)) as daysSinceLastGame
          FROM game_scores 
          WHERE netBet > 0
          GROUP BY userId
          HAVING gameDays >= 7 AND totalNetBet > 50000 AND daysSinceLastGame > 30
          ORDER BY totalNetBet DESC
          ${req.query.limit ? `LIMIT ${parseInt(req.query.limit)}` : 'LIMIT 100'}
        `;
        message = '휴면 고가치 사용자 조회 완료 (인증됨)';
        criteria = { minGameDays: 7, minNetBet: 50000, minDaysSinceLastGame: 30 };
        
      } else {
        query = `
          SELECT 
            userId,
            COUNT(DISTINCT gameDate) as gameDays,
            SUM(netBet) as totalNetBet,
            MAX(gameDate) as lastGameDate,
            DATEDIFF(CURDATE(), MAX(gameDate)) as daysSinceLastGame
          FROM game_scores 
          WHERE netBet > 0
          GROUP BY userId
          HAVING gameDays >= 7 AND totalNetBet > 50000
          ORDER BY totalNetBet DESC
          ${req.query.limit ? `LIMIT ${parseInt(req.query.limit)}` : 'LIMIT 100'}
        `;
        message = '전체 고가치 사용자 조회 완료 (인증됨)';
        criteria = { minGameDays: 7, minNetBet: 50000 };
      }

      const [rows] = await connection.execute(query);
      await connection.end();
      
      // 사용자 활동 로깅
      try {
        await admin.firestore().collection('user_activity_logs').add({
          userId: req.user.uid,
          userEmail: req.user.email,
          action: 'high_value_users_query',
          path: path,
          resultCount: rows.length,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (logError) {
        console.error('Activity logging error:', logError);
      }
      
      res.json({
        status: 'success',
        message: message,
        timestamp: new Date().toISOString(),
        count: rows.length,
        criteria: criteria,
        data: rows,
        user: { uid: req.user.uid, email: req.user.email },
        authenticated: true,
        success: true
      });
      
    } catch (error) {
      console.error('Secure API error:', error);
      
      if (error.name === 'UnauthorizedError' || error.message.includes('auth')) {
        res.status(401).json({
          status: 'error',
          message: 'Authentication required',
          timestamp: new Date().toISOString(),
          error: error.message,
          authenticated: false,
          success: false
        });
      } else if (error.name === 'ForbiddenError' || error.message.includes('permission')) {
        res.status(403).json({
          status: 'error',
          message: 'Insufficient permissions',
          timestamp: new Date().toISOString(),
          error: error.message,
          authenticated: true,
          success: false
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: '보안 API 실행 실패',
          timestamp: new Date().toISOString(),
          error: error.message,
          success: false
        });
      }
    }
  });
});
