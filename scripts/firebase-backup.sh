#!/bin/bash

# Firebase 백업 스크립트
# 이 스크립트는 Firebase 설정, 함수, 호스팅 및 Firestore 데이터를 백업합니다.
# 사용법: ./firebase-backup.sh [--direct] [메모]

# 현재 디렉토리가 프로젝트 루트인지 확인
if [ ! -f ".firebaserc" ]; then
    echo "오류: 이 스크립트는 프로젝트 루트 디렉토리에서 실행해야 합니다."
    exit 1
fi

# 명령행 인수 처리
DIRECT_MODE=false
MEMO=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --direct) DIRECT_MODE=true; shift ;;
        *) MEMO="$1"; shift ;;
    esac
done

# 백업 모드 표시
if [ "$DIRECT_MODE" = true ]; then
    echo "Firebase 백업 시작 (직접 모드)..."
    NODE_CMD="node scripts/backup/firebase-data-backup.js --direct"
else
    echo "Firebase 백업 시작 (에뮬레이터 모드)..."
    NODE_CMD="node scripts/backup/firebase-data-backup.js"
fi

# 백업 메모가 있으면 명령에 추가
if [ ! -z "$MEMO" ]; then
    NODE_CMD="$NODE_CMD \"$MEMO\""
fi

# 백업 실행
echo "실행 명령어: $NODE_CMD"
eval $NODE_CMD

# 종료 코드 확인
if [ $? -eq 0 ]; then
    echo "백업이 성공적으로 완료되었습니다."
else
    echo "백업 중 오류가 발생했습니다."
    exit 1
fi
