/**
 * 고가치 사용자 종합 분석 보고서 API
 * 
 * 고가치 사용자에 대한 종합적인 분석 결과를 제공하는 API 엔드포인트입니다.
 * 기존 index.html에 있던 로직을 마이그레이션하여 Firebase Functions로 구현한 버전입니다.
 */

const functions = require('firebase-functions');
const mysql = require('mysql2/promise');
const cors = require('cors')({ origin: true });
const { getFirebaseApp } = require('./firebase/firebase-admin');

/**
 * 고가치 사용자 종합 분석 보고서 API
 * 
 * 세부 쿼리 및 분석을 수행하고 JSON 또는 HTML 형식으로 결과를 반환합니다.
 */
exports.highValueUserReport = functions
  .region('asia-northeast3')
  .https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      // Firebase 초기화
      getFirebaseApp();

      // 요청 파라미터 처리
      const minPlayDays = parseInt(req.query.minPlayDays || '7', 10);
      const minNetBet = parseInt(req.query.minNetBet || '50000', 10);
      const format = req.query.format || 'json'; // 'json' 또는 'html'
      const showDetails = req.query.details === 'true'; // 상세 분석 결과 포함 여부

      console.log(`[고가치 사용자 보고서] 요청 파라미터: minPlayDays=${minPlayDays}, minNetBet=${minNetBet}, format=${format}, showDetails=${showDetails}`);

      // 데이터베이스 연결
      const pool = getConnectionPool();
      const connection = await pool.getConnection();

      try {
        // 분석 실행
        const analysisResult = await analyzeHighValueUsers(connection, minPlayDays, minNetBet, showDetails);
        
        // 이벤트 효과 분석 추가
        analysisResult.eventEffects = await analyzeEventEffects(connection);
        
        // 결과 반환
        if (format === 'html') {
          res.set('Content-Type', 'text/html');
          res.send(generateHtmlReport(analysisResult));
        } else {
          res.set('Content-Type', 'application/json');
          res.json(analysisResult);
        }
      } finally {
        // 연결 반환
        connection.release();
      }
    } catch (error) {
      console.error('[고가치 사용자 보고서] 오류:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
});
