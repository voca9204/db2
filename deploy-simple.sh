#!/bin/bash

# 기본 Firebase Functions 배포 스크립트
echo "DB2 프로젝트 - 기본 Firebase Functions 배포 스크립트"
echo "=================================================="
echo "시작 시간: $(date)"
echo

# 현재 디렉토리가 프로젝트 루트인지 확인
if [ ! -f ".firebaserc" ]; then
    echo "오류: 이 스크립트는 프로젝트 루트 디렉토리에서 실행해야 합니다."
    exit 1
fi

echo "1. 프로젝트 확인 및 초기화"
echo "-------------------------"
firebase projects:list
echo

echo "2. functions 디렉토리의 package.json 확인"
echo "------------------------------------"
cat functions/package.json | grep -E "name|description|engines|dependencies"
echo

echo "3. functions/index.js 확인"
echo "----------------------"
cat functions/index.js | grep -E "exports|function"
echo

echo "4. Firebase Functions 배포 시작"
echo "---------------------------"
firebase deploy --only functions

echo
echo "5. 배포 완료 정보"
echo "-------------"
echo "배포 완료 시간: $(date)"
echo "다음 URL에서 함수를 확인할 수 있습니다:"
echo "- helloWorld: https://us-central1-db888-67827.cloudfunctions.net/helloWorld"
echo "- healthCheck: https://us-central1-db888-67827.cloudfunctions.net/healthCheck"
echo
echo "6. 함수 상태 확인"
echo "-------------"
echo "다음 명령어로 함수 목록을 확인할 수 있습니다:"
echo "  firebase functions:list"
