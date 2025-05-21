#!/bin/bash

# 단계적 배포 스크립트
# 이 스크립트는 Firebase의 다양한 환경(개발, 스테이징, 프로덕션)에 배포를 진행합니다.

# 현재 디렉토리가 프로젝트 루트인지 확인
if [ ! -f ".firebaserc" ]; then
    echo "오류: 이 스크립트는 프로젝트 루트 디렉토리에서 실행해야 합니다."
    exit 1
fi

# 기본 설정
ENVIRONMENT="development"
COMPONENTS="hosting,functions"
SKIP_CONFIRM=false
SKIP_BACKUP=false

# 색상 설정
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 도움말 출력
function show_help {
    echo -e "${BLUE}Firebase 단계적 배포 스크립트${NC}"
    echo "사용법: $0 [options]"
    echo ""
    echo "옵션:"
    echo "  -e, --environment ENV   배포 환경 (development, staging, production) [기본값: development]"
    echo "  -c, --components COMP   배포할 구성요소 (hosting, functions, all) [기본값: hosting,functions]"
    echo "  -y, --yes               확인 과정 생략"
    echo "  --skip-backup           백업 과정 생략"
    echo "  -h, --help              도움말 표시"
    echo ""
    echo "예시:"
    echo "  $0 -e production -c hosting --yes    확인 없이 프로덕션 환경의 호스팅만 배포"
    exit 0
}

# 인수 파싱
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -e|--environment) ENVIRONMENT="$2"; shift ;;
        -c|--components) COMPONENTS="$2"; shift ;;
        -y|--yes) SKIP_CONFIRM=true ;;
        --skip-backup) SKIP_BACKUP=true ;;
        -h|--help) show_help ;;
        *) echo "알 수 없는 옵션: $1"; exit 1 ;;
    esac
    shift
done

# 환경 유효성 검사
if [ "$ENVIRONMENT" != "development" ] && [ "$ENVIRONMENT" != "staging" ] && [ "$ENVIRONMENT" != "production" ]; then
    echo -e "${RED}오류: 유효하지 않은 환경입니다. development, staging, production 중 하나를 사용하세요.${NC}"
    exit 1
fi

# 구성요소 설정
if [ "$COMPONENTS" == "all" ]; then
    COMPONENTS="hosting,functions"
fi

# 백업 생성
if [ "$SKIP_BACKUP" == false ]; then
    echo -e "${YELLOW}배포 전 백업을 생성합니다...${NC}"
    BACKUP_DESC="$ENVIRONMENT 환경 배포 전 자동 백업"
    node scripts/backup/firebase-backup.js "$BACKUP_DESC"
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}백업 생성 중 오류가 발생했습니다. 배포를 중단합니다.${NC}"
        exit 1
    fi
fi

# 현재 Firebase 환경 저장
CURRENT_ENV=$(firebase use | grep "Active Project:" | awk '{print $3}')

# 배포 정보 표시
echo -e "${BLUE}배포 정보:${NC}"
echo -e "${YELLOW}환경:${NC} $ENVIRONMENT"
echo -e "${YELLOW}구성요소:${NC} $COMPONENTS"

# 확인 요청
if [ "$SKIP_CONFIRM" == false ]; then
    read -p "계속 진행하시겠습니까? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}배포가 취소되었습니다.${NC}"
        exit 0
    fi
fi

# 배포 환경 전환
echo -e "${YELLOW}Firebase 환경을 $ENVIRONMENT로 전환합니다...${NC}"
firebase use $ENVIRONMENT

if [ $? -ne 0 ]; then
    echo -e "${RED}Firebase 환경 전환 중 오류가 발생했습니다. 배포를 중단합니다.${NC}"
    firebase use "$CURRENT_ENV" > /dev/null 2>&1
    exit 1
fi

# 배포 실행
echo -e "${YELLOW}Firebase 배포를 시작합니다 ($ENVIRONMENT 환경, $COMPONENTS 구성요소)...${NC}"
firebase deploy --only $COMPONENTS

DEPLOY_STATUS=$?

# 원래 환경으로 복원
firebase use "$CURRENT_ENV" > /dev/null 2>&1

# 배포 상태 확인
if [ $DEPLOY_STATUS -eq 0 ]; then
    echo -e "${GREEN}배포가 성공적으로 완료되었습니다.${NC}"
else
    echo -e "${RED}배포 중 오류가 발생했습니다.${NC}"
    exit 1
fi

exit 0
