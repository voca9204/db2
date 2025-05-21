#!/bin/bash

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Firebase Functions 배포 시작${NC}"

# Firebase CLI 버전 확인
echo -e "${GREEN}Firebase CLI 버전 확인:${NC}"
firebase --version

# Firebase 프로젝트 선택 확인
echo -e "${GREEN}현재 선택된 Firebase 프로젝트:${NC}"
firebase use

# functions 디렉터리로 이동
cd functions
echo -e "${GREEN}dependencies 설치 중...${NC}"
npm install

# 환경 변수 설정 (필요한 경우)
# firebase functions:config:set database.host="211.248.190.46" database.user="hermes" database.password="mcygicng!022" database.name="hermes"

# 함수 배포
echo -e "${GREEN}함수 배포 중...${NC}"
cd ..
firebase deploy --only functions:activeUsers,functions:dormantUsers,functions:healthCheck

if [ $? -eq 0 ]; then
  echo -e "${GREEN}Firebase Functions 배포 성공!${NC}"
else
  echo -e "${RED}Firebase Functions 배포 실패. 로그를 확인하세요.${NC}"
  exit 1
fi

# Hosting 재배포 (필요한 경우)
echo -e "${GREEN}Hosting 재배포 중...${NC}"
firebase deploy --only hosting

if [ $? -eq 0 ]; then
  echo -e "${GREEN}Firebase Hosting 배포 성공!${NC}"
else
  echo -e "${RED}Firebase Hosting 배포 실패. 로그를 확인하세요.${NC}"
  exit 1
fi

echo -e "${GREEN}배포 완료! 다음 URL에서 애플리케이션을 확인하세요: https://db888-67827.web.app${NC}"
