#!/bin/bash

# Firebase 에뮬레이터 실행 스크립트
# 이 스크립트는 로컬 개발 및 테스트를 위한 Firebase 에뮬레이터를 실행합니다.

# 현재 디렉토리가 프로젝트 루트인지 확인
if [ ! -f ".firebaserc" ]; then
    echo "오류: 이 스크립트는 프로젝트 루트 디렉토리에서 실행해야 합니다."
    exit 1
fi

# 에뮬레이터 옵션 설정
EMULATOR_CONFIG="firebase.emulator.json"
EXPORT_PATH="./emulator-data"

# 명령행 인수 처리
IMPORT_DATA=false
EXPORT_ON_EXIT=false

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --import) IMPORT_DATA=true ;;
        --export) EXPORT_ON_EXIT=true ;;
        *) echo "알 수 없는 옵션: $1"; exit 1 ;;
    esac
    shift
done

# 필요한 디렉토리 생성
mkdir -p $EXPORT_PATH

# 에뮬레이터 실행 명령어 작성
EMULATOR_CMD="firebase emulators:start --config=$EMULATOR_CONFIG"

if [ "$IMPORT_DATA" = true ]; then
    EMULATOR_CMD="$EMULATOR_CMD --import=$EXPORT_PATH"
fi

if [ "$EXPORT_ON_EXIT" = true ]; then
    EMULATOR_CMD="$EMULATOR_CMD --export-on-exit=$EXPORT_PATH"
fi

# 실행 옵션 표시
echo "Firebase 에뮬레이터 실행 중..."
echo "UI: http://localhost:11003"
echo "Functions: http://localhost:11001"
echo "Hosting: http://localhost:11002"
echo "Firestore: http://localhost:11004"
echo "Auth: http://localhost:11007"
echo "Storage: http://localhost:11008"

# 에뮬레이터 명령어 표시
echo "\n실행 명령어: $EMULATOR_CMD\n"

# 에뮬레이터 실행
eval $EMULATOR_CMD
