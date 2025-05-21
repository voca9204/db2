/**
 * 고가치 사용자 분석 모듈
 * 
 * Firebase Functions에서 사용할 고가치 사용자 분석 관련 통합 모듈
 */

const { getSimplifiedHighValueUsers } = require('./simplified-query');
const { getPaginatedHighValueUsers } = require('./paginated-query');
const { getDetailedHighValueUserReport } = require('./detailed-report');
const { getHighValueUsersByNetBet } = require('./net-bet-query');

// 통합 모듈로 내보내기
module.exports = {
  getSimplifiedHighValueUsers,
  getPaginatedHighValueUsers,
  getDetailedHighValueUserReport,
  getHighValueUsersByNetBet,
};
