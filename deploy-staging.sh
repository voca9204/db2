#!/bin/bash

# 스테이징 환경에 Firebase Functions 배포 스크립트
echo "DB2 프로젝트 - 스테이징 환경 배포 스크립트"
echo "========================================"

# 현재 디렉토리가 프로젝트 루트인지 확인
if [ ! -f ".firebaserc" ]; then
    echo "오류: 이 스크립트는 프로젝트 루트 디렉토리에서 실행해야 합니다."
    exit 1
fi

# 스테이징 프로젝트 선택
echo "Firebase 스테이징 프로젝트로 전환합니다..."
firebase use staging

# 환경 변수 설정
echo "Firebase Functions 환경 변수를 설정합니다..."
firebase functions:config:set database.host="211.248.190.46" database.user="hermes" database.password="mcygicng!022" database.name="hermes"

# 함수 배포
echo "Firebase Functions를 배포합니다..."
firebase deploy --only functions:basicTest,functions:dbConnectionTest,functions:getSimplifiedHighValueUserReport,functions:getPaginatedHighValueUserReport,functions:getDetailedHighValueUserReport,functions:warmupFunctions

echo "배포가 완료되었습니다."
echo "다음 URL에서 함수를 확인할 수 있습니다:"
echo "- 기본 테스트: https://asia-northeast3-db888-staging.cloudfunctions.net/basicTest"
echo "- DB 연결 테스트: https://asia-northeast3-db888-staging.cloudfunctions.net/dbConnectionTest"
echo "- 간소화된 고가치 사용자 보고서: https://asia-northeast3-db888-staging.cloudfunctions.net/getSimplifiedHighValueUserReport"
echo "- 페이지네이션 고가치 사용자 보고서: https://asia-northeast3-db888-staging.cloudfunctions.net/getPaginatedHighValueUserReport"
echo "- 상세 고가치 사용자 보고서: https://asia-northeast3-db888-staging.cloudfunctions.net/getDetailedHighValueUserReport"

# 기본 프로젝트로 복원
echo "Firebase 기본 프로젝트로 복원합니다..."
firebase use default
