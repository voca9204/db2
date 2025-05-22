#!/bin/bash
# firebase-restore.sh
#
# Firebase 프로젝트의 백업을 복원하는 스크립트
# 배포 실패 또는 문제 발생 시 이전 상태로 복원하기 위해 사용

set -e

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 프로젝트 루트 디렉토리
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FUNCTIONS_DIR="$PROJECT_ROOT/functions"
FIREBASE_CONFIG="$PROJECT_ROOT/firebase.json"
FIREBASERC="$PROJECT_ROOT/.firebaserc"
TEMP_DIR="$PROJECT_ROOT/backup/functions/temp_$(date +%Y%m%d_%H%M%S)"

# 백업 디렉토리 체크
if [ $# -eq 0 ]; then
    echo -e "${RED}오류: 백업 디렉토리를 지정해야 합니다.${NC}"
    echo -e "${BLUE}사용법:${NC} $0 <백업_디렉토리>"
    echo ""
    echo "예시:"
    echo "  $0 $PROJECT_ROOT/backup/functions/20250521_120000"
    exit 1
fi

BACKUP_DIR="$1"

# 백업 디렉토리 확인
if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${RED}오류: 지정한 백업 디렉토리가 존재하지 않습니다: $BACKUP_DIR${NC}"
    exit 1
fi

# 백업 정보 확인
BACKUP_INFO="$BACKUP_DIR/backup-info.json"
if [ -f "$BACKUP_INFO" ]; then
    echo -e "${BLUE}백업 정보:${NC}"
    cat "$BACKUP_INFO"
else
    echo -e "${YELLOW}경고: 백업 정보 파일을 찾을 수 없습니다.${NC}"
fi

# 복원 확인
echo -e "${YELLOW}경고: 이 작업은 현재의 functions 디렉토리를 백업에서 복원한 파일로 대체합니다.${NC}"
read -p "계속하시겠습니까? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}복원이 취소되었습니다.${NC}"
    exit 0
fi

# 현재 상태 백업 (롤백이 실패한 경우를 대비)
echo -e "${BLUE}현재 상태를 임시 백업 중...${NC}"
mkdir -p "$TEMP_DIR"
cp -R "$FUNCTIONS_DIR"/* "$TEMP_DIR/" 2>/dev/null || true
if [ -f "$FIREBASE_CONFIG" ]; then
    cp "$FIREBASE_CONFIG" "$TEMP_DIR/" 2>/dev/null || true
fi
if [ -f "$FIREBASERC" ]; then
    cp "$FIREBASERC" "$TEMP_DIR/" 2>/dev/null || true
fi

# 백업에서 Functions 코드 복원
if [ -d "$BACKUP_DIR/functions" ]; then
    echo -e "${BLUE}Functions 코드 복원 중...${NC}"
    rm -rf "$FUNCTIONS_DIR"/* 2>/dev/null || true
    mkdir -p "$FUNCTIONS_DIR"
    cp -R "$BACKUP_DIR/functions"/* "$FUNCTIONS_DIR/"
fi

# 환경 변수 파일 복원
if [ -d "$BACKUP_DIR/functions/env" ]; then
    echo -e "${BLUE}환경 변수 파일 복원 중...${NC}"
    ENV_FILES=(.env .env.dev .env.staging .env.prod)
    
    for ENV_FILE in "${ENV_FILES[@]}"; do
        if [ -f "$BACKUP_DIR/functions/env/$ENV_FILE" ]; then
            cp "$BACKUP_DIR/functions/env/$ENV_FILE" "$FUNCTIONS_DIR/$ENV_FILE"
        fi
    done
fi

# Firebase 설정 파일 복원
if [ -f "$BACKUP_DIR/firebase.json" ]; then
    echo -e "${BLUE}Firebase 설정 파일 복원 중...${NC}"
    cp "$BACKUP_DIR/firebase.json" "$PROJECT_ROOT/"
fi

if [ -f "$BACKUP_DIR/.firebaserc" ]; then
    echo -e "${BLUE}.firebaserc 파일 복원 중...${NC}"
    cp "$BACKUP_DIR/.firebaserc" "$PROJECT_ROOT/"
fi

# 종속성 설치
echo -e "${BLUE}종속성 설치 중...${NC}"
cd "$FUNCTIONS_DIR"
npm install --silent

# 복원 완료
echo -e "${GREEN}복원 완료!${NC}"
echo -e "복원 시간: ${GREEN}$(date)${NC}"
echo -e "복원된 백업: ${GREEN}$BACKUP_DIR${NC}"

# 배포 안내
echo -e "\n${YELLOW}중요:${NC} 복원된 코드를 적용하려면 Firebase에 다시 배포해야 합니다."
echo -e "배포 명령어: ${BLUE}firebase deploy --only functions${NC}"

# 롤백 안내
echo -e "\n현재 상태의 임시 백업이 생성되었습니다: ${YELLOW}$TEMP_DIR${NC}"
echo -e "복원에 문제가 있는 경우 다음 명령으로 원래 상태로 되돌릴 수 있습니다:"
echo -e "${BLUE}$0 $TEMP_DIR${NC}"
