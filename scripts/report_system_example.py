"""
보고서 시스템 사용 예제

이 스크립트는 보고서 시스템의 기본 사용법을 보여줍니다.
종합분석보고서와 질의 보고서 생성, 태그 지정, 검색, 내보내기 등의 기능을 시연합니다.
"""

import os
import sys
import logging
from datetime import datetime

# 로깅 설정
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("report_example")

# 프로젝트 경로를 Python 경로에 추가
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from src.reports import (
    ReportType, QueryReportTag, 
    init_report_manager, get_report_manager,
    ReportFormatter, ReportExporter
)

def main():
    """
    보고서 시스템 사용 예제 메인 함수
    """
    # 보고서 관리자 초기화
    reports_dir = os.path.join(project_root, "reports")
    init_report_manager(reports_dir)
    report_manager = get_report_manager()
    
    # 1. 종합분석보고서 생성
    comprehensive_content = """
# 휴면 사용자 분석 및 재활성화 전략

## 1. 휴면 사용자 현황

지난 6개월간 휴면 상태로 전환된 사용자는 총 45,632명으로, 전체 사용자의 약 23.5%를 차지하고 있습니다.
주요 휴면 원인은 다음과 같습니다:

- 게임 콘텐츠 소진: 38%
- 경쟁 게임으로 이탈: 27%
- 사용자 불만: 15%
- 기타 외부 요인: 20%

## 2. 재활성화 이벤트 효과 분석

최근 3회 실시한 재활성화 이벤트의 효과는 아래와 같습니다:

| 이벤트명 | 참여율 | 복귀율 | 입금전환율 |
|---------|-------|--------|-----------|
| 귀환 용사 보상 | 14.3% | 8.7% | 3.2% |
| 여름 방학 특별 패키지 | 23.1% | 12.5% | 5.8% |
| 고대 유물 발굴단 | 18.6% | 10.2% | 4.5% |

## 3. 세그먼트별 분석

휴면 기간에 따른 세그먼트별 특성을 분석한 결과:

1. 단기 휴면 (1-3개월): 콘텐츠 소진이 주된 이유, 보상형 이벤트에 높은 반응
2. 중기 휴면 (3-6개월): 경쟁 게임 유입이 주된 이유, 신규 콘텐츠 및 사회적 인센티브에 반응
3. 장기 휴면 (6개월 이상): 게임에 대한 관심 상실, 강력한 경제적 인센티브에만 반응

## 4. 권장 전략

데이터 분석 결과, 다음과 같은 재활성화 전략을 권장합니다:

1. 세그먼트별 차별화된 캠페인 전개
2. 휴면 기간에 따른 단계적 보상 설계
3. 사회적 인센티브와 경제적 인센티브의 결합
4. 신규 콘텐츠 체험 기회 제공
5. 복귀 사용자 전용 커뮤니티 활성화

## 5. 기대 효과

제안된 전략을 통해 다음과 같은 효과를 기대할 수 있습니다:

- 휴면 사용자 복귀율: 현재 대비 35% 증가
- 복귀 사용자 유지율: 45일 기준 40% 달성
- 복귀 사용자 입금 전환율: 현재 대비 25% 증가
"""
    
    comprehensive_id = report_manager.create_report(
        report_type=ReportType.COMPREHENSIVE,
        name="휴면 사용자 분석 및 재활성화 전략",
        description="휴면 사용자 패턴 분석과 효과적인 재활성화 전략 제안",
        content=comprehensive_content,
        tags=["dormant", "reactivation", "strategy"]
    )
    
    logger.info(f"종합분석보고서 생성됨: {comprehensive_id}")
    
    # 2. 질의 보고서 생성 (이벤트 태그)
    event_query_content = """
# 이벤트 참여율 및 수익성 분석

## 쿼리 목적
본 질의는 최근 6개월간 진행된 주요 이벤트의 참여율과 수익성을 분석하기 위한 것입니다.

## SQL 쿼리
```sql
SELECT 
    e.event_id,
    e.event_name,
    e.start_date,
    e.end_date,
    COUNT(DISTINCT ep.user_id) AS participants,
    COUNT(DISTINCT p.user_id) AS paying_users,
    SUM(p.amount) AS total_revenue,
    SUM(p.amount) / COUNT(DISTINCT ep.user_id) AS arpu
FROM 
    events e
    LEFT JOIN event_participants ep ON e.event_id = ep.event_id
    LEFT JOIN payments p ON ep.user_id = p.user_id AND p.payment_date BETWEEN e.start_date AND DATE_ADD(e.end_date, INTERVAL 7 DAY)
WHERE 
    e.start_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)
GROUP BY 
    e.event_id, e.event_name, e.start_date, e.end_date
ORDER BY 
    e.start_date DESC;
```

## 분석 결과

| 이벤트명 | 기간 | 참여자 수 | 결제자 수 | 총 매출 | ARPU |
|---------|------|-----------|----------|---------|------|
| 여름 방학 특별 이벤트 | 2025-06-15 ~ 2025-07-15 | 28,475 | 3,216 | ₩97,482,000 | ₩3,423 |
| 신규 영웅 출시 기념 | 2025-05-01 ~ 2025-05-15 | 32,891 | 4,127 | ₩124,563,000 | ₩3,787 |
| 봄맞이 복귀 축제 | 2025-03-10 ~ 2025-04-10 | 45,632 | 5,874 | ₩176,392,000 | ₩3,866 |
| 발렌타인 이벤트 | 2025-02-10 ~ 2025-02-20 | 31,247 | 3,857 | ₩104,729,000 | ₩3,351 |
| 설날 특별 이벤트 | 2025-01-20 ~ 2025-02-05 | 37,892 | 4,562 | ₩147,621,000 | ₩3,896 |

## 핵심 인사이트

1. 봄맞이 복귀 축제가 가장 높은 참여자 수와 매출을 기록했으며, 이는 이벤트 기간(30일)이 길었던 점과 휴면 사용자 타겟팅이 효과적이었기 때문으로 분석됨

2. 설날 특별 이벤트가 ARPU 기준으로 가장 효율적이었으며, 한정판 아이템 판매 전략이 주효했던 것으로 판단됨

3. 이벤트 기간과 총 매출 사이에는 양의 상관관계(r=0.82)가 존재하나, ARPU와는 유의미한 상관관계가 발견되지 않음

## 권장 사항

1. 장기 이벤트(30일 이상)와 단기 이벤트(15일 이하)를 목적에 따라 구분하여 운영
2. 휴면 사용자 타겟팅 이벤트는 최소 3주 이상으로 계획
3. 한정판 아이템과 같은 희소성 기반 전략을 ARPU 극대화에 활용
"""
    
    event_query_id = report_manager.create_report(
        report_type=ReportType.QUERY,
        name="이벤트 참여율 및 수익성 분석",
        description="최근 6개월간 진행된 이벤트의 참여율과 수익성 비교 분석",
        content=event_query_content,
        tags=["event", "revenue", "participation"]
    )
    
    logger.info(f"이벤트 질의 보고서 생성됨: {event_query_id}")
    
    # 3. 질의 보고서 생성 (휴면 사용자 태그)
    dormant_query_content = """
# 휴면 사용자 세그먼트 분석

## 쿼리 목적
본 질의는 휴면 상태로 전환된 사용자들의 특성과 행동 패턴을 세그먼트별로 분석하기 위한 것입니다.

## SQL 쿼리
```sql
WITH inactive_users AS (
    SELECT 
        u.user_id,
        u.reg_date,
        u.last_login_date,
        DATEDIFF(CURRENT_DATE(), u.last_login_date) AS inactive_days,
        u.user_level,
        COUNT(DISTINCT s.session_id) AS total_sessions,
        MAX(s.session_duration) AS max_session_duration,
        AVG(s.session_duration) AS avg_session_duration,
        SUM(p.amount) AS total_payments,
        COUNT(DISTINCT p.payment_id) AS payment_count,
        (SELECT MAX(event_id) FROM event_participants ep WHERE ep.user_id = u.user_id) AS last_event_joined
    FROM 
        users u
        LEFT JOIN sessions s ON u.user_id = s.user_id
        LEFT JOIN payments p ON u.user_id = p.user_id
    WHERE 
        DATEDIFF(CURRENT_DATE(), u.last_login_date) >= 30
    GROUP BY 
        u.user_id, u.reg_date, u.last_login_date, u.user_level
)
SELECT 
    CASE 
        WHEN inactive_days BETWEEN 30 AND 90 THEN '1-3개월'
        WHEN inactive_days BETWEEN 91 AND 180 THEN '3-6개월'
        WHEN inactive_days BETWEEN 181 AND 365 THEN '6-12개월'
        ELSE '12개월 이상'
    END AS inactive_segment,
    COUNT(*) AS user_count,
    AVG(user_level) AS avg_level,
    AVG(total_sessions) AS avg_sessions,
    AVG(avg_session_duration) AS avg_session_duration,
    SUM(total_payments) AS total_revenue,
    AVG(CASE WHEN payment_count > 0 THEN 1 ELSE 0 END) * 100 AS paying_user_percentage,
    AVG(CASE WHEN last_event_joined IS NOT NULL THEN 1 ELSE 0 END) * 100 AS event_participation_rate
FROM 
    inactive_users
GROUP BY 
    CASE 
        WHEN inactive_days BETWEEN 30 AND 90 THEN '1-3개월'
        WHEN inactive_days BETWEEN 91 AND 180 THEN '3-6개월'
        WHEN inactive_days BETWEEN 181 AND 365 THEN '6-12개월'
        ELSE '12개월 이상'
    END
ORDER BY 
    MIN(inactive_days);
```

## 분석 결과

| 휴면 세그먼트 | 사용자 수 | 평균 레벨 | 평균 세션 수 | 평균 세션 시간(분) | 총 매출 | 유료 사용자 비율 | 이벤트 참여율 |
|-------------|----------|----------|------------|-----------------|---------|----------------|-------------|
| 1-3개월 | 28,743 | 47.3 | 157.2 | 28.5 | ₩721,486,000 | 24.8% | 67.3% |
| 3-6개월 | 14,628 | 39.7 | 112.4 | 22.7 | ₩352,175,000 | 18.2% | 52.1% |
| 6-12개월 | 8,945 | 32.8 | 87.6 | 19.3 | ₩196,524,000 | 14.5% | 43.8% |
| 12개월 이상 | 5,782 | 24.5 | 56.3 | 15.8 | ₩87,329,000 | 10.2% | 36.5% |

## 핵심 인사이트

1. 휴면 기간이 길어질수록 모든 지표(레벨, 세션 수, 세션 시간, 매출, 유료 비율, 이벤트 참여율)가 감소하는 경향 확인

2. 3개월을 기점으로 사용자 수가 급격히 감소하며, 이는 초기 휴면 기간에 재활성화를 시도하는 것이 효과적임을 시사

3. 유료 사용자 비율과 이벤트 참여율은 강한 상관관계(r=0.93)를 보여, 이벤트 참여가 과금 행동과 밀접하게 연관됨

## 권장 사항

1. 휴면 초기(1-3개월) 사용자를 우선적으로 타겟팅하는 재활성화 캠페인 실시
2. 과거 이벤트 참여 이력이 있는 사용자를 위한 맞춤형 재참여 유도 전략 수립
3. 장기 휴면 사용자(6개월 이상)를 위한 게임 재입문 가이드 및 추가 인센티브 제공
"""
    
    dormant_query_id = report_manager.create_report(
        report_type=ReportType.QUERY,
        name="휴면 사용자 세그먼트 분석",
        description="휴면 상태 사용자의 세그먼트별 특성 및 행동 패턴 분석",
        content=dormant_query_content,
        tags=["dormant", "user", "segmentation"]
    )
    
    logger.info(f"휴면 사용자 질의 보고서 생성됨: {dormant_query_id}")
    
    # 4. 태그로 보고서 검색
    dormant_reports = report_manager.list_reports(tags=["dormant"])
    logger.info(f"'dormant' 태그가 있는 보고서 수: {len(dormant_reports)}")
    for report in dormant_reports:
        logger.info(f"- {report['name']} ({report['id']})")
    
    # 5. 여러 태그의 교집합으로 검색
    event_revenue_reports = report_manager.list_reports(tags=["event", "revenue"], match_all_tags=True)
    logger.info(f"'event'와 'revenue' 태그가 모두 있는 보고서 수: {len(event_revenue_reports)}")
    for report in event_revenue_reports:
        logger.info(f"- {report['name']} ({report['id']})")
    
    # 6. 보고서 내용 가져오기 및 HTML로 내보내기
    if comprehensive_id:
        report = report_manager.get_report(comprehensive_id)
        if report:
            # HTML로 내보내기
            output_dir = os.path.join(project_root, "reports", "exports")
            os.makedirs(output_dir, exist_ok=True)
            
            output_file = os.path.join(output_dir, f"{report['id']}.html")
            ReportExporter.export_to_file(report, output_file, format='html')
            logger.info(f"보고서를 HTML로 내보냄: {output_file}")
    
    # 7. 태그 요약 정보 가져오기
    tags_summary = report_manager.get_tags_summary()
    logger.info("태그별 보고서 수:")
    for tag, count in tags_summary.items():
        logger.info(f"- {tag}: {count}개")
    
    logger.info("보고서 시스템 사용 예제 완료")


if __name__ == "__main__":
    main()
