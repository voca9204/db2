#!/bin/bash

# 기존 Firebase Functions 삭제 스크립트
echo "DB2 프로젝트 - 기존 Firebase Functions 삭제 스크립트"
echo "================================================="
echo "시작 시간: $(date)"
echo

# 현재 디렉토리가 프로젝트 루트인지 확인
if [ ! -f ".firebaserc" ]; then
    echo "오류: 이 스크립트는 프로젝트 루트 디렉토리에서 실행해야 합니다."
    exit 1
fi

echo "1. 기존 Functions 삭제"
echo "--------------------"
firebase functions:delete activeUsers --region us-central1 --force
firebase functions:delete dormantUsers --region us-central1 --force
firebase functions:delete inactiveUsers --region us-central1 --force
firebase functions:delete highValueUsersAnalysis --region asia-northeast3 --force
firebase functions:delete eventParticipants --region us-central1 --force
firebase functions:delete depositAfterEvent --region us-central1 --force
firebase functions:delete inactiveUsersDashboard --region us-central1 --force
firebase functions:delete highValueUserReport --region us-central1 --force
firebase functions:delete testDbConnection --region us-central1 --force
firebase functions:delete helloWorld --region us-central1 --force
firebase functions:delete healthCheck --region us-central1 --force

echo
echo "2. 삭제 완료"
echo "---------"
echo "완료 시간: $(date)"
