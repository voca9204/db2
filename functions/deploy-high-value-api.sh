#!/bin/bash

# 고가치 사용자 API 배포 스크립트

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=======================================${NC}"
echo -e "${BLUE}   고가치 사용자 API 배포 스크립트    ${NC}"
echo -e "${BLUE}=======================================${NC}"

# 함수 디렉토리로 이동
cd "$(dirname "$0")"

# 필요한 모듈 설치 확인
echo -e "${YELLOW}의존성 패키지 확인 중...${NC}"
npm list express mariadb cors dotenv || {
  echo -e "${YELLOW}필요한 패키지 설치 중...${NC}"
  npm install express mariadb cors dotenv
}

# 린트 확인 (옵션)
echo -e "${YELLOW}코드 린트 검사 중...${NC}"
npm run lint

# Firebase 배포 준비
echo -e "${YELLOW}Firebase 배포 준비 중...${NC}"

# 배포 옵션 확인
read -p "Dry run으로 배포하시겠습니까? (y/n) " dry_run

if [ "$dry_run" = "y" ]; then
  echo -e "${YELLOW}Dry run 모드로 배포 시뮬레이션 실행 중...${NC}"
  firebase deploy --only functions:highValueUsersApi --dry-run
else
  echo -e "${YELLOW}실제 배포 실행 중...${NC}"
  firebase deploy --only functions:highValueUsersApi
  
  # 배포 결과 확인
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}배포 성공!${NC}"
    echo -e "${GREEN}API 엔드포인트: https://us-central1-db888-67827.cloudfunctions.net/highValueUsersApi${NC}"
    echo -e "${YELLOW}테스트 URL 예시:${NC}"
    echo -e "- 활성 사용자 조회: https://us-central1-db888-67827.cloudfunctions.net/highValueUsersApi/active?minNetBet=1000&limit=10"
    echo -e "- 휴면 사용자 조회: https://us-central1-db888-67827.cloudfunctions.net/highValueUsersApi/dormant?minNetBet=1000&limit=10"
    echo -e "- CSV 내보내기: https://us-central1-db888-67827.cloudfunctions.net/highValueUsersApi/export/csv?minNetBet=1000"
  else
    echo -e "${RED}배포 실패. 오류를 확인하세요.${NC}"
  fi
fi

echo -e "${BLUE}=======================================${NC}"
echo -e "${BLUE}   배포 작업 완료                     ${NC}"
echo -e "${BLUE}=======================================${NC}"
