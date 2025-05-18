# Hermes 데이터베이스 스키마 분석

이 문서는 Hermes 데이터베이스의 주요 테이블과 그 구조를 설명합니다.

## 주요 테이블 개요

DB2 프로젝트에서 특히 중요한 테이블은 다음과 같습니다:

1. **promotion_players**: 이벤트 참여 사용자 정보
2. **players**: 전체 사용자 정보
3. **money_flows**: 입출금 정보
4. **game_scores**: 게임 점수 및 배팅 정보
5. **promotions**: 이벤트(프로모션) 정보

## 테이블 구조

### promotion_players

이벤트 참여 사용자 정보를 담고 있는 테이블입니다.

| 필드 | 타입 | 설명 |
|------|------|------|
| promotion | char(32) | 이벤트 ID (PK) |
| player | int(10) unsigned | 플레이어 ID (PK) |
| reward | decimal(8,2) unsigned | 지급된 보상 금액 |
| status | tinyint(3) unsigned | 상태 코드 |
| appliedAt | timestamp | 이벤트 지급 시점 |
| dismissedAt | timestamp | 이벤트 취소 시점 |
| payerId | varchar(20) | 지급자 ID |
| lastAttend | date | 마지막 참여 날짜 |

참고:
- `appliedAt` 필드는 실제 이벤트 지급 시점을 의미합니다.
- `status` 필드의 값에 따라 이벤트 참여 상태가 달라집니다.

### players

사용자 정보를 담고 있는 테이블입니다.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | int(10) unsigned | 사용자 ID (PK, 자동 증가) |
| account | int(10) unsigned | 계정 번호 |
| userId | varchar(64) | 사용자 로그인 ID (Unique) |
| name | varchar(20) | 사용자 이름 |
| agent | int(10) unsigned | 에이전트 ID |
| status | smallint(5) unsigned | 상태 코드 |
| note | varchar(300) | 메모 |
| joinPathType | varchar(16) | 가입 경로 유형 |
| joinPath | varchar(64) | 가입 경로 상세 |
| createdAt | timestamp | 사용자 생성일 |
| updatedAt | timestamp | 마지막 업데이트 일시 |
| lastPlayDate | date | 마지막 플레이 날짜 |
| phoneName | varchar(50) | 전화번호명 |
| site | varchar(16) | 사이트 정보 |
| adjustType | tinyint(3) unsigned | 조정 유형 |
| rewardRate | float | 보상 비율 |
| flowFeatures | tinyint(3) unsigned | 흐름 특성 |

참고:
- `userId`는 사용자의 로그인 ID이며 고유값으로 설정되어 있습니다.
- `status` 필드는 사용자의 활성 상태를 나타냅니다.

### money_flows

입출금 정보를 담고 있는 테이블입니다.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | char(32) | 트랜잭션 ID (PK) |
| player | int(10) unsigned | 플레이어 ID |
| type | tinyint(3) unsigned | 트랜잭션 유형 (0: 입금, 1: 출금) |
| amount | decimal(12,2) | 금액 |
| status | tinyint(3) unsigned | 상태 코드 |
| orderId | char(32) | 주문 ID |
| createdAt | timestamp | 생성 일시 |

참고:
- `type` 필드에서 0은 입금, 1은 출금을 의미합니다.
- `amount`는 금액을 나타내며, 소수점 둘째 자리까지 지원합니다.

### game_scores

게임 점수 및 배팅 정보를 담고 있는 테이블입니다.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | bigint(20) unsigned | 점수 ID (PK, 자동 증가) |
| gameDate | date | 게임 날짜 |
| userId | varchar(32) | 사용자 ID |
| currency | varchar(4) | 통화 |
| betCount | smallint(5) unsigned | 배팅 횟수 |
| totalBet | float unsigned | 총 배팅액 |
| netBet | float unsigned | 순 배팅액 (유효 배팅액) |
| winLoss | float | 승패 금액 |
| bonus | float | 보너스 금액 |
| share | float unsigned | 공유 금액 |
| gameType | tinyint(3) unsigned | 게임 유형 |
| importId | int(10) unsigned | 가져오기 ID |
| reserved1-9 | float | 예약된 필드들 |

참고:
- `netBet`은 유효 배팅액을 의미하며, 실제 분석에 사용되는 값입니다.
- `winLoss`는 승패 금액으로, 양수는 승리(이익), 음수는 패배(손실)를 나타냅니다.

### promotions

이벤트(프로모션) 정보를 담고 있는 테이블입니다.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | char(32) | 이벤트 ID (PK) |
| title | varchar(30) | 이벤트 제목 |
| description | varchar(100) | 이벤트 설명 |
| openDate | char(10) | 오픈 날짜 |
| type | tinyint(3) unsigned | 이벤트 유형 |
| area | tinyint(3) unsigned | 이벤트 지역 |
| status | tinyint(3) unsigned | 상태 코드 |
| reward | decimal(8,2) unsigned | 보상 금액 |
| rewardType | tinyint(3) unsigned | 보상 유형 |
| options | smallint(5) unsigned | 이벤트 옵션 |
| createdAt | timestamp | 생성 일시 |
| closedAt | timestamp | 종료 일시 |

참고:
- `status` 필드는 이벤트의 상태(활성, 비활성, 종료 등)를 나타냅니다.
- `rewardType`은 보상의 종류(현금, 포인트, 아이템 등)를 나타냅니다.

## 테이블 간 관계

1. **promotions**과 **promotion_players** 관계:
   - promotions.id = promotion_players.promotion (1:N 관계)
   - 하나의 이벤트(프로모션)는 여러 사용자가 참여할 수 있습니다.

2. **players**와 **promotion_players** 관계:
   - players.id = promotion_players.player (1:N 관계)
   - 한 사용자는 여러 이벤트에 참여할 수 있습니다.

3. **players**와 **money_flows** 관계:
   - players.id = money_flows.player (1:N 관계)
   - 한 사용자는 여러 입출금 기록을 가질 수 있습니다.

4. **players**와 **game_scores** 관계:
   - players.userId = game_scores.userId (1:N 관계)
   - 한 사용자는 여러 게임 점수 기록을 가질 수 있습니다.

## 데이터 분석 관점

이 테이블들은 다음과 같은 분석을 수행하는 데 활용될 수 있습니다:

1. **이벤트 효과 분석**:
   - promotion_players와 game_scores를 조인하여 이벤트 참여 후 게임 활동 변화를 분석
   - promotion_players와 money_flows를 조인하여 이벤트 참여 후 입금 패턴 변화를 분석

2. **사용자 행동 패턴 분석**:
   - game_scores 테이블을 사용하여 시간에 따른 배팅 패턴 변화 분석
   - money_flows 테이블을 사용하여 입출금 패턴 분석

3. **ROI 분석**:
   - promotion_players의 reward 금액과 이후 game_scores의 netBet 금액을 비교하여 ROI 계산

4. **사용자 세그먼트 분석**:
   - players 테이블의 다양한 필드를 사용하여 사용자 세그먼트 생성 및 분석

## 코드 값 설명

일부 필드의 코드 값은 다음과 같습니다:

### money_flows.type
- 0: 입금
- 1: 출금

### promotion_players.status
- 0: 대기
- 1: 적용됨
- 2: 거부됨
- 3: 취소됨

이 문서는 DB2 프로젝트 진행 중에 계속 업데이트될 예정입니다.
