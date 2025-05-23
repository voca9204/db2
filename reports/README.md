# 보고서 분류 시스템

## 개요

이 시스템은 데이터 분석 결과를 체계적으로 분류하고 관리하는 프레임워크를 제공합니다. 보고서는 크게 두 가지 유형으로 구분됩니다:

1. **종합분석보고서 (Comprehensive Reports)**
   - 다양한 분석 결과를 종합하여 인사이트와 권장 사항을 제시하는 보고서
   - 경영 의사결정, 전략 수립 등에 활용

2. **질의 보고서 (Query Reports)**
   - 특정 질의(SQL 쿼리)를 통해 얻은 데이터와 분석 결과를 담은 보고서
   - 태그 시스템을 통해 세부 분류

## 보고서 태그 시스템

질의 보고서는 다음과 같은 태그로 분류됩니다:

- **event**: 이벤트 관련 보고서
- **user**: 사용자 관련 보고서
- **payment**: 결제/입금 관련 보고서
- **retention**: 유지율 관련 보고서
- **acquisition**: 유저 획득 관련 보고서
- **dormant**: 휴면 사용자 관련 보고서
- **engagement**: 참여도 관련 보고서
- **revenue**: 매출 관련 보고서
- **performance**: 성능 관련 보고서
- **custom**: 사용자 정의 보고서

하나의 보고서에 여러 태그를 지정할 수 있으며, 태그 조합을 통해 원하는 보고서를 쉽게 찾을 수 있습니다.

## 디렉토리 구조

```
reports/
├── comprehensive/    # 종합분석보고서
│   └── *.md          # 각 종합분석보고서 파일
├── queries/          # 질의 보고서
│   └── *.md          # 각 질의 보고서 파일
├── exports/          # 내보낸 보고서 (HTML, PDF 등)
└── report_index.json # 보고서 인덱스 파일
```

## 보고서 형식

모든 보고서는 마크다운(.md) 형식으로 작성되며, 파일 상단에 메타데이터가 YAML 형식으로 포함됩니다:

```
---
name: 보고서 제목
description: 보고서 설명
created_at: 생성 시간
updated_at: 업데이트 시간
tags: tag1, tag2, tag3
---

# 보고서 제목

## 섹션 1
...

## 섹션 2
...
```

## 주요 기능

- **보고서 생성**: 새로운 종합분석보고서 또는 질의 보고서 생성
- **태그 관리**: 보고서에 태그 추가, 제거, 업데이트
- **보고서 검색**: 보고서 유형 및 태그 기반으로 보고서 검색
- **보고서 내보내기**: 마크다운, HTML, JSON 등 다양한 형식으로 내보내기
- **태그 요약**: 태그별 보고서 수 등 요약 정보 제공

## 사용 예제

예제 스크립트 `scripts/report_system_example.py`를 참조하세요. 이 스크립트는 보고서 시스템의 기본적인 사용법을 보여줍니다.

## 권장 사항

- 모든 보고서에 적절한 태그를 지정하여 분류를 용이하게 합니다.
- 종합분석보고서는 가능한 질의 보고서의 결과를 참조하고 종합하도록 작성합니다.
- 질의 보고서는 SQL 쿼리와 그 결과, 그리고 간단한 인사이트를 포함하도록 합니다.
- 정기적으로 생성되는 보고서는 파일명 규칙을 일관되게 유지합니다.
