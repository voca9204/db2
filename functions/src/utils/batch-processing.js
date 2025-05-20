/**
 * 대용량 데이터 처리 최적화 유틸리티
 * 서버리스 환경에서 메모리 및 시간 제약을 고려한 최적화 도구
 */

const { getContextLogger } = require('./logger');

/**
 * 페이지네이션을 통한 대용량 데이터 처리
 * @param {Function} processFn - 각 페이지를 처리하는 함수 (인자: page, limit, offset)
 * @param {Object} options - 옵션
 * @param {number} options.totalItems - 총 아이템 수
 * @param {number} options.pageSize - 페이지 크기 (기본값: 1000)
 * @param {number} options.concurrency - 동시 처리 수 (기본값: 3)
 * @param {boolean} options.returnResults - 결과 반환 여부 (기본값: true)
 * @return {Promise<Array>} 처리 결과 배열
 */
async function processInBatches(processFn, options = {}) {
  const logger = getContextLogger();
  const {
    totalItems,
    pageSize = 1000,
    concurrency = 3,
    returnResults = true
  } = options;
  
  // 페이지 수 계산
  const totalPages = Math.ceil(totalItems / pageSize);
  
  if (totalPages === 0) {
    logger.debug('No data to process');
    return [];
  }
  
  logger.debug(`Processing ${totalItems} items in ${totalPages} pages (pageSize: ${pageSize}, concurrency: ${concurrency})`);
  
  // 결과 저장 배열
  const results = returnResults ? [] : null;
  
  // 처리 함수
  const processPage = async (page) => {
    const offset = (page - 1) * pageSize;
    const limit = Math.min(pageSize, totalItems - offset);
    
    logger.debug(`Processing page ${page}/${totalPages} (offset: ${offset}, limit: ${limit})`);
    
    try {
      const result = await processFn(page, limit, offset);
      
      if (returnResults && result) {
        if (Array.isArray(result)) {
          results.push(...result);
        } else {
          results.push(result);
        }
      }
      
      logger.debug(`Completed page ${page}/${totalPages}`);
      return result;
    } catch (error) {
      logger.error(`Error processing page ${page}/${totalPages}:`, error);
      throw error;
    }
  };
  
  // 페이지 처리 (동시성 제한)
  for (let i = 0; i < totalPages; i += concurrency) {
    const pagePromises = [];
    
    for (let j = 0; j < concurrency && i + j < totalPages; j++) {
      pagePromises.push(processPage(i + j + 1));
    }
    
    await Promise.all(pagePromises);
  }
  
  return results;
}

/**
 * 메모리 사용량 모니터링
 * @return {Object} 메모리 사용량 정보
 */
function getMemoryUsage() {
  const memoryUsage = process.memoryUsage();
  
  return {
    rss: Math.round(memoryUsage.rss / 1024 / 1024), // RSS (Resident Set Size) in MB
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // Total heap size in MB
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // Used heap size in MB
    external: Math.round(memoryUsage.external / 1024 / 1024), // External memory in MB
    percentHeapUsed: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100) // Percentage of heap used
  };
}

/**
 * 쿼리 타임아웃 래퍼
 * @param {Function} queryFn - 실행할 쿼리 함수
 * @param {number} timeoutMs - 타임아웃 (밀리초)
 * @param {*} defaultValue - 타임아웃 시 반환할 기본값
 * @return {Promise<*>} 쿼리 결과 또는 기본값
 */
async function withTimeout(queryFn, timeoutMs = 25000, defaultValue = []) {
  const logger = getContextLogger();
  
  // 타임아웃 프로미스 생성
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Query timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  try {
    // 쿼리와 타임아웃 경쟁
    return await Promise.race([
      queryFn(),
      timeoutPromise
    ]);
  } catch (error) {
    logger.warn(`Query timeout or error: ${error.message}`);
    
    // 메모리 사용량 로깅
    const memoryUsage = getMemoryUsage();
    logger.warn(`Memory usage at timeout: ${JSON.stringify(memoryUsage)}`);
    
    return defaultValue;
  }
}

/**
 * 스트림 처리 유틸리티
 * 대용량 데이터를 하나의 결과셋으로 로드하지 않고 스트림으로 처리
 * @param {Function} queryFn - 페이지네이션 쿼리 함수 (인자: limit, offset)
 * @param {Function} processFn - 각 레코드 처리 함수
 * @param {Object} options - 옵션
 * @param {number} options.batchSize - 배치 크기 (기본값: 500)
 * @param {number} options.maxItems - 최대 아이템 수 (기본값: undefined)
 * @return {Promise<void>}
 */
async function processAsStream(queryFn, processFn, options = {}) {
  const logger = getContextLogger();
  const {
    batchSize = 500,
    maxItems = undefined
  } = options;
  
  let offset = 0;
  let processedItems = 0;
  let hasMoreItems = true;
  
  logger.debug(`Starting stream processing with batchSize: ${batchSize}${maxItems ? `, maxItems: ${maxItems}` : ''}`);
  
  // 메모리 사용량 모니터링
  const initialMemoryUsage = getMemoryUsage();
  logger.debug(`Initial memory usage: ${JSON.stringify(initialMemoryUsage)}`);
  
  // 스트림 처리 시작
  while (hasMoreItems && (!maxItems || processedItems < maxItems)) {
    const limit = maxItems ? Math.min(batchSize, maxItems - processedItems) : batchSize;
    
    try {
      const batch = await queryFn(limit, offset);
      
      if (!batch || batch.length === 0) {
        hasMoreItems = false;
        break;
      }
      
      // 각 레코드 처리
      for (const item of batch) {
        await processFn(item);
        processedItems++;
        
        if (maxItems && processedItems >= maxItems) {
          break;
        }
      }
      
      offset += batch.length;
      
      // 주기적 메모리 사용량 로깅 (10배치마다)
      if (offset % (batchSize * 10) === 0) {
        const currentMemoryUsage = getMemoryUsage();
        logger.debug(`Memory usage after ${offset} items: ${JSON.stringify(currentMemoryUsage)}`);
      }
    } catch (error) {
      logger.error(`Error in stream processing at offset ${offset}:`, error);
      throw error;
    }
  }
  
  const finalMemoryUsage = getMemoryUsage();
  logger.debug(`Final memory usage after processing ${processedItems} items: ${JSON.stringify(finalMemoryUsage)}`);
  
  return processedItems;
}

module.exports = {
  processInBatches,
  getMemoryUsage,
  withTimeout,
  processAsStream
};
