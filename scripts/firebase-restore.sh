#!/bin/bash

# Firebase 복원 스크립트
# 이 스크립트는 Firebase 설정, 함수, 호스팅 및 Firestore 데이터를 복원합니다.
# 사용법: ./firebase-restore.sh [--direct]

# 현재 디렉토리가 프로젝트 루트인지 확인
if [ ! -f ".firebaserc" ]; then
    echo "오류: 이 스크립트는 프로젝트 루트 디렉토리에서 실행해야 합니다."
    exit 1
fi

# 명령행 인수 처리
DIRECT_MODE=false

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --direct) DIRECT_MODE=true; shift ;;
        *) echo "알 수 없는 옵션: $1"; exit 1 ;;
    esac
done

# 복원 모드 표시
if [ "$DIRECT_MODE" = true ]; then
    echo "Firebase 복원 시작 (직접 모드)..."
    NODE_CMD="node scripts/backup/firebase-data-restore.js --direct"
else
    echo "Firebase 복원 시작 (에뮬레이터 모드)..."
    NODE_CMD="node scripts/backup/firebase-data-restore.js"
fi

# 복원 실행
echo "실행 명령어: $NODE_CMD"
eval $NODE_CMD

# 종료 코드 확인
if [ $? -eq 0 ]; then
    echo "복원이 성공적으로 완료되었습니다."
else
    echo "복원 중 오류가 발생했습니다."
    exit 1
fi
