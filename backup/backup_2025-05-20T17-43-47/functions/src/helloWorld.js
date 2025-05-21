/**
 * 간단한 Hello World 함수
 * 
 * 데이터베이스 연결이나 다른 복잡한 로직 없이 간단하게 응답을 반환합니다.
 */

const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });

// 2세대 Cloud Functions 설정
const runtimeOpts = {
  memory: '256MB',
  timeoutSeconds: 60,
};

/**
 * Hello World 함수
 */
exports.helloWorld = functions
  .runWith(runtimeOpts)
  .https.onRequest((req, res) => {
    cors(req, res, () => {
      console.log('Hello World 함수 호출됨');
      
      res.status(200).json({
        success: true,
        message: 'Hello World!',
        timestamp: new Date().toISOString(),
        query: req.query
      });
    });
  });
