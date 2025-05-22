#!/bin/bash
# firebase-backup.sh
#
# Firebase 프로젝트의 로컬 백업을 생성하는 스크립트
# 배포 전에 현재 상태를 백업하여 문제 발생 시 복원할 수 있게 함

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
BACKUP_DIR="$PROJECT_ROOT/backup/functions/$(date +%Y%m%d_%H%M%S)"

# 백업 설명(선택 사항)
BACKUP_DESCRIPTION=${1:-"자동 백업"}

# 사용법 체크
function show_usage {
    echo -e "${BLUE}사용법:${NC} $0 [백업 설명]"
    echo ""
    echo "예시:"
    echo "  $0 \"API 엔드포인트 변경 전 백업\""
    exit 0
}

if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    show_usage
fi

# 디렉토리 확인
if [ ! -d "$FUNCTIONS_DIR" ]; then
    echo -e "${RED}오류: functions 디렉토리를 찾을 수 없습니다: $FUNCTIONS_DIR${NC}"
    exit 1
fi

if [ ! -f "$FIREBASE_CONFIG" ]; then
    echo -e "${YELLOW}경고: firebase.json 파일을 찾을 수 없습니다.${NC}"
fi

# 백업 디렉토리 생성
echo -e "${BLUE}백업 디렉토리 생성 중: $BACKUP_DIR${NC}"
mkdir -p "$BACKUP_DIR"

# 백업 정보 파일 생성
echo -e "${BLUE}백업 정보 파일 생성 중...${NC}"
cat > "$BACKUP_DIR/backup-info.json" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "description": "$BACKUP_DESCRIPTION",
  "projectRoot": "$PROJECT_ROOT",
  "creator": "$(whoami)",
  "hostname": "$(hostname)"
}
EOF

# Functions 디렉토리 백업
echo -e "${BLUE}Functions 코드 백업 중...${NC}"
mkdir -p "$BACKUP_DIR/functions"
cp -R "$FUNCTIONS_DIR"/* "$BACKUP_DIR/functions/"

# Firebase 설정 파일 백업
if [ -f "$FIREBASE_CONFIG" ]; then
    echo -e "${BLUE}Firebase 설정 파일 백업 중...${NC}"
    cp "$FIREBASE_CONFIG" "$BACKUP_DIR/"
fi

if [ -f "$FIREBASERC" ]; then
    echo -e "${BLUE}.firebaserc 파일 백업 중...${NC}"
    cp "$FIREBASERC" "$BACKUP_DIR/"
fi

# 환경 변수 파일 백업
ENV_FILES=("$FUNCTIONS_DIR/.env" "$FUNCTIONS_DIR/.env.dev" "$FUNCTIONS_DIR/.env.staging" "$FUNCTIONS_DIR/.env.prod")
echo -e "${BLUE}환경 변수 파일 백업 중...${NC}"
mkdir -p "$BACKUP_DIR/functions/env"

for ENV_FILE in "${ENV_FILES[@]}"; do
    if [ -f "$ENV_FILE" ]; then
        FILENAME=$(basename "$ENV_FILE")
        cp "$ENV_FILE" "$BACKUP_DIR/functions/env/$FILENAME"
    fi
done

# 백업 파일 목록 생성
echo -e "${BLUE}백업 파일 목록 생성 중...${NC}"
find "$BACKUP_DIR" -type f | sort > "$BACKUP_DIR/files.txt"

# Git 상태 저장 (있는 경우)
if [ -d "$PROJECT_ROOT/.git" ]; then
    echo -e "${BLUE}Git 상태 저장 중...${NC}"
    cd "$PROJECT_ROOT"
    git rev-parse HEAD > "$BACKUP_DIR/git-commit.txt"
    git diff > "$BACKUP_DIR/git-diff.patch"
fi

# 백업 완료
echo -e "${GREEN}백업 완료!${NC}"
echo -e "백업 위치: ${GREEN}$BACKUP_DIR${NC}"
echo -e "백업 시간: ${GREEN}$(date)${NC}"
echo -e "복원 명령어: ${YELLOW}./scripts/firebase/firebase-restore.sh $BACKUP_DIR${NC}"

# 백업 파일 요약
FILE_COUNT=$(find "$BACKUP_DIR" -type f | wc -l)
DIR_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo -e "백업 파일 수: ${BLUE}$FILE_COUNT${NC}"
echo -e "백업 크기: ${BLUE}$DIR_SIZE${NC}"
