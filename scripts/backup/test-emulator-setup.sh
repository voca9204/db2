#!/bin/bash

# Firebase 에뮬레이터 설정 테스트 스크립트
# 이 스크립트는 Firebase 에뮬레이터 설정 도구의 기능을 테스트합니다.

echo "==== Firebase 에뮬레이터 설정 테스트 시작 ===="
echo 

# 현재 디렉토리가 프로젝트 루트인지 확인
if [ ! -f "firebase.json" ]; then
  echo "오류: 이 스크립트는 프로젝트 루트 디렉토리에서 실행해야 합니다."
  exit 1
fi

# 에뮬레이터 설정 테스트
echo "1. 에뮬레이터 기본 설정 구성 테스트 중..."
node scripts/backup/firebase-emulator-setup.js setup
if [ $? -ne 0 ]; then
  echo "에뮬레이터 설정 테스트 실패"
  exit 1
fi
echo "에뮬레이터 설정 테스트 성공"
echo

# 에뮬레이터 설정 파일 확인
echo "2. 에뮬레이터 설정 파일 확인 중..."
if [ ! -f "firebase.emulator.json" ]; then
  echo "오류: firebase.emulator.json 파일이 생성되지 않았습니다."
  exit 1
fi
if [ ! -f ".env.emulator" ]; then
  echo "오류: .env.emulator 파일이 생성되지 않았습니다."
  exit 1
fi
echo "에뮬레이터 설정 파일 확인 성공"
echo

# 환경 전환 테스트
echo "3. 환경 전환 테스트 중..."
# 현재 환경 백업
if [ -f ".env" ]; then
  cp .env .env.orig
  echo "현재 .env 파일 백업 완료"
fi

# 개발 환경으로 전환
echo "3.1. 개발 환경으로 전환 중..."
node scripts/backup/firebase-emulator-setup.js switch dev
if [ $? -ne 0 ]; then
  echo "개발 환경 전환 테스트 실패"
  # 원래 환경 복원
  if [ -f ".env.orig" ]; then
    mv .env.orig .env
  fi
  exit 1
fi

# 에뮬레이터 환경으로 전환
echo "3.2. 에뮬레이터 환경으로 전환 중..."
cp .env.emulator .env
if [ $? -ne 0 ]; then
  echo "에뮬레이터 환경 전환 테스트 실패"
  # 원래 환경 복원
  if [ -f ".env.orig" ]; then
    mv .env.orig .env
  fi
  exit 1
fi

# 원래 환경 복원
if [ -f ".env.orig" ]; then
  mv .env.orig .env
  echo "원래 환경 복원 완료"
fi
echo "환경 전환 테스트 성공"
echo

# 에뮬레이터 스키마 파일 확인
echo "4. 에뮬레이터 스키마 파일 확인 중..."
if [ ! -f "scripts/backup/firebase-emulator-schema.js" ]; then
  echo "오류: firebase-emulator-schema.js 파일이 생성되지 않았습니다."
  exit 1
fi
echo "에뮬레이터 스키마 파일 확인 성공"
echo

echo "==== 모든 테스트 성공적으로 완료 ===="
echo "Firebase 에뮬레이터 설정이 완료되었습니다."
echo
echo "다음 명령으로 에뮬레이터를 시작할 수 있습니다:"
echo "  firebase emulators:start --import=emulator-data --export-on-exit"
echo
echo "에뮬레이터 실행 후 다음 명령으로 테스트 데이터를 생성할 수 있습니다:"
echo "  node scripts/backup/firebase-emulator-setup.js seed --sample"
echo
