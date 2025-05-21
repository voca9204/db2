/**
 * 테스트용 Hello 함수
 */

const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });

// 2세대 Cloud Functions 설정
const runtimeOpts = {
  memory: '256MB',
  timeoutSeconds: 60,
};

/**
 * Test Hello 함수
 */
exports.testHello = functions
  .runWith(runtimeOpts)
  .https.onRequest((req, res) => {
    cors(req, res, () => {
      console.log('Test Hello 함수 호출됨');
      
      res.status(200).json({
        success: true,
        message: 'Test Hello!',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        query: req.query
      });
    });
  });