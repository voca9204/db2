#!/bin/bash

# Firebase 개발 환경 설정 스크립트
# 이 스크립트는 Firebase 로컬 개발 환경을 설정합니다.
# 사용법: ./setup-dev-env.sh [--force]

# 색상 설정
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 스크립트 실행 시작
echo -e "${BLUE}Firebase 개발 환경 설정을 시작합니다...${NC}"

# 현재 디렉토리가 프로젝트 루트인지 확인
if [ ! -f ".firebaserc" ]; then
    echo -e "${RED}오류: 이 스크립트는 프로젝트 루트 디렉토리에서 실행해야 합니다.${NC}"
    exit 1
fi

# 명령행 인수 처리
FORCE=false

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --force) FORCE=true; shift ;;
        *) echo -e "${RED}알 수 없는 옵션: $1${NC}"; exit 1 ;;
    esac
done

# 필요한 디렉토리 생성
echo -e "${BLUE}필요한 디렉토리를 생성합니다...${NC}"
mkdir -p backup
mkdir -p emulator-data
mkdir -p logs
mkdir -p data/test/results
mkdir -p firebase

# Firebase 설정 파일 확인
echo -e "${BLUE}Firebase 설정 파일을 확인합니다...${NC}"

# .firebaserc 파일 확인 및 생성
if [ ! -f ".firebaserc" ] || [ "$FORCE" = true ]; then
    echo -e "${YELLOW}Firebase 프로젝트 설정 파일(.firebaserc)을 생성합니다...${NC}"
    echo '{
  "projects": {
    "default": "db888"
  }
}' > .firebaserc
    echo -e "${GREEN}.firebaserc 파일이 생성되었습니다.${NC}"
fi

# firebase.json 파일 확인 및 생성
if [ ! -f "firebase.json" ] || [ "$FORCE" = true ]; then
    echo -e "${YELLOW}Firebase 구성 파일(firebase.json)을 생성합니다...${NC}"
    echo '{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": "functions",
    "predeploy": [
      "npm --prefix \"$RESOURCE_DIR\" run lint"
    ],
    "codebase": "default",
    "runtime": "nodejs18",
    "gen": 2
  },
  "hosting": {
    "public": "public",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "/api/v1/users/high-value/analysis",
        "function": "highValueUsersAnalysis"
      },
      {
        "source": "/api/v1/users/high-value/report",
        "function": "highValueUserReport"
      },
      {
        "source": "/highValueUserReport",
        "function": "highValueUserReport"
      },
      {
        "source": "/api/v1/users/high-value/active",
        "function": "activeUsers"
      },
      {
        "source": "/api/v1/users/high-value/dormant",
        "function": "dormantUsers"
      },
      {
        "source": "/api/v1/health",
        "function": "healthCheck"
      },
      {
        "source": "/api/v1/test/db",
        "function": "testDbConnection"
      },
      {
        "source": "/api/v1/hello",
        "function": "helloWorld"
      }
    ]
  }
}' > firebase.json
    echo -e "${GREEN}firebase.json 파일이 생성되었습니다.${NC}"
fi

# firebase.emulator.json 파일 확인 및 생성
if [ ! -f "firebase.emulator.json" ] || [ "$FORCE" = true ]; then
    echo -e "${YELLOW}Firebase 에뮬레이터 구성 파일(firebase.emulator.json)을 생성합니다...${NC}"
    echo '{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": "functions",
    "predeploy": [
      "npm --prefix \"$RESOURCE_DIR\" run lint"
    ],
    "codebase": "default",
    "runtime": "nodejs18",
    "gen": 2
  },
  "hosting": {
    "public": "public",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "/api/v1/users/high-value/analysis",
        "function": "highValueUsersAnalysis"
      },
      {
        "source": "/api/v1/users/high-value/report",
        "function": "highValueUserReport"
      },
      {
        "source": "/highValueUserReport",
        "function": "highValueUserReport"
      },
      {
        "source": "/api/v1/users/high-value/active",
        "function": "activeUsers"
      },
      {
        "source": "/api/v1/users/high-value/dormant",
        "function": "dormantUsers"
      },
      {
        "source": "/api/v1/health",
        "function": "healthCheck"
      },
      {
        "source": "/api/v1/test/db",
        "function": "testDbConnection"
      },
      {
        "source": "/api/v1/hello",
        "function": "helloWorld"
      }
    ]
  },
  "emulators": {
    "functions": {
      "port": 11001
    },
    "hosting": {
      "port": 11002
    },
    "ui": {
      "enabled": true,
      "port": 11003
    },
    "firestore": {
      "port": 11004
    },
    "hub": {
      "port": 11005
    },
    "logging": {
      "port": 11006
    },
    "auth": {
      "port": 11007
    },
    "storage": {
      "port": 11008
    }
  }
}' > firebase.emulator.json
    echo -e "${GREEN}firebase.emulator.json 파일이 생성되었습니다.${NC}"
fi

# firestore.rules 파일 확인 및 생성
if [ ! -f "firestore.rules" ] || [ "$FORCE" = true ]; then
    echo -e "${YELLOW}Firestore 보안 규칙 파일(firestore.rules)을 생성합니다...${NC}"
    echo 'rules_version = "2";
service cloud.firestore {
  match /databases/{database}/documents {
    // 인증된 사용자만 읽기 가능
    match /{document=**} {
      allow read: if request.auth != null;
    }
    
    // 사용자 컬렉션 규칙
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId || 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
    }
    
    // 고가치 사용자 컬렉션 규칙
    match /highValueUsers/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ["admin", "analyst"];
    }
    
    // 이벤트 컬렉션 규칙
    match /events/{eventId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ["admin", "analyst"];
    }
    
    // 이벤트 참여 컬렉션 규칙
    match /eventParticipations/{participationId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ["admin", "analyst"];
    }
  }
}' > firestore.rules
    echo -e "${GREEN}firestore.rules 파일이 생성되었습니다.${NC}"
fi

# firestore.indexes.json 파일 확인 및 생성
if [ ! -f "firestore.indexes.json" ] || [ "$FORCE" = true ]; then
    echo -e "${YELLOW}Firestore 인덱스 파일(firestore.indexes.json)을 생성합니다...${NC}"
    echo '{
  "indexes": [
    {
      "collectionGroup": "highValueUsers",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "status",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "netBet",
          "order": "DESCENDING"
        }
      ]
    },
    {
      "collectionGroup": "eventParticipations",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "userId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "participationDate",
          "order": "DESCENDING"
        }
      ]
    }
  ],
  "fieldOverrides": []
}' > firestore.indexes.json
    echo -e "${GREEN}firestore.indexes.json 파일이 생성되었습니다.${NC}"
fi

# 스크립트 파일에 실행 권한 부여
echo -e "${BLUE}스크립트 파일에 실행 권한을 부여합니다...${NC}"
chmod +x scripts/firebase-backup.sh scripts/firebase-restore.sh scripts/start-emulator.sh scripts/deploy.sh scripts/deploy_functions.sh scripts/run-function-tests.sh

# 완료 메시지
echo -e "${GREEN}Firebase 개발 환경 설정이 완료되었습니다!${NC}"
echo -e "${BLUE}다음 명령어로 에뮬레이터를 시작할 수 있습니다:${NC}"
echo -e "${YELLOW}./scripts/start-emulator.sh${NC}"
echo -e "${BLUE}다음 명령어로 데이터를 백업할 수 있습니다:${NC}"
echo -e "${YELLOW}./scripts/firebase-backup.sh${NC}"
echo -e "${BLUE}다음 명령어로 데이터를 복원할 수 있습니다:${NC}"
echo -e "${YELLOW}./scripts/firebase-restore.sh${NC}"
