/**
 * 데이터베이스 연결 테스트 함수
 * 
 * Hermes 데이터베이스 연결을 테스트하는 Firebase 함수입니다.
 */

const functions = require('firebase-functions');
const { testConnection } = require('./database/connection');

// 런타임 옵션 설정
const runtimeOpts = {
  timeoutSeconds: 30,
  memory: '256MB'
};

/**
 * 데이터베이스 연결 테스트 함수
 */
exports.dbConnectionTest = functions
  .runWith(runtimeOpts)
  .https.onRequest(async (req, res) => {
    // CORS 헤더 설정
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    
    // OPTIONS 요청 처리 (CORS preflight)
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    console.log('Database connection test function called');
    
    try {
      const result = await testConnection();
      
      if (result.connected) {
        console.log('Database connection test successful:', result);
        res.status(200).json({
          status: 'success',
          message: 'Database connection test successful',
          result: result,
          timestamp: new Date().toISOString()
        });
      } else {
        console.error('Database connection test failed:', result);
        res.status(500).json({
          status: 'error',
          message: 'Database connection test failed',
          error: result.error,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Unexpected error in database connection test:', error);
      res.status(500).json({
        status: 'error',
        message: 'Unexpected error in database connection test',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
