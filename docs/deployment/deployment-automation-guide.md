# 배포 자동화 설정 가이드

이 문서는 비활성 사용자 이벤트 분석 시스템의 배포 자동화를 위한 설정 및 절차를 설명합니다. GitHub Actions를 활용한 CI/CD 파이프라인 설정과 환경별 배포 전략을 다룹니다.

## GitHub Actions 워크플로우

비활성 사용자 이벤트 분석 시스템의 자동화된 배포를 위해 다음 GitHub Actions 워크플로우 파일을 사용합니다.

### Firebase Functions 배포 워크플로우

`.github/workflows/deploy-functions.yml` 파일:

```yaml
name: Deploy Firebase Functions

on:
  push:
    branches:
      - main
      - staging
    paths:
      - 'functions/**'
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy to'
        required: true
        default: 'development'
        type: choice
        options:
          - development
          - staging
          - production
      functions:
        description: 'Specific functions to deploy (comma-separated, leave empty for all)'
        required: false
        type: string

jobs:
  deploy-functions:
    name: Deploy Firebase Functions
    runs-on: ubuntu-latest
    environment: ${{ github.event_name == 'workflow_dispatch' && inputs.environment || github.ref == 'refs/heads/main' && 'production' || 'staging' }}
    
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: 'functions/package-lock.json'

      - name: Install Dependencies
        working-directory: ./functions
        run: npm ci

      - name: Run Lint and Tests
        working-directory: ./functions
        run: |
          npm run lint
          npm test

      - name: Set Environment Variables
        working-directory: ./functions
        run: |
          echo "DEPLOY_ENVIRONMENT=${{ github.event_name == 'workflow_dispatch' && inputs.environment || github.ref == 'refs/heads/main' && 'production' || 'staging' }}" >> $GITHUB_ENV
          echo "DEPLOY_FUNCTIONS=${{ github.event.inputs.functions || '' }}" >> $GITHUB_ENV

      - name: Authenticate to Firebase
        uses: 'google-github-actions/auth@v1'
        with:
          credentials_json: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'

      - name: Set up Firebase CLI
        run: npm install -g firebase-tools

      - name: Select Firebase Project
        run: |
          if [ "${{ env.DEPLOY_ENVIRONMENT }}" = "production" ]; then
            firebase use db2-prod
          elif [ "${{ env.DEPLOY_ENVIRONMENT }}" = "staging" ]; then
            firebase use db2-staging
          else
            firebase use db2-dev
          fi

      - name: Deploy Firebase Functions
        working-directory: ./functions
        run: |
          if [ -z "${{ env.DEPLOY_FUNCTIONS }}" ]; then
            echo "Deploying all functions to ${{ env.DEPLOY_ENVIRONMENT }} environment..."
            node scripts/deploy/deploy-functions.js ${{ env.DEPLOY_ENVIRONMENT }}
          else
            echo "Deploying specific functions: ${{ env.DEPLOY_FUNCTIONS }} to ${{ env.DEPLOY_ENVIRONMENT }} environment..."
            node scripts/deploy/deploy-functions.js ${{ env.DEPLOY_ENVIRONMENT }} ${{ env.DEPLOY_FUNCTIONS }}
          fi

      - name: Record Deployment
        working-directory: ./functions
        run: node scripts/deploy/deployment-manager.js record ${{ env.DEPLOY_ENVIRONMENT }}

      - name: Run Post-deployment Tests
        working-directory: ./functions
        run: |
          if [ "${{ env.DEPLOY_ENVIRONMENT }}" != "production" ]; then
            echo "Running integration tests against deployed functions..."
            npm run test:integration
          fi
```

### Dash 대시보드 배포 워크플로우

`.github/workflows/deploy-dashboard.yml` 파일:

```yaml
name: Deploy Dashboard

on:
  push:
    branches:
      - main
      - staging
    paths:
      - 'src/visualization/**'
      - 'scripts/run_dashboard.py'
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy to'
        required: true
        default: 'development'
        type: choice
        options:
          - development
          - staging
          - production

jobs:
  deploy-dashboard:
    name: Deploy Dash Dashboard
    runs-on: ubuntu-latest
    environment: ${{ github.event_name == 'workflow_dispatch' && inputs.environment || github.ref == 'refs/heads/main' && 'production' || 'staging' }}
    
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v3

      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.9'
          cache: 'pip'
          cache-dependency-path: 'requirements.txt'

      - name: Install Dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install gunicorn

      - name: Run Tests
        run: |
          pytest tests/visualization/

      - name: Set Environment Variables
        run: |
          echo "DEPLOY_ENVIRONMENT=${{ github.event_name == 'workflow_dispatch' && inputs.environment || github.ref == 'refs/heads/main' && 'production' || 'staging' }}" >> $GITHUB_ENV

      - name: Build Dashboard Package
        run: |
          mkdir -p deployment/dashboard
          cp -r src/visualization deployment/dashboard/
          cp scripts/run_dashboard.py deployment/dashboard/
          cp requirements.txt deployment/dashboard/
          
          # 환경별 구성 설정
          if [ "${{ env.DEPLOY_ENVIRONMENT }}" = "production" ]; then
            echo "ENVIRONMENT=production" > deployment/dashboard/.env
            echo "DASH_DEBUG=False" >> deployment/dashboard/.env
            echo "CACHE_TIMEOUT=300" >> deployment/dashboard/.env
          elif [ "${{ env.DEPLOY_ENVIRONMENT }}" = "staging" ]; then
            echo "ENVIRONMENT=staging" > deployment/dashboard/.env
            echo "DASH_DEBUG=False" >> deployment/dashboard/.env
            echo "CACHE_TIMEOUT=120" >> deployment/dashboard/.env
          else
            echo "ENVIRONMENT=development" > deployment/dashboard/.env
            echo "DASH_DEBUG=True" >> deployment/dashboard/.env
            echo "CACHE_TIMEOUT=60" >> deployment/dashboard/.env
          fi
          
          # 서버 시작 스크립트 생성
          cat << EOF > deployment/dashboard/start_server.sh
          #!/bin/bash
          source .env
          gunicorn --workers 4 --threads 2 --timeout 120 --bind 0.0.0.0:\${PORT:-8050} run_dashboard:server
          EOF
          
          chmod +x deployment/dashboard/start_server.sh
          
          # 패키지 생성
          cd deployment
          tar -czvf dashboard-${{ env.DEPLOY_ENVIRONMENT }}.tar.gz dashboard/

      - name: Authenticate to Google Cloud
        uses: 'google-github-actions/auth@v1'
        with:
          credentials_json: '${{ secrets.GCP_SERVICE_ACCOUNT }}'

      - name: Deploy to Google Cloud Run
        uses: 'google-github-actions/deploy-cloudrun@v1'
        with:
          service: 'inactive-user-dashboard-${{ env.DEPLOY_ENVIRONMENT }}'
          source: 'deployment/dashboard/'
          region: 'asia-northeast3'
          env_vars: |
            ENVIRONMENT=${{ env.DEPLOY_ENVIRONMENT }}
            DATABASE_HOST=211.248.190.46
            DATABASE_USER=hermes
            DATABASE_PASSWORD=mcygicng!022
            DATABASE_NAME=hermes

      - name: Run Post-deployment Tests
        if: env.DEPLOY_ENVIRONMENT != 'production'
        run: |
          echo "Running smoke tests against deployed dashboard..."
          python scripts/tests/test_dashboard_deployment.py --url ${{ steps.deploy.outputs.url }}
```

## 환경별 구성 전략

### 개발(Development) 환경 구성

개발 환경은 새로운 기능 개발 및 테스트를 위한 환경입니다.

1. **Firebase Functions 구성**:
   - 프로젝트: `db2-dev`
   - 메모리: 최소 설정 (256MB)
   - 인스턴스: 최소 0 (콜드 스타트 허용)
   - 환경 변수:
     ```
     NODE_ENV=development
     LOGGING_LEVEL=debug
     ENABLE_CACHE=false
     ```

2. **대시보드 구성**:
   - 디버그 모드 활성화
   - 실시간 리로딩 활성화
   - 캐싱 비활성화 또는 최소화 (빠른 개발 피드백)

### 스테이징(Staging) 환경 구성

스테이징 환경은 프로덕션 배포 전 검증을 위한 환경입니다.

1. **Firebase Functions 구성**:
   - 프로젝트: `db2-staging`
   - 메모리: 512MB
   - 인스턴스: 최소 0 (비용 효율적)
   - 환경 변수:
     ```
     NODE_ENV=staging
     LOGGING_LEVEL=info
     ENABLE_CACHE=true
     CACHE_TTL_SECONDS=300
     ```

2. **대시보드 구성**:
   - 디버그 모드 비활성화
   - 프로덕션과 동일한 환경 설정
   - 프로덕션과 동일한 데이터베이스 샘플 데이터

### 프로덕션(Production) 환경 구성

프로덕션 환경은 실제 사용자가 이용하는 라이브 환경입니다.

1. **Firebase Functions 구성**:
   - 프로젝트: `db2-prod`
   - 메모리: API 512MB, 분석 작업 1GB
   - 인스턴스: 최소 1 (콜드 스타트 방지)
   - 환경 변수:
     ```
     NODE_ENV=production
     LOGGING_LEVEL=info
     ENABLE_CACHE=true
     CACHE_TTL_SECONDS=600
     ```

2. **대시보드 구성**:
   - 고가용성 설정 (워커 수 증가)
   - 캐싱 최적화 (장기 캐싱)
   - 보안 강화 (HTTPS, 인증 필수)

## 비밀 및 환경 변수 관리

GitHub Actions 비밀 설정:

1. **Firebase 서비스 계정 설정**:
   - GitHub 저장소 Settings > Secrets > Actions로 이동
   - `FIREBASE_SERVICE_ACCOUNT` 비밀 추가
   - JSON 형식의 Firebase 서비스 계정 키 내용 붙여넣기

2. **GCP 서비스 계정 설정**:
   - `GCP_SERVICE_ACCOUNT` 비밀 추가
   - JSON 형식의 GCP 서비스 계정 키 내용 붙여넣기

3. **데이터베이스 자격 증명 설정**:
   - 환경별로 데이터베이스 자격 증명 비밀 추가
   - Firebase 및 Cloud Run 환경 변수로 사용

## 배포 유효성 검사 및 롤백

### 유효성 검사 테스트

각 배포 후 자동 유효성 검사:

1. **API 유효성 검사**:
   ```javascript
   // tests/integration/api.test.js
   const axios = require('axios');
   
   describe('API Endpoints', () => {
     const API_URL = process.env.API_URL || 'https://api.example.com';
     
     test('Health check endpoint returns 200', async () => {
       const response = await axios.get(`${API_URL}/health`);
       expect(response.status).toBe(200);
       expect(response.data.status).toBe('ok');
     });
     
     test('Inactive users endpoint returns valid data', async () => {
       const response = await axios.get(`${API_URL}/api/v1/users/inactive?days=30`);
       expect(response.status).toBe(200);
       expect(Array.isArray(response.data)).toBe(true);
     });
     
     // 추가 테스트...
   });
   ```

2. **대시보드 유효성 검사**:
   ```python
   # scripts/tests/test_dashboard_deployment.py
   import argparse
   import requests
   from bs4 import BeautifulSoup
   
   def test_dashboard_deployment(url):
       response = requests.get(url)
       assert response.status_code == 200
       
       soup = BeautifulSoup(response.text, 'html.parser')
       assert soup.title.text.strip() == '비활성 사용자 분석 대시보드'
       
       # 주요 컴포넌트 확인
       assert soup.find(id='app-container') is not None
       assert soup.find(id='conversion-chart') is not None
       
       print("Dashboard deployment validation successful!")
   
   if __name__ == '__main__':
       parser = argparse.ArgumentParser()
       parser.add_argument('--url', required=True, help='Dashboard URL to test')
       args = parser.parse_args()
       
       test_dashboard_deployment(args.url)
   ```

### 자동 롤백 메커니즘

배포 실패 시 자동 롤백:

1. **배포 기록 관리**:
   ```javascript
   // functions/scripts/deploy/deployment-manager.js
   const fs = require('fs');
   const { execSync } = require('child_process');
   
   function recordDeployment(environment) {
     const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
     const gitHash = execSync('git rev-parse --short HEAD').toString().trim();
     const version = `${environment}-${timestamp}-${gitHash}`;
     
     // 배포 정보 기록
     const deploymentInfo = {
       version,
       environment,
       timestamp: new Date().toISOString(),
       gitHash,
       functions: getFunctionsList(),
       deployer: process.env.GITHUB_ACTOR || 'unknown'
     };
     
     fs.mkdirSync('deployments', { recursive: true });
     fs.writeFileSync(`deployments/${version}.json`, JSON.stringify(deploymentInfo, null, 2));
     
     // 현재 버전 표시
     fs.writeFileSync(`deployments/${environment}-current.txt`, version);
     
     console.log(`Deployment recorded: ${version}`);
     return version;
   }
   
   function rollback(environment, version) {
     const currentVersion = version || getPreviousVersion(environment);
     if (!currentVersion) {
       console.error('No previous version found to rollback to');
       process.exit(1);
     }
     
     console.log(`Rolling back to version: ${currentVersion}`);
     
     const deploymentInfo = JSON.parse(fs.readFileSync(`deployments/${currentVersion}.json`));
     
     // 이전 버전으로 롤백
     const functionsList = deploymentInfo.functions.join(',');
     execSync(`node scripts/deploy/deploy-functions.js ${environment} ${functionsList} --rollback=${currentVersion}`);
     
     console.log(`Successfully rolled back to version: ${currentVersion}`);
   }
   
   module.exports = {
     recordDeployment,
     rollback
   };
   ```

2. **유효성 검사 실패 시 롤백**:
   ```yaml
   # 워크플로우 파일에 추가
   - name: Run Post-deployment Tests
     id: post_deploy_tests
     working-directory: ./functions
     run: |
       if [ "${{ env.DEPLOY_ENVIRONMENT }}" != "production" ]; then
         echo "Running integration tests against deployed functions..."
         npm run test:integration
       fi
     continue-on-error: true

   - name: Auto Rollback on Test Failure
     if: steps.post_deploy_tests.outcome == 'failure'
     working-directory: ./functions
     run: |
       echo "Post-deployment tests failed. Rolling back to previous version..."
       node scripts/deploy/deployment-manager.js rollback ${{ env.DEPLOY_ENVIRONMENT }}
       exit 1
   ```

## 배포 모니터링 및 알림

### 배포 알림 설정

Slack 알림 통합:

```yaml
# 워크플로우 파일에 추가
- name: Send Deployment Notification
  uses: slackapi/slack-github-action@v1.23.0
  with:
    channel-id: 'deployments'
    slack-message: |
      *${{ github.repository }}* deployment to *${{ env.DEPLOY_ENVIRONMENT }}* environment
      
      Status: ${{ job.status }}
      Commit: ${{ github.event.head_commit.message }}
      Author: ${{ github.actor }}
      URL: ${{ steps.deploy.outputs.url || 'N/A' }}
  env:
    SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
  if: always()
```

### 배포 대시보드

배포 내역 및 상태 확인 도구:

```html
<!-- dashboard/deployment-status.html -->
<!DOCTYPE html>
<html>
<head>
  <title>DB2 - 배포 상태 대시보드</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css">
</head>
<body>
  <div class="container mt-4">
    <h1>DB2 배포 상태 대시보드</h1>
    
    <div class="row mt-4">
      <div class="col-md-4">
        <div class="card">
          <div class="card-header bg-primary text-white">
            개발 환경
          </div>
          <div class="card-body">
            <div id="dev-status">로딩 중...</div>
          </div>
        </div>
      </div>
      
      <div class="col-md-4">
        <div class="card">
          <div class="card-header bg-warning text-dark">
            스테이징 환경
          </div>
          <div class="card-body">
            <div id="staging-status">로딩 중...</div>
          </div>
        </div>
      </div>
      
      <div class="col-md-4">
        <div class="card">
          <div class="card-header bg-success text-white">
            프로덕션 환경
          </div>
          <div class="card-body">
            <div id="prod-status">로딩 중...</div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="row mt-4">
      <div class="col">
        <h2>최근 배포 내역</h2>
        <table class="table table-striped" id="deployment-history">
          <thead>
            <tr>
              <th>버전</th>
              <th>환경</th>
              <th>배포 시간</th>
              <th>배포자</th>
              <th>상태</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            <!-- JavaScript로 채워짐 -->
          </tbody>
        </table>
      </div>
    </div>
  </div>
  
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/js/bootstrap.bundle.min.js"></script>
  <script src="deployment-dashboard.js"></script>
</body>
</html>
```

## 결론

이 배포 자동화 설정 가이드는 GitHub Actions를 활용한 CI/CD 파이프라인을 구축하고, 환경별 구성 전략을 수립하여 비활성 사용자 이벤트 분석 시스템의 안정적이고 효율적인 배포를 가능하게 합니다. 이 가이드를 통해 개발, 테스트, 배포 프로세스를 자동화하고 일관성 있게 유지할 수 있습니다.

특히, 다음과 같은 이점을 제공합니다:

1. **자동화된 배포 프로세스**:
   - 코드 병합 또는 수동 트리거로 자동 배포
   - 환경별 구성 자동 적용
   - 배포 후 유효성 검사 자동화

2. **안정성 향상**:
   - 배포 실패 시 자동 롤백 메커니즘
   - 환경별 테스트 자동화
   - 배포 기록 관리 및 추적

3. **투명성 및 모니터링**:
   - 배포 상태 대시보드
   - Slack 알림 통합
   - 상세한 배포 기록 관리

이 가이드를 기반으로 비활성 사용자 이벤트 분석 시스템의 CI/CD 파이프라인을 구축하고 운영하면, 개발 팀은 코드 품질과 기능 개발에 집중하고, 배포 프로세스는 안정적이고 예측 가능하게 자동화할 수 있습니다.
