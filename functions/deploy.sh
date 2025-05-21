#!/bin/bash

# Firebase Function 배포 스크립트
# 이 스크립트는 Firebase Functions를 검증하고 안전하게 배포합니다.

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 배너 출력
echo -e "\n${BLUE}============================================${NC}"
echo -e "${BLUE}  Firebase Functions 배포 스크립트 v1.0.0${NC}"
echo -e "${BLUE}============================================${NC}\n"

# 함수 정의: 도움말 출력
function show_help {
  echo -e "사용법: ./deploy.sh [옵션] [함수이름]"
  echo -e "\n옵션:"
  echo -e "  -h, --help          도움말 표시"
  echo -e "  -a, --all           모든 함수 배포"
  echo -e "  -f, --function      특정 함수만 배포 (함수 이름 필요)"
  echo -e "  -d, --dry-run       실제 배포 없이 배포 시뮬레이션"
  echo -e "  -s, --skip-validate 검증 단계 건너뛰기"
  echo -e "\n예시:"
  echo -e "  ./deploy.sh -a               # 모든 함수 배포"
  echo -e "  ./deploy.sh -f activeUsers   # activeUsers 함수만 배포"
  echo -e "  ./deploy.sh -d -a            # 모든 함수 배포 시뮬레이션"
  echo -e "  ./deploy.sh -s -f dormantUsers # 검증 없이 dormantUsers 배포"
  exit 0
}

# 기본 변수 설정
DRY_RUN=false
SKIP_VALIDATE=false
DEPLOY_ALL=false
FUNCTION_NAME=""

# 인자 파싱
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -h|--help)
      show_help
      ;;
    -a|--all)
      DEPLOY_ALL=true
      shift
      ;;
    -f|--function)
      FUNCTION_NAME="$2"
      shift
      shift
      ;;
    -d|--dry-run)
      DRY_RUN=true
      shift
      ;;
    -s|--skip-validate)
      SKIP_VALIDATE=true
      shift
      ;;
    *)
      echo -e "${RED}알 수 없는 옵션: $1${NC}"
      show_help
      ;;
  esac
done

# 필수 인자 검증
if [[ "$DEPLOY_ALL" == false && -z "$FUNCTION_NAME" ]]; then
  echo -e "${RED}오류: 함수 이름이 필요합니다. -f [함수이름] 또는 -a 옵션을 사용하세요.${NC}"
  show_help
fi

# 함수 검증
if [[ "$SKIP_VALIDATE" == false ]]; then
  echo -e "${YELLOW}🔍 함수 검증 시작...${NC}"
  
  # 린트 검사
  echo -e "${YELLOW}실행 중: npm run lint${NC}"
  npm run lint
  if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 린트 검사 실패. 배포를 중단합니다.${NC}"
    exit 1
  fi
  
  # 타입 검사 (TypeScript 프로젝트인 경우)
  if [ -f "tsconfig.json" ]; then
    echo -e "${YELLOW}실행 중: npm run build${NC}"
    npm run build
    if [ $? -ne 0 ]; then
      echo -e "${RED}❌ 타입 검사 실패. 배포를 중단합니다.${NC}"
      exit 1
    fi
  fi
  
  # 사용자 정의 검증 스크립트 실행
  echo -e "${YELLOW}실행 중: node scripts/validate-functions.js${NC}"
  node scripts/validate-functions.js
  if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 함수 검증 실패. 배포를 중단합니다.${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}✅ 함수 검증 완료${NC}"
fi

# 배포 명령어 구성
DEPLOY_CMD="firebase deploy --only functions"

if [[ "$DEPLOY_ALL" == false ]]; then
  DEPLOY_CMD="$DEPLOY_CMD:$FUNCTION_NAME"
fi

if [[ "$DRY_RUN" == true ]]; then
  DEPLOY_CMD="$DEPLOY_CMD --dry-run"
fi

# 배포 실행
echo -e "${YELLOW}📦 배포 실행: $DEPLOY_CMD${NC}"
eval $DEPLOY_CMD

# 배포 결과 확인
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ 배포 실패. 로그를 확인하세요.${NC}"
  exit 1
else
  echo -e "${GREEN}✅ 배포 완료!${NC}"
  
  if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}📝 참고: 이것은 dry-run 모드였습니다. 실제 배포는 이루어지지 않았습니다.${NC}"
  else
    # 실제 배포 후 작업
    if [[ "$DEPLOY_ALL" == true ]]; then
      echo -e "${GREEN}🚀 모든 함수가 성공적으로 배포되었습니다.${NC}"
    else
      echo -e "${GREEN}🚀 함수 '$FUNCTION_NAME'이(가) 성공적으로 배포되었습니다.${NC}"
    fi
  fi
fi

echo -e "\n${BLUE}============================================${NC}"
echo -e "${BLUE}  배포 프로세스 완료${NC}"
echo -e "${BLUE}============================================${NC}\n"

exit 0
