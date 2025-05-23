# 장기 미접속 & 이벤트 후 입금 사용자 분석 방법론

## 개요

이 문서는 장기간 게임을 하지 않은 사용자 중 이벤트 지급 후 입금 기록이 있는 사용자를 분석하기 위한 방법론과 접근 방식을 설명합니다. 이 분석은 사용자 행동 패턴을 이해하고 마케팅 전략을 수립하는 데 도움이 될 수 있습니다.

## 분석 목적

다음 조건을 만족하는 사용자를 찾는 것이 목표였습니다:

1. 금일(2025-05-17) 기준으로 10일 동안 게임을 하지 않은 사용자
2. 이벤트 차수에 관계없이 한 번이라도 이벤트 지급을 받은 후 입금 기록이 있는 사용자

## 데이터 소스

분석에 사용된 주요 테이블은 다음과 같습니다:

- `players`: 사용자 기본 정보 및 마지막 게임 날짜
- `promotion_players`: 프로모션(이벤트) 지급 정보
- `money_flows`: 금융 거래 내역

## 분석 방법

분석은 다음 단계로 진행되었습니다:

1. **장기 미접속 사용자 식별**: `players` 테이블의 `lastPlayDate` 필드를 사용하여 10일 이상 게임을 하지 않은 사용자를 식별했습니다.
2. **이벤트 지급 정보 확인**: `promotion_players` 테이블에서 이벤트를 받은 사용자와 시기를 파악했습니다.
3. **입금 기록 분석**: `money_flows` 테이블을 사용하여 이벤트 지급 이후 입금 기록이 있는 사용자를 확인했습니다.
4. **데이터 결합 및 집계**: 위 조건들을 모두 만족하는 사용자 목록을 생성하고, 추가 정보(이벤트 받은 횟수, 입금액 합계, 마지막 게임 날짜)를 집계했습니다.

## 데이터 정의

- **장기 미접속 사용자**: `players` 테이블에서 `lastPlayDate < DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY)`인 사용자
- **이벤트 지급**: `promotion_players` 테이블의 레코드
- **이벤트 이후 입금**: `money_flows` 테이블에서 `type = 0`이며 해당 사용자의 첫 이벤트 지급 날짜 이후에 생성된 레코드

## 분석 결과

분석 결과, 총 128명의 사용자가 조건을 만족했습니다. 이 사용자들은 모두 10일 이상 게임을 하지 않았으며, 이벤트 지급 후 적어도 한 번 이상 입금한 기록이 있습니다.

주요 발견 사항은 다음과 같습니다:

1. 가장 많은 이벤트를 받은 사용자는 "ug3802"로 8회 이벤트를 받았습니다.
2. 이벤트 후 가장 많은 입금액을 기록한 사용자는 "jiaw189"로 764,000.00의 입금액을 기록했습니다.
3. 가장 최근에 게임을 한 날짜는 2025년 5월 5일입니다.

자세한 결과는 `inactive_event_deposit_analysis.html` 및 `inactive_event_deposit_data.csv` 파일에서 확인할 수 있습니다.

## 향후 분석 가능성

이 분석은 다음과 같이 확장될 수 있습니다:

1. 이벤트 지급 후 입금 시간 간격 분석
2. 이벤트 유형별 효과 측정
3. 장기 미접속 사용자의 재방문 패턴 분석
4. 이벤트 후 입금 행동과 게임 활동의 상관관계 분석

## 마케팅 활용 방안

이 데이터는 다음과 같은 마케팅 전략에 활용될 수 있습니다:

1. 장기 미접속 사용자 대상 맞춤형 이벤트 설계
2. 이벤트 효과가 높은 사용자 세그먼트 타겟팅
3. 이벤트 후 입금은 했으나 게임 활동이 없는 사용자 재활성화 캠페인
4. 이벤트 빈도 및 금액 최적화

## 주의사항

- 분석 결과는 현재 데이터베이스 상태를 기준으로 합니다.
- 결과 해석 시 데이터의 정확성과 완전성을 고려해야 합니다.
- 사용자 행동 패턴은 다양한 요인에 영향을 받을 수 있으므로, 이벤트 지급과의 인과관계를 단정 짓기는 어렵습니다.
- 개인정보 보호를 위해 이 데이터의 사용 및 공유에 주의해야 합니다.
