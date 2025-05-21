#!/bin/bash

# Firebase 에뮬레이터 시작 및 시드 데이터 로드 스크립트
# /users/voca/projects/db2/scripts/emulator/start-emulator.sh

# 디렉토리 경로 설정
PROJECT_ROOT="/users/voca/projects/db2"
EMULATOR_DIR="$PROJECT_ROOT/emulator-data"
SCRIPT_DIR="$PROJECT_ROOT/scripts/emulator"

# 로그 출력 함수
log() {
  echo -e "\033[0;36m[$(date '+%Y-%m-%d %H:%M:%S')]\033[0m $1"
}

# 에러 출력 함수
error() {
  echo -e "\033[0;31m[$(date '+%Y-%m-%d %H:%M:%S')]\033[0m $1" >&2
}

# 에뮬레이터 데이터 디렉토리 생성
if [ ! -d "$EMULATOR_DIR" ]; then
  log "에뮬레이터 데이터 디렉토리 생성: $EMULATOR_DIR"
  mkdir -p "$EMULATOR_DIR"
fi

# 에뮬레이터 데이터 초기화 여부 확인
RESET_DATA=false
SEED_DATA=false

# 명령행 인수 처리
while [[ $# -gt 0 ]]; do
  case $1 in
    --reset)
      RESET_DATA=true
      shift
      ;;
    --seed)
      SEED_DATA=true
      shift
      ;;
    *)
      shift
      ;;
  esac
done

# 에뮬레이터 데이터 초기화
if [ "$RESET_DATA" = true ]; then
  log "에뮬레이터 데이터 초기화 중..."
  if [ -d "$EMULATOR_DIR" ]; then
    rm -rf "$EMULATOR_DIR"/*
    log "에뮬레이터 데이터 초기화 완료"
  fi
fi

# .env 파일 확인 (없으면 예제 파일에서 복사)
if [ ! -f "$PROJECT_ROOT/.env.emulator" ]; then
  if [ -f "$PROJECT_ROOT/.env.example" ]; then
    log ".env.emulator 파일 생성 (예제 파일에서 복사)"
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env.emulator"
    
    # Firebase 프로젝트 ID 설정
    echo "FIREBASE_PROJECT_ID=db888-emulator" >> "$PROJECT_ROOT/.env.emulator"
    echo "ENV=development" >> "$PROJECT_ROOT/.env.emulator"
  else
    error "경고: .env.example 파일이 없습니다. .env.emulator 파일을 수동으로 생성해야 합니다."
  fi
fi

# 시드 데이터 복사 (Firebase UI에서 로드할 수 있도록)
SEED_EXPORT_DIR="$EMULATOR_DIR/seed-export"
if [ "$SEED_DATA" = true ] && [ -d "$SCRIPT_DIR/seeds" ]; then
  log "시드 데이터 내보내기 디렉토리 생성: $SEED_EXPORT_DIR"
  mkdir -p "$SEED_EXPORT_DIR"
  mkdir -p "$SEED_EXPORT_DIR/firestore_export/firestore_export.overall_export_metadata"
  
  # 필요한 메타데이터 파일 생성
  echo '{
  "collectionCount": 4,
  "collectionIds": [
    "users",
    "events",
    "eventParticipants",
    "gameTransactions"
  ]
}' > "$SEED_EXPORT_DIR/firestore_export/firestore_export.overall_export_metadata"
fi

# Firebase 에뮬레이터 시작
log "Firebase 에뮬레이터 시작 중..."
cd "$PROJECT_ROOT"

# 에뮬레이터 시작 (백그라운드로 실행)
firebase emulators:start --import="$SEED_EXPORT_DIR" --export-on-exit="$EMULATOR_DIR/export" &
EMULATOR_PID=$!

# 에뮬레이터가 시작될 때까지 대기
log "에뮬레이터 시작 대기 중..."
sleep 10

# 에뮬레이터가 실행 중인지 확인
if kill -0 $EMULATOR_PID 2>/dev/null; then
  log "Firebase 에뮬레이터가 성공적으로 시작되었습니다."
  
  # 시드 데이터 로드
  if [ "$SEED_DATA" = true ]; then
    log "시드 데이터 로드 중..."
    cd "$PROJECT_ROOT"
    
    # 환경 설정
    export FIRESTORE_EMULATOR_HOST="localhost:11004"
    
    # 시드 스크립트 실행
    node "$SCRIPT_DIR/seed-firestore.js"
    
    if [ $? -eq 0 ]; then
      log "시드 데이터 로드 완료"
    else
      error "시드 데이터 로드 중 오류 발생"
    fi
  fi
  
  log "에뮬레이터 UI는 http://localhost:11003 에서 접속할 수 있습니다."
  log "에뮬레이터 프로세스 ID: $EMULATOR_PID"
  log "에뮬레이터를 중지하려면 다음 명령어를 실행하세요: kill $EMULATOR_PID"
  
  # 에뮬레이터 PID 파일 저장
  echo $EMULATOR_PID > "$PROJECT_ROOT/.emulator.pid"
  
  # 에뮬레이터 프로세스 대기
  wait $EMULATOR_PID
else
  error "Firebase 에뮬레이터 시작 실패"
  exit 1
fi
