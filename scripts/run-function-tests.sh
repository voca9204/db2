#!/bin/bash
# Firebase 에뮬레이터 실행 및 테스트 스크립트

echo "Starting Firebase emulators..."
firebase use db888-dev
firebase emulators:start --only functions,firestore --project=db888-dev &

# 에뮬레이터가 시작될 때까지 기다림
echo "Waiting for emulators to start..."
sleep 15

# 테스트 실행
echo "Running function tests..."
cd functions
npm run test:functions

# 테스트 결과 저장
TEST_RESULT=$?

# 에뮬레이터 종료
echo "Stopping emulators..."
pkill -P $$

# 테스트 결과에 따라 종료
if [ $TEST_RESULT -eq 0 ]; then
    echo "✅ Tests completed successfully!"
    exit 0
else
    echo "❌ Tests failed!"
    exit 1
fi
