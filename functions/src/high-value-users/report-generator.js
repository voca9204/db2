/**
 * 고가치 사용자 분석 보고서 HTML 생성 모듈
 */

/**
 * HTML 보고서 생성 함수
 * @param {Object} data - 보고서 데이터
 * @returns {string} HTML 보고서
 */
exports.generateHtmlReport = function(data) {
  const { metadata, summary, users, user_segments, dormant_distribution, event_analysis, deposit_analysis } = data;
  
  // 사용자 테이블 HTML 생성
  let usersTableRows = '';
  users.forEach(user => {
    usersTableRows += `
      <tr>
        <td>${user.rank}</td>
        <td>${user.userId}</td>
        <td>${user.active_days}</td>
        <td>${user.total_betting.toLocaleString()}</td>
        <td>${user.last_activity_date || '-'}</td>
        <td>${user.days_since_last_activity}</td>
        <td><span class="tag tag-${user.status === 'active_recent' || user.status === 'active' ? 'active' : 'dormant'}">${user.status.replace('_', ' ')}</span></td>
      </tr>
    `;
  });
  
  // 휴면 기간별 분포 테이블 HTML 생성
  let dormantTableRows = '';
  let totalDormantUsers = 0;
  dormant_distribution.forEach(item => {
    dormantTableRows += `
      <tr>
        <td>${item.period}일</td>
        <td>${item.user_count}명</td>
        <td>${item.percentage}%</td>
      </tr>
    `;
    totalDormantUsers += item.user_count;
  });
  dormantTableRows += `
    <tr>
      <td><strong>총계</strong></td>
      <td><strong>${totalDormantUsers}명</strong></td>
      <td><strong>100%</strong></td>
    </tr>
  `;
  
  // 이벤트 분석 테이블 HTML 생성
  let eventAnalysisHtml = '';
  if (event_analysis) {
    let topParticipantsHtml = '';
    event_analysis.top_participants.forEach(user => {
      topParticipantsHtml += `
        <tr>
          <td>${user.userId}</td>
          <td>${user.event_count}</td>
          <td>${user.total_rewards.toLocaleString()}</td>
          <td>${user.days_since_last_event}</td>
          <td>${user.deposit_after_event.toLocaleString()}</td>
        </tr>
      `;
    });
    
    eventAnalysisHtml = `
      <div class="section">
        <h2>이벤트 참여 분석</h2>
        
        <div class="summary-stats">
          <div class="stat-card">
            <h3>이벤트 참여자 수</h3>
            <div class="stat-value">${event_analysis.participants_count}명</div>
            <div class="stat-sub">고가치 사용자 중</div>
          </div>
          <div class="stat-card">
            <h3>사용자당 평균 이벤트 수</h3>
            <div class="stat-value">${event_analysis.avg_events_per_user}</div>
            <div class="stat-sub">참여 횟수</div>
          </div>
          <div class="stat-card">
            <h3>총 이벤트 보상금</h3>
            <div class="stat-value">${event_analysis.total_rewards.toLocaleString()}원</div>
            <div class="stat-sub">전체 참여자</div>
          </div>
          <div class="stat-card">
            <h3>입금 전환율</h3>
            <div class="stat-value">${event_analysis.event_effectiveness.deposit_conversion_rate}%</div>
            <div class="stat-sub">이벤트 후 입금</div>
          </div>
        </div>
        
        <h3>상위 이벤트 참여자</h3>
        <table>
          <thead>
            <tr>
              <th>유저명</th>
              <th>이벤트 참여 횟수</th>
              <th>총 이벤트 보상금</th>
              <th>마지막 이벤트 경과일</th>
              <th>이벤트 후 입금액</th>
            </tr>
          </thead>
          <tbody>
            ${topParticipantsHtml}
          </tbody>
        </table>
        
        <div class="insights">
          <h3>이벤트 인사이트</h3>
          <ul>
            <li>이벤트 후 <strong>${event_analysis.event_effectiveness.deposit_conversion_rate}%의 사용자가 입금</strong>을 진행했으며, 평균 입금액은 <strong>${event_analysis.event_effectiveness.avg_deposit_after_event.toLocaleString()}원</strong>입니다.</li>
            <li>사용자당 평균 <strong>${event_analysis.avg_events_per_user}회</strong>의 이벤트에 참여했으며, 평균 <strong>${event_analysis.avg_reward_per_user.toLocaleString()}원</strong>의 보상을 받았습니다.</li>
            <li>이벤트 참여자들의 입금 금액 대비 보상금 비율은 <strong>${(event_analysis.total_rewards / event_analysis.event_effectiveness.avg_deposit_after_event / event_analysis.participants_count * 100).toFixed(1)}%</strong>로 효율적인 마케팅 투자 효과를 보여줍니다.</li>
          </ul>
        </div>
      </div>
    `;
  }
  
  // 입금 분석 테이블 HTML 생성
  let depositAnalysisHtml = '';
  if (deposit_analysis) {
    let topDepositorsHtml = '';
    deposit_analysis.top_depositors.forEach(user => {
      topDepositorsHtml += `
        <tr>
          <td>${user.userId}</td>
          <td>${user.deposit_count}</td>
          <td>${user.total_deposits.toLocaleString()}</td>
          <td>${user.avg_deposit.toLocaleString()}</td>
          <td>${user.max_deposit.toLocaleString()}</td>
          <td>${new Date(user.last_deposit_date).toISOString().split('T')[0]}</td>
        </tr>
      `;
    });
    
    depositAnalysisHtml = `
      <div class="section">
        <h2>입금 패턴 분석</h2>
        
        <div class="summary-stats">
          <div class="stat-card">
            <h3>입금자 수</h3>
            <div class="stat-value">${deposit_analysis.depositors_count}명</div>
            <div class="stat-sub">고가치 사용자 중</div>
          </div>
          <div class="stat-card">
            <h3>총 입금액</h3>
            <div class="stat-value">${deposit_analysis.total_deposits.toLocaleString()}원</div>
            <div class="stat-sub">분석 기간 내</div>
          </div>
          <div class="stat-card">
            <h3>평균 입금 빈도</h3>
            <div class="stat-value">${deposit_analysis.deposit_patterns.avg_deposit_frequency}회</div>
            <div class="stat-sub">사용자당</div>
          </div>
          <div class="stat-card">
            <h3>베팅/입금 비율</h3>
            <div class="stat-value">${deposit_analysis.deposit_patterns.deposit_to_betting_ratio}x</div>
            <div class="stat-sub">입금 대비 베팅</div>
          </div>
        </div>
        
        <h3>상위 입금자</h3>
        <table>
          <thead>
            <tr>
              <th>유저명</th>
              <th>입금 횟수</th>
              <th>총 입금액</th>
              <th>평균 입금액</th>
              <th>최대 입금액</th>
              <th>마지막 입금일</th>
            </tr>
          </thead>
          <tbody>
            ${topDepositorsHtml}
          </tbody>
        </table>
        
        <div class="insights">
          <h3>입금 인사이트</h3>
          <ul>
            <li>고가치 사용자들은 평균적으로 <strong>${deposit_analysis.deposit_patterns.avg_deposit_frequency}회</strong> 입금하며, 1회 평균 입금액은 <strong>${deposit_analysis.avg_deposit_amount.toLocaleString()}원</strong>입니다.</li>
            <li>입금액 대비 베팅 비율은 <strong>${deposit_analysis.deposit_patterns.deposit_to_betting_ratio}배</strong>로, 입금한 금액의 ${deposit_analysis.deposit_patterns.deposit_to_betting_ratio}배를 베팅하는 패턴을 보입니다.</li>
            <li>최고 입금액 기록은 <strong>${deposit_analysis.max_deposit.toLocaleString()}원</strong>이며, 상위 입금자들은 꾸준한 입금 패턴을 보이고 있습니다.</li>
          </ul>
        </div>
      </div>
    `;
  }
  
  // HTML 템플릿 생성
  return `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>고가치 ��용자 분석 보고서</title>
    <style>
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        
        header {
            background-color: #2c3e50;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 8px;
            margin-bottom: 30px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        
        h1, h2, h3 {
            color: #2c3e50;
        }
        
        header h1 {
            color: white;
            margin: 0;
        }
        
        header p {
            margin: 10px 0 0;
            color: #ecf0f1;
            font-size: 1.1em;
        }
        
        .section {
            background-color: #fff;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .section h2 {
            margin-top: 0;
            border-left: 4px solid #3498db;
            padding-left: 10px;
            margin-bottom: 20px;
        }
        
        .summary-stats {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            margin-bottom: 20px;
        }
        
        .stat-card {
            flex: 1 1 200px;
            background-color: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
            margin: 0 10px 15px 0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            text-align: center;
        }
        
        .stat-card h3 {
            margin: 0 0 10px;
            font-size: 1em;
            color: #6c757d;
            font-weight: 600;
        }
        
        .stat-value {
            font-size: 1.8em;
            font-weight: 700;
            color: #3498db;
            margin-bottom: 5px;
        }
        
        .stat-sub {
            font-size: 0.9em;
            color: #6c757d;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        
        table th, table td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #e9ecef;
        }
        
        table th {
            background-color: #f8f9fa;
            font-weight: 600;
            color: #495057;
        }
        
        table tbody tr:hover {
            background-color: #f1f8ff;
        }
        
        .comparison-table {
            margin-top: 20px;
        }
        
        .comparison-table th, .comparison-table td {
            text-align: center;
        }
        
        .comparison-table th:first-child, .comparison-table td:first-child {
            text-align: left;
        }
        
        .tag {
            display: inline-block;
            padding: 3px 8px;
            margin-right: 5px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: 500;
        }
        
        .tag-active {
            background-color: rgba(40, 167, 69, 0.1);
            color: #28a745;
            border: 1px solid rgba(40, 167, 69, 0.2);
        }
        
        .tag-dormant {
            background-color: rgba(220, 53, 69, 0.1);
            color: #dc3545;
            border: 1px solid rgba(220, 53, 69, 0.2);
        }
        
        .insights {
            background-color: #f8f9fa;
            border-left: 4px solid #3498db;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 4px 4px 0;
        }
        
        .insights h3 {
            margin-top: 0;
            color: #3498db;
        }
        
        .recommendations {
            background-color: #f0f9ff;
            border-left: 4px solid #28a745;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 4px 4px 0;
        }
        
        .recommendations h3 {
            margin-top: 0;
            color: #28a745;
        }
        
        .recommendations ul, .insights ul {
            padding-left: 20px;
            margin-bottom: 0;
        }
        
        .recommendations li, .insights li {
            margin-bottom: 8px;
        }
        
        .recommendations li:last-child, .insights li:last-child {
            margin-bottom: 0;
        }
        
        .search-filter {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .search-filter input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #ced4da;
            border-radius: 4px;
            font-size: 0.9em;
        }
        
        .search-filter select {
            margin-left: 10px;
            padding: 8px 12px;
            border: 1px solid #ced4da;
            border-radius: 4px;
            font-size: 0.9em;
        }
        
        .pagination {
            display: flex;
            justify-content: center;
            margin: 20px 0;
        }
        
        .pagination-btn {
            padding: 5px 10px;
            margin: 0 5px;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            cursor: pointer;
            background-color: #fff;
            color: #3498db;
        }
        
        .pagination-btn:hover, .pagination-btn.active {
            background-color: #3498db;
            color: #fff;
            border-color: #3498db;
        }
        
        footer {
            margin-top: 40px;
            text-align: center;
            font-size: 0.9em;
            color: #7f8c8d;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }
    </style>
</head>
<body>
    <header>
        <h1>고가치 사용자 분석 보고서</h1>
        <p>${metadata.parameters.days}일 이상 게임 기록 및 유효배팅 ${metadata.parameters.minBetting.toLocaleString()}원 이상 사용자 분석</p>
        <p>분석일: ${new Date(metadata.generated_at).toISOString().split('T')[0].replace(/-/g, '년 ').replace(/년 /, '년 ').replace(/년$/, '일')}</p>
    </header>
    
    <div class="section">
        <h2>분석 개요</h2>
        <p>본 보고서는 다음 조건을 만족하는 고가치 사용자에 대한 분석 결과입니다:</p>
        <ul>
            <li>최근 ${metadata.parameters.days}일 이내에 게임 기록이 있는 사용자</li>
            <li>전체 베팅 금액이 ${metadata.parameters.minBetting.toLocaleString()}원 이상인 사용자</li>
        </ul>
        
        <div class="summary-stats">
            <div class="stat-card">
                <h3>총 고가치 사용자 수</h3>
                <div class="stat-value">${summary.totalUsers}명</div>
                <div class="stat-sub">모든 활성 및 휴면 사용자</div>
            </div>
            <div class="stat-card">
                <h3>활성 사용자 비율</h3>
                <div class="stat-value">${summary.activePercentage}%</div>
                <div class="stat-sub">${summary.activeUsers}명 (최근 30일 내 활동)</div>
            </div>
            <div class="stat-card">
                <h3>휴면 사용자 비율</h3>
                <div class="stat-value">${summary.dormantPercentage}%</div>
                <div class="stat-sub">${summary.dormantUsers}명 (30일 이상 미활동)</div>
            </div>
            <div class="stat-card">
                <h3>평균 플레이 일수</h3>
                <div class="stat-value">${summary.avgPlayDays}일</div>
                <div class="stat-sub">전체 사용자 기준</div>
            </div>
        </div>
    </div>
    
    <div class="section">
        <h2>사용자 세그먼트 분석</h2>
        
        <table class="comparison-table">
            <thead>
                <tr>
                    <th>세그먼트</th>
                    <th>사용자 수</th>
                    <th>비율</th>
                    <th>평균 베팅 금액</th>
                    <th>평균 입금액</th>
                    <th>평균 활동 일수</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>최근 활성 (7일 이내)</td>
                    <td>${user_segments.active_recent.count}명</td>
                    <td>${user_segments.active_recent.percentage}%</td>
                    <td>${user_segments.active_recent.avg_betting.toLocaleString()}원</td>
                    <td>${user_segments.active_recent.avg_deposits.toLocaleString()}원</td>
                    <td>${user_segments.active_recent.avg_active_days}일</td>
                </tr>
                <tr>
                    <td>활성 (8-30일)</td>
                    <td>${user_segments.active.count}명</td>
                    <td>${user_segments.active.percentage}%</td>
                    <td>${user_segments.active.avg_betting.toLocaleString()}원</td>
                    <td>${user_segments.active.avg_deposits.toLocaleString()}원</td>
                    <td>${user_segments.active.avg_active_days}일</td>
                </tr>
                <tr>
                    <td>최근 휴면 (31-90일)</td>
                    <td>${user_segments.inactive_recent.count}명</td>
                    <td>${user_segments.inactive_recent.percentage}%</td>
                    <td>${user_segments.inactive_recent.avg_betting.toLocaleString()}원</td>
                    <td>${user_segments.inactive_recent.avg_deposits.toLocaleString()}원</td>
                    <td>${user_segments.inactive_recent.avg_active_days}일</td>
                </tr>
                <tr>
                    <td>장기 휴면 (90일 이상)</td>
                    <td>${user_segments.inactive_long.count}명</td>
                    <td>${user_segments.inactive_long.percentage}%</td>
                    <td>${user_segments.inactive_long.avg_betting.toLocaleString()}원</td>
                    <td>${user_segments.inactive_long.avg_deposits.toLocaleString()}원</td>
                    <td>${user_segments.inactive_long.avg_active_days}일</td>
                </tr>
            </tbody>
        </table>
        
        <div class="insights">
            <h3>주요 인사이트</h3>
            <ul>
                <li>고가치 사용자 중 <strong>${user_segments.active_recent.percentage}%만이 최근 7일 이내에 활동</strong>하고 있어, 많은 사용자가 활동성이 감소하고 있습니다.</li>
                <li><strong>최근 휴면 사용자(31-90일)는 ${user_segments.inactive_recent.percentage}%</strong>로, 이들은 적절한 재활성화 캠페인을 통해 쉽게 복귀할 수 있는 가능성이 높습니다.</li>
                <li>장기 휴면 사용자들도 평균 <strong>${user_segments.inactive_long.avg_betting.toLocaleString()}원</strong>의 높은 베팅 금액을 보였으며, 이는 이들의 가치가 여전히 높음을 나타냅니다.</li>
                <li>활성 사용자의 평균 입금액(${user_segments.active_recent.avg_deposits.toLocaleString()}원)은 휴면 사용자(${user_segments.inactive_long.avg_deposits.toLocaleString()}원)보다 <strong>${(user_segments.active_recent.avg_deposits / user_segments.inactive_long.avg_deposits * 100).toFixed(1)}% 높음</strong>을 보여줍니다.</li>
            </ul>
        </div>
    </div>
    
    <div class="section">
        <h2>고가치 사용자 목록 (전체 ${users.length}명)</h2>
        
        <div class="search-filter">
            <input type="text" id="userSearchInput" placeholder="유저명으로 검색...">
            <select id="statusFilter">
                <option value="all">모든 상태</option>
                <option value="active">활성 사용자</option>
                <option value="inactive">휴면 사용자</option>
            </select>
        </div>
        
        <table id="usersTable">
            <thead>
                <tr>
                    <th>순위</th>
                    <th>유저명</th>
                    <th>플레이 일수</th>
                    <th>총 베팅</th>
                    <th>마지막 플레이</th>
                    <th>경과일수</th>
                    <th>상태</th>
                </tr>
            </thead>
            <tbody>
                ${usersTableRows}
            </tbody>
        </table>
        
        <div id="tablePagination" class="pagination">
            <!-- 페이지네이션은 JavaScript로 생성됩니다 -->
        </div>
    </div>
    
    <div class="section">
        <h2>휴면 기간별 사용자 분포</h2>
        
        <table>
            <thead>
                <tr>
                    <th>휴면 기간</th>
                    <th>사용자 수</th>
                    <th>비율</th>
                </tr>
            </thead>
            <tbody>
                ${dormantTableRows}
            </tbody>
        </table>
        
        <div class="insights">
            <h3>휴면 사용자 인사이트</h3>
            <ul>
                <li>휴면 고가치 사용자 중 <strong>${dormant_distribution.find(item => item.period === '365+')?.percentage || '0'}%가 1년 이상</strong> 미활동 상태로, 장기 휴면 사용자의 비율이 높습니다.</li>
                <li><strong>단기 휴면 사용자(31-90일)</strong>는 ${
                  (parseFloat(dormant_distribution.find(item => item.period === '31-60')?.percentage || '0') + 
                   parseFloat(dormant_distribution.find(item => item.period === '61-90')?.percentage || '0')).toFixed(1)
                }%(${
                  (dormant_distribution.find(item => item.period === '31-60')?.user_count || 0) + 
                  (dormant_distribution.find(item => item.period === '61-90')?.user_count || 0)
                }명)로, 이들은 적절한 캠페인을 통해 상대적으로 쉽게 재활성화할 수 있는 타겟 그룹입니다.</li>
                <li>상위 10위 내 고가치 사용자 중 <strong>${
                  users.filter((user, index) => index < 10 && user.status.includes('inactive')).length
                }명이 휴면 상태</strong>로, 이는 상당한 매출 기회 손실을 의미합니다.</li>
            </ul>
        </div>
    </div>
    
    ${eventAnalysisHtml}
    
    ${depositAnalysisHtml}
    
    <div class="section">
        <h2>권장 전략</h2>
        
        <div class="recommendations">
            <h3>활성 고가치 사용자 유지 전략</h3>
            <ul>
                <li><strong>맞춤형 VIP 프로그램</strong>: 개인화된 보상 및 혜택, 전담 VIP 매니저 배정, 고급 서비스 및 특별 이벤트 초대</li>
                <li><strong>계층적 충성도 프로그램</strong>: 활동 수준에 따른 등급 시스템, 등급별 차별화된 혜택, 상위 등급 달성 시 상당한 보상</li>
                <li><strong>활동 예측 및 예방</strong>: 활동 패턴 모니터링, 활동 감소 시 즉각적인 개입, 유지율 높은 게임 및 이벤트 추천</li>
            </ul>
        </div>
        
        <div class="recommendations">
            <h3>휴면 고가치 사용자 재활성화 전략</h3>
            <ul>
                <li><strong>세그먼트별 맞춤형 전략</strong>:
                    <ul>
                        <li>단기 휴면(31-90일): 즉각적인 복귀 인센티브 (${
                          (dormant_distribution.find(item => item.period === '31-60')?.user_count || 0) + 
                          (dormant_distribution.find(item => item.period === '61-90')?.user_count || 0)
                        }명 타겟)</li>
                        <li>중기 휴면(91-365일): 단계적 재참여 유도 (${
                          (dormant_distribution.find(item => item.period === '91-180')?.user_count || 0) + 
                          (dormant_distribution.find(item => item.period === '181-365')?.user_count || 0)
                        }명 타겟)</li>
                        <li>장기 휴면(365일+): 강력한 복귀 패키지 (${
                          dormant_distribution.find(item => item.period === '365+')?.user_count || 0
                        }명 타겟)</li>
                    </ul>
                </li>
                <li><strong>상위 휴면 사용자 집중 관리</strong>: 상위 100명에 대한 개별화된 접근, 직접적인 연락 및 특별 제안, 복귀 시 과거 상태 복원 및 추가 혜택</li>
                <li><strong>이탈 원인 분석 및 개선</strong>: 게임별/이벤트별 이탈률 분석, 경쟁사 모니터링 및 비교 분석, 사용자 경험 및 서비스 개선</li>
            </ul>
        </div>
    </div>
    
    <div class="section">
        <h2>실행 계획</h2>
        
        <h3>즉시 실행 항목 (1-4주)</h3>
        <ol>
            <li>핵심 세그먼트 정의 및 자동화된 모니터링 시스템 구축</li>
            <li>상위 100명의 휴면 고가치 사용자 대상 개인화된 재활성화 캠페인 시작</li>
            <li>활성 고가치 사용자 대상 VIP 프로그램 강화</li>
        </ol>
        
        <h3>중기 실행 항목 (1-3개월)</h3>
        <ol>
            <li>활동 패턴 예측 모델 개발 및 이탈 방지 시스템 구축</li>
            <li>모든 휴면 고가치 사용자 대상 세그먼트별 재활성화 캠페인 진행</li>
            <li>고가치 사용자별 게임 선호도 분석 및 맞춤형 게임 추천 시스템 구현</li>
        </ol>
        
        <h3>장기 실행 항목 (3-6개월)</h3>
        <ol>
            <li>사용자 유지 및 재활성화 캠페인 효과 분석 및 최적화</li>
            <li>잠재적 고가치 사용자 조기 식별 및 육성 전략 구현</li>
            <li>고객 생애 가치(CLV) 최적화를 위한 통합 관리 시스템 구축</li>
        </ol>
    </div>
    
    <footer>
        <p>© 2025 DB2 프로젝트 팀 | 보고서 생성 시간: ${new Date(metadata.generated_at).toISOString()} | 실행 시간: ${metadata.execution_time_ms}ms</p>
        <p><a href="/">메인 대시보드로 돌아가기</a></p>
    </footer>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            // 사용자 테이블 필터링 및 검색 기능
            const searchInput = document.getElementById('userSearchInput');
            const statusFilter = document.getElementById('statusFilter');
            const table = document.getElementById('usersTable');
            const tableRows = Array.from(table.querySelectorAll('tbody tr'));
            
            // 페이지네이션 설정
            const rowsPerPage = 20;
            let currentPage = 1;
            const paginationContainer = document.getElementById('tablePagination');
            
            // 검색 및 필터링 함수
            function filterTable() {
                const searchTerm = searchInput.value.toLowerCase();
                const statusValue = statusFilter.value;
                
                const filteredRows = tableRows.filter(row => {
                    const username = row.cells[1].textContent.toLowerCase();
                    const statusText = row.querySelector('.tag').textContent.toLowerCase();
                    const status = statusText.includes('active') ? 'active' : 'inactive';
                    
                    const matchesSearch = username.includes(searchTerm);
                    const matchesStatus = statusValue === 'all' || status === statusValue;
                    
                    return matchesSearch && matchesStatus;
                });
                
                // 테이블 초기화
                const tbody = table.querySelector('tbody');
                tbody.innerHTML = '';
                
                // 페이지네이션 설정
                const totalPages = Math.ceil(filteredRows.length / rowsPerPage);
                if (currentPage > totalPages) {
                    currentPage = 1;
                }
                
                // 현재 페이지에 표시할 행 계산
                const startIdx = (currentPage - 1) * rowsPerPage;
                const endIdx = Math.min(startIdx + rowsPerPage, filteredRows.length);
                
                // 행 추가
                for (let i = startIdx; i < endIdx; i++) {
                    tbody.appendChild(filteredRows[i].cloneNode(true));
                }
                
                // 페이지네이션 업데이트
                updatePagination(totalPages, filteredRows.length);
            }
            
            // 페이지네이션 업데이트 함수
            function updatePagination(totalPages, totalItems) {
                paginationContainer.innerHTML = '';
                
                // 표시 정보 추가
                const infoSpan = document.createElement('span');
                infoSpan.textContent = \`총 \${totalItems}명 중 \${Math.min(rowsPerPage, totalItems)}명 표시 (페이지 \${currentPage}/\${totalPages || 1})\`;
                infoSpan.style.marginRight = '10px';
                paginationContainer.appendChild(infoSpan);
                
                // 처음 페이지 버튼
                const firstPageBtn = document.createElement('span');
                firstPageBtn.textContent = '<<';
                firstPageBtn.className = 'pagination-btn' + (currentPage === 1 ? ' disabled' : '');
                firstPageBtn.addEventListener('click', () => {
                    if (currentPage !== 1) {
                        currentPage = 1;
                        filterTable();
                    }
                });
                paginationContainer.appendChild(firstPageBtn);
                
                // 이전 페이지 버튼
                const prevPageBtn = document.createElement('span');
                prevPageBtn.textContent = '<';
                prevPageBtn.className = 'pagination-btn' + (currentPage === 1 ? ' disabled' : '');
                prevPageBtn.addEventListener('click', () => {
                    if (currentPage > 1) {
                        currentPage--;
                        filterTable();
                    }
                });
                paginationContainer.appendChild(prevPageBtn);
                
                // 페이지 번호 버튼
                const maxPageBtns = 5;
                const startPage = Math.max(1, currentPage - Math.floor(maxPageBtns / 2));
                const endPage = Math.min(totalPages, startPage + maxPageBtns - 1);
                
                for (let i = startPage; i <= endPage; i++) {
                    const pageBtn = document.createElement('span');
                    pageBtn.textContent = i;
                    pageBtn.className = 'pagination-btn' + (i === currentPage ? ' active' : '');
                    pageBtn.addEventListener('click', () => {
                        currentPage = i;
                        filterTable();
                    });
                    paginationContainer.appendChild(pageBtn);
                }
                
                // 다음 페이지 버튼
                const nextPageBtn = document.createElement('span');
                nextPageBtn.textContent = '>';
                nextPageBtn.className = 'pagination-btn' + (currentPage === totalPages || totalPages === 0 ? ' disabled' : '');
                nextPageBtn.addEventListener('click', () => {
                    if (currentPage < totalPages) {
                        currentPage++;
                        filterTable();
                    }
                });
                paginationContainer.appendChild(nextPageBtn);
                
                // 마지막 페이지 버튼
                const lastPageBtn = document.createElement('span');
                lastPageBtn.textContent = '>>';
                lastPageBtn.className = 'pagination-btn' + (currentPage === totalPages || totalPages === 0 ? ' disabled' : '');
                lastPageBtn.addEventListener('click', () => {
                    if (currentPage !== totalPages && totalPages !== 0) {
                        currentPage = totalPages;
                        filterTable();
                    }
                });
                paginationContainer.appendChild(lastPageBtn);
            }
            
            // 이벤트 리스너 설정
            searchInput.addEventListener('input', filterTable);
            statusFilter.addEventListener('change', filterTable);
            
            // 초기 테이블 필터링 실행
            filterTable();
        });
    </script>
</body>
</html>
  `;
};
