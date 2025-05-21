Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
      }
      
      // 파라미터
      const inactiveDays = parseInt(req.query.days) || 30;
      const betThreshold = parseInt(req.query.betThreshold) || 1000000;
      const limit = parseInt(req.query.limit) || 5; // 각 카테고리별 결과 개수
      
      // 병렬로 모든 쿼리 실행
      console.log('[대시보드 분석] 병렬 쿼리 시작');
      const startTime = Date.now();
      
      const [
        highValueUsersResult,
        inactiveHighValueUsersResult,
        eventParticipantsResult,
        depositAfterEventResult
      ] = await Promise.all([
        getSimplifiedHighValueUsers(1, limit, betThreshold),
        getSimplifiedInactiveHighValueUsers(inactiveDays, 1, limit, betThreshold),
        getSimplifiedEventParticipants(1, limit),
        getSimplifiedDepositAfterEvent(1, limit)
      ]);
      
      const totalDuration = Date.now() - startTime;
      console.log(`[대시보드 분석] 병렬 쿼리 완료: ${totalDuration}ms`);
      
      // 쿼리 성공 확인
      if (!highValueUsersResult.success || 
          !inactiveHighValueUsersResult.success || 
          !eventParticipantsResult.success || 
          !depositAfterEventResult.success) {
        
        const errors = [];
        if (!highValueUsersResult.success) errors.push('고가치 사용자 쿼리 실패: ' + highValueUsersResult.error);
        if (!inactiveHighValueUsersResult.success) errors.push('비활성 고가치 사용자 쿼리 실패: ' + inactiveHighValueUsersResult.error);
        if (!eventParticipantsResult.success) errors.push('이벤트 참여 사용자 쿼리 실패: ' + eventParticipantsResult.error);
        if (!depositAfterEventResult.success) errors.push('이벤트 후 입금 사용자 쿼리 실패: ' + depositAfterEventResult.error);
        
        res.status(500).json({
          success: false,
          timestamp: new Date().toISOString(),
          errors
        });
        return;
      }
      
      // 통계 계산
      const highValueUsers = highValueUsersResult.data;
      const inactiveUsers = inactiveHighValueUsersResult.data;
      const eventParticipants = eventParticipantsResult.data;
      const depositAfterEvent = depositAfterEventResult.data;
      
      // 주요 통계
      const totalDepositsAfterEvent = depositAfterEvent.reduce(
        (sum, user) => sum + parseFloat(user.deposit_after_event), 0
      );
      
      const totalEventRewards = depositAfterEvent.reduce(
        (sum, user) => sum + parseFloat(user.total_event_reward), 0
      );
      
      const eventROI = totalEventRewards > 0 
        ? (totalDepositsAfterEvent / totalEventRewards).toFixed(2) 
        : 0;
      
      const conversionRate = eventParticipantsResult.pagination.totalCount > 0
        ? (depositAfterEventResult.pagination.totalCount / eventParticipantsResult.pagination.totalCount * 100).toFixed(2)
        : 0;
      
      // 응답 생성
      res.status(200).json({
        success: true,
        timestamp: new Date().toISOString(),
        performance: {
          totalDuration,
          highValueUsersDuration: highValueUsersResult.performance.duration,
          inactiveUsersDuration: inactiveHighValueUsersResult.performance.duration,
          eventParticipantsDuration: eventParticipantsResult.performance.duration,
          depositAfterEventDuration: depositAfterEventResult.performance.duration
        },
        stats: {
          totalHighValueUsers: highValueUsersResult.pagination.totalCount,
          totalInactiveHighValueUsers: inactiveHighValueUsersResult.pagination.totalCount,
          totalEventParticipants: eventParticipantsResult.pagination.totalCount,
          totalDepositAfterEvent: depositAfterEventResult.pagination.totalCount,
          totalDepositsAmount: Math.round(totalDepositsAfterEvent),
          totalEventRewards: Math.round(totalEventRewards),
          eventROI,
          conversionRate
        },
        data: {
          highValueUsers,
          inactiveUsers,
          eventParticipants,
          depositAfterEvent
        }
      });
    } catch (error) {
      console.error('[대시보드 분석] 함수 실행 오류:', error);
      res.status(500).json({
        success: false,
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });

// 모듈 내보내기
module.exports = {
  highValueUserAnalysis: exports.highValueUserAnalysis,
  inactiveHighValueUserAnalysis: exports.inactiveHighValueUserAnalysis,
  eventParticipantsAnalysis: exports.eventParticipantsAnalysis,
  depositAfterEventAnalysis: exports.depositAfterEventAnalysis,
  dashboardAnalysis: exports.dashboardAnalysis
};