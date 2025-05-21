  # 정리 실행 (자동 응답을 위해 echo y | 사용)
  echo y | node scripts/backup/firebase-backup-manager.js clean --days=0 --keep=2
  if [ $? -ne 0 ]; then
    echo "백업 정리 테스트 실패"
    exit 1
  fi
  echo "백업 정리 테스트 성공"
  echo
fi

# 백업 복원 테스트 (선택적, 주의 필요)
if [ "$1" == "--with-restore" ]; then
  echo "6. 백업 복원 테스트 중..."
  # 가장 최근 백업 ID 가져오기
  BACKUP_ID=$(node scripts/backup/firebase-backup-manager.js list --limit=1 --format=json | grep -o '"id":"[^"]*' | cut -d'"' -f4)
  
  if [ -z "$BACKUP_ID" ]; then
    echo "복원할 백업을 찾을 수 없음"
    exit 1
  fi
  
  # 복원 실행 (자동 응답을 위해 echo y | 사용)
  echo "백업 ID $BACKUP_ID 복원 중..."
  echo y | node scripts/backup/firebase-backup-manager.js restore $BACKUP_ID
  if [ $? -ne 0 ]; then
    echo "백업 복원 테스트 실패"
    exit 1
  fi
  echo "백업 복원 테스트 성공"
  echo
fi

echo "==== 모든 테스트 성공적으로 완료 ===="
echo "백업 시스템이 정상적으로 작동합니다."
