#!/bin/bash

# Firebase 검증 Git 훅 설치 스크립트
# 이 스크립트는 Firebase 변경사항 검증을 위한 Git 훅을 설치합니다.

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 프로젝트 루트 찾기
PROJECT_ROOT=$(git rev-parse --show-toplevel)
HOOKS_DIR="$PROJECT_ROOT/.git/hooks"
SOURCE_HOOKS_DIR="$PROJECT_ROOT/scripts/hooks"

echo -e "${BLUE}Firebase 검증 Git 훅 설치 시작...${NC}"

# 훅 디렉토리 존재 여부 확인
if [ ! -d "$HOOKS_DIR" ]; then
  echo -e "${RED}오류: Git 훅 디렉토리($HOOKS_DIR)가 존재하지 않습니다.${NC}"
  echo -e "${RED}이 프로젝트가 Git 저장소인지 확인하세요.${NC}"
  exit 1
fi

# 원본 훅 스크립트 존재 여부 확인
if [ ! -f "$SOURCE_HOOKS_DIR/pre-push" ]; then
  echo -e "${RED}오류: 원본 pre-push 훅 스크립트를 찾을 수 없습니다.${NC}"
  echo -e "${RED}필요한 파일: $SOURCE_HOOKS_DIR/pre-push${NC}"
  exit 1
fi

# 기존 훅 백업
if [ -f "$HOOKS_DIR/pre-push" ]; then
  BACKUP_FILE="$HOOKS_DIR/pre-push.backup.$(date +%Y%m%d%H%M%S)"
  echo -e "${YELLOW}기존 pre-push 훅을 백업합니다: $BACKUP_FILE${NC}"
  mv "$HOOKS_DIR/pre-push" "$BACKUP_FILE"
fi# 훅 설치
echo -e "${BLUE}pre-push 훅을 설치합니다...${NC}"
cp "$SOURCE_HOOKS_DIR/pre-push" "$HOOKS_DIR/pre-push"
chmod +x "$HOOKS_DIR/pre-push"

# 설치 확인
if [ -f "$HOOKS_DIR/pre-push" ] && [ -x "$HOOKS_DIR/pre-push" ]; then
  echo -e "${GREEN}Firebase 검증 Git 훅 설치가 완료되었습니다!${NC}"
  echo -e "${GREEN}이제 git push 시 Firebase 변경사항에 대한 자동 검증이 수행됩니다.${NC}"
else
  echo -e "${RED}훅 설치에 실패했습니다.${NC}"
  exit 1
fi

echo -e "${BLUE}검증 프레임워크 의존성 확인...${NC}"
VALIDATION_DIR="$PROJECT_ROOT/scripts/validation"

if [ ! -d "$VALIDATION_DIR" ]; then
  echo -e "${YELLOW}경고: 변경 검증 프레임워크 디렉토리를 찾을 수 없습니다.${NC}"
  echo -e "${YELLOW}Git 훅이 정상적으로 작동하지 않을 수 있습니다.${NC}"
  exit 0
fi

if [ ! -f "$VALIDATION_DIR/package.json" ]; then
  echo -e "${YELLOW}경고: $VALIDATION_DIR/package.json 파일을 찾을 수 없습니다.${NC}"
  echo -e "${YELLOW}Git 훅이 정상적으로 작동하지 않을 수 있습니다.${NC}"
  exit 0
fi

# 의존성 설치 확인 및 실행
if [ ! -d "$VALIDATION_DIR/node_modules" ]; then
  echo -e "${BLUE}변경 검증 프레임워크 의존성을 설치하시겠습니까? (y/n)${NC}"
  read answer
  if [ "$answer" = "y" ]; then
    echo -e "${BLUE}의존성 설치 중...${NC}"
    cd "$VALIDATION_DIR" && npm install
    if [ $? -ne 0 ]; then
      echo -e "${RED}의존성 설치에 실패했습니다.${NC}"
      echo -e "${YELLOW}Git 훅이 정상적으로 작동하지 않을 수 있습니다.${NC}"
      exit 1
    fi
    echo -e "${GREEN}의존성 설치가 완료되었습니다.${NC}"
  else
    echo -e "${YELLOW}의존성을 설치하지 않았습니다. Git 훅 실행 시 자동 설치를 시도합니다.${NC}"
  fi
fi

echo -e "${GREEN}모든 설정이 완료되었습니다.${NC}"
exit 0