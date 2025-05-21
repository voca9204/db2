#!/bin/bash

# Firebase 에뮬레이터 중지 스크립트
# /users/voca/projects/db2/scripts/emulator/stop-emulator.sh

# 디렉토리 경로 설정
PROJECT_ROOT="/users/voca/projects/db2"
PID_FILE="$PROJECT_ROOT/.emulator.pid"

# 로그 출력 함수
log() {
  echo -e "\033[0;36m[$(date '+%Y-%m-%d %H:%M:%S')]\033[0m $1"
}

# 에러 출력 함수
error() {
  echo -e "\033[0;31m[$(date '+%Y-%m-%d %H:%M:%S')]\033[0m $1" >&2
}

# PID 파일 확인
if [ -f "$PID_FILE" ]; then
  EMULATOR_PID=$(cat "$PID_FILE")
  
  # 프로세스가 실행 중인지 확인
  if kill -0 $EMULATOR_PID 2>/dev/null; then
    log "Firebase 에뮬레이터(PID: $EMULATOR_PID) 중지 중..."
    
    # 먼저 SIGINT로 에뮬레이터 종료 시도 (데이터 내보내기 가능)
    kill -INT $EMULATOR_PID
    
    # 종료될 때까지 최대 10초 대기
    for i in {1..10}; do
      if ! kill -0 $EMULATOR_PID 2>/dev/null; then
        break
      fi
      sleep 1
    done
    
    # 여전히 실행 중이면 강제 종료
    if kill -0 $EMULATOR_PID 2>/dev/null; then
      log "에뮬레이터가 정상적으로 종료되지 않아 강제 종료합니다..."
      kill -KILL $EMULATOR_PID
    fi
    
    # PID 파일 삭제
    rm "$PID_FILE"
    
    log "Firebase 에뮬레이터가 성공적으로 중지되었습니다."
  else
    error "에뮬레이터 프로세스($EMULATOR_PID)가 실행 중이 아닙니다."
    rm "$PID_FILE"
  fi
else
  # 에뮬레이터 관련 프로세스 검색 및 종료
  log "PID 파일이 없습니다. 실행 중인 에뮬레이터 프로세스를 검색합니다..."
  
  EMULATOR_PIDS=$(ps -ef | grep "firebase emulators:start" | grep -v grep | awk '{print $2}')
  
  if [ -n "$EMULATOR_PIDS" ]; then
    log "Firebase 에뮬레이터 프로세스를 찾았습니다: $EMULATOR_PIDS"
    
    for pid in $EMULATOR_PIDS; do
      log "프로세스 종료 중: $pid"
      kill -INT $pid
      
      # 종료될 때까지 최대 5초 대기
      for i in {1..5}; do
        if ! kill -0 $pid 2>/dev/null; then
          break
        fi
        sleep 1
      done
      
      # 여전히 실행 중이면 강제 종료
      if kill -0 $pid 2>/dev/null; then
        log "프로세스($pid)가 정상적으로 종료되지 않아 강제 종료합니다..."
        kill -KILL $pid
      fi
    done
    
    log "Firebase 에뮬레이터가 성공적으로 중지되었습니다."
  else
    log "실행 중인 Firebase 에뮬레이터 프로세스를 찾을 수 없습니다."
  fi
fi

# 자바 에뮬레이터 프로세스 검색 및 종료 (종종 남아있는 경우)
JAVA_EMULATOR_PIDS=$(ps -ef | grep "com.google.cloud.datastore.emulator.CloudDatastore" | grep -v grep | awk '{print $2}')

if [ -n "$JAVA_EMULATOR_PIDS" ]; then
  log "남아있는 Java 에뮬레이터 프로세스를 찾았습니다: $JAVA_EMULATOR_PIDS"
  
  for pid in $JAVA_EMULATOR_PIDS; do
    log "Java 프로세스 종료 중: $pid"
    kill -KILL $pid
  done
  
  log "모든 남아있는 에뮬레이터 프로세스가 종료되었습니다."
fi

exit 0
