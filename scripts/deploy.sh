#!/bin/bash

# Firebase Hosting 배포 스크립트
# 고가치 사용자 분석 대시보드 배포

echo "===== DB2 대시보드 배포 시작 ====="

# 현재 디렉토리 확인
CURRENT_DIR=$(pwd)
echo "현재 디렉토리: $CURRENT_DIR"

# Firebase 로그인 확인
echo "Firebase 로그인 상태 확인 중..."
firebase login:list > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "Firebase에 로그인되어 있지 않습니다. 로그인을 시작합니다..."
  firebase login
else
  echo "Firebase에 이미 로그인되어 있습니다."
fi

# 빌드 디렉토리 생성 (필요한 경우)
echo "빌드 디렉토리 확인 중..."
if [ ! -d "./public" ]; then
  echo "public 디렉토리가 없습니다. 생성합니다..."
  mkdir -p ./public
fi

# 배포 환경 선택
echo ""
echo "어떤 환경에 배포하시겠습니까?"
select env in "개발" "스테이징" "프로덕션"; do
  case $env in
    개발)
      FIREBASE_PROJECT="db888-67827-dev"
      break
      ;;
    스테이징)
      FIREBASE_PROJECT="db888-67827-staging"
      break
      ;;
    프로덕션)
      FIREBASE_PROJECT="db888-67827"
      break
      ;;
    *)
      echo "올바른 옵션을 선택해주세요."
      ;;
  esac
done

echo "선택된 환경: $env (프로젝트: $FIREBASE_PROJECT)"
echo ""

# 환경 설정 파일 생성
echo "환경 설정 파일 생성 중..."
ENV_FILE="./public/js/dashboard/env.js"

cat > $ENV_FILE << EOL
// 환경 설정 파일 - $env 환경
window.ENV = {
  environment: "$env",
  version: "$(date +%Y%m%d%H%M%S)",
  buildTime: "$(date '+%Y-%m-%d %H:%M:%S')",
  apiUrl: "${env,,}-api.example.com"
};
EOL

echo "환경 설정 파일이 생성되었습니다: $ENV_FILE"

# 배포 전 Firebase 프로젝트 선택
echo "Firebase 프로젝트 설정 중: $FIREBASE_PROJECT"
firebase use $FIREBASE_PROJECT

# Firebase 함수 배포
echo ""
echo "Firebase Functions를 배포하시겠습니까? (y/n)"
read -r deploy_functions

if [[ $deploy_functions =~ ^[Yy]$ ]]; then
  echo "Firebase Functions 배포 중..."
  firebase deploy --only functions
else
  echo "Firebase Functions 배포를 건너뜁니다."
fi

# Firebase Hosting 배포
echo ""
echo "Firebase Hosting을 배포하시겠습니까? (y/n)"
read -r deploy_hosting

if [[ $deploy_hosting =~ ^[Yy]$ ]]; then
  echo "Firebase Hosting 배포 중..."
  firebase deploy --only hosting
else
  echo "Firebase Hosting 배포를 건너뜁니다."
fi

# Firestore 규칙 배포
echo ""
echo "Firestore 규칙을 배포하시겠습니까? (y/n)"
read -r deploy_firestore

if [[ $deploy_firestore =~ ^[Yy]$ ]]; then
  echo "Firestore 규칙 배포 중..."
  firebase deploy --only firestore
else
  echo "Firestore 규칙 배포를 건너뜁니다."
fi

echo ""
echo "===== DB2 대시보드 배포 완료 ====="
