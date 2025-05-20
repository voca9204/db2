#!/bin/bash
# Firebase Functions 배포 스크립트
# 환경 변수 설정 및 배포를 자동화합니다.

# 색상 설정
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # 색상 초기화

# 함수 디렉토리
FUNCTIONS_DIR="functions"

# 실행 위치 확인
if [ ! -d "$FUNCTIONS_DIR" ]; then
  echo -e "${RED}오류: 스크립트는 프로젝트 루트 디렉토리에서 실행해야 합니다.${NC}"
  exit 1
fi

# 환경 설정
echo -e "${BLUE}Firebase Functions 배포 준비 중...${NC}"

# .env 파일 존재 확인
if [ ! -f "$FUNCTIONS_DIR/.env" ]; then
  echo -e "${YELLOW}경고: .env 파일이 없습니다. .env.example에서 복사합니다.${NC}"
  cp "$FUNCTIONS_DIR/.env.example" "$FUNCTIONS_DIR/.env"
  echo -e "${YELLOW}.env 파일이 생성되었습니다. 필요한 경우 설정을 수정하세요.${NC}"
  read -p "계속 진행하시겠습니까? (y/n): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}배포가 취소되었습니다.${NC}"
    exit 1
  fi
fi

# 의존성 확인 및 설치
echo -e "${BLUE}의존성 확인 중...${NC}"
cd "$FUNCTIONS_DIR"

# 환경 변수 설정 갱신
echo -e "${BLUE}Firebase Functions 환경 변수 설정 중...${NC}"

# 환경 변수 배포
echo -e "${BLUE}Firebase Functions 환경 변수 설정 배포 중...${NC}"
firebase functions:config:set \
  db.host="$(grep -E "^DB_HOST=" .env | cut -d'=' -f2)" \
  db.user="$(grep -E "^DB_USER=" .env | cut -d'=' -f2)" \
  db.password="$(grep -E "^DB_PASSWORD=" .env | cut -d'=' -f2)" \
  db.name="$(grep -E "^DB_NAME=" .env | cut -d'=' -f2)" \
  db.debug="$(grep -E "^DB_DEBUG=" .env | cut -d'=' -f2 || echo "false")" \
  env.node_env="$(grep -E "^NODE_ENV=" .env | cut -d'=' -f2)" \
  api.prefix="$(grep -E "^API_PREFIX=" .env | cut -d'=' -f2)" \
  logging.level="$(grep -E "^LOG_LEVEL=" .env | cut -d'=' -f2)"

if [ $? -ne 0 ]; then
  echo -e "${RED}환경 변수 설정 배포에 실패했습니다. Firebase 로그인 상태를 확인하세요.${NC}"
  exit 1
fi

# 함수 배포
echo -e "${BLUE}Firebase Functions 배포 중...${NC}"
firebase deploy --only functions

if [ $? -ne 0 ]; then
  echo -e "${RED}Functions 배포에 실패했습니다. 오류를 확인하세요.${NC}"
  exit 1
else
  echo -e "${GREEN}Firebase Functions 배포에 성공했습니다!${NC}"
fi

cd ..
echo -e "${GREEN}배포 완료!${NC}"
