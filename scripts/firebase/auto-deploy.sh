#!/bin/bash
# auto-deploy.sh
#
# Firebase Functions 자동 배포 스크립트
# 
# 이 스크립트는 Firebase Functions를 자동으로 배포하는 파이프라인을 구현합니다.
# 변경 사항을 검증하고, 테스트하고, 단계적으로 배포합니다.

set -e

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 프로젝트 루트 디렉토리
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FUNCTIONS_DIR="$PROJECT_ROOT/functions"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"
VALIDATION_DIR="$SCRIPTS_DIR/validation"
BACKUP_DIR="$PROJECT_ROOT/backup/functions/$(date +%Y%m%d_%H%M%S)"

# 환경 설정
ENVIRONMENTS=("dev" "staging" "prod")
CURRENT_ENV=${DEPLOY_ENV:-"dev"}
DRY_RUN=${DRY_RUN:-false}
SKIP_TESTS=${SKIP_TESTS:-false}
SKIP_VALIDATION=${SKIP_VALIDATION:-false}
FORCE_DEPLOY=${FORCE_DEPLOY:-false}
SPECIFIC_FUNCTION=${FUNCTION:-""}

# 설정 파일 로드
CONFIG_FILE="$FUNCTIONS_DIR/function-config.json"
if [ -f "$CONFIG_FILE" ]; then
    echo -e "${BLUE}설정 파일 로드 중: $CONFIG_FILE${NC}"
else
    echo -e "${RED}오류: 설정 파일을 찾을 수 없습니다: $CONFIG_FILE${NC}"
    exit 1
fi

# 사용법 출력
function show_usage {
    echo -e "${BLUE}사용법:${NC} $0 [옵션]"
    echo ""
    echo "옵션:"
    echo "  --env <환경>        배포 환경 (dev, staging, prod) 기본값: dev"
    echo "  --function <이름>   특정 함수만 배포"
    echo "  --dry-run           배포 없이 검증만 수행"
    echo "  --skip-tests        테스트 실행 건너뛰기"
    echo "  --skip-validation   유효성 검사 건너뛰기"
    echo "  --force             경고가 있어도 배포 강제 진행"
    echo "  --help              이 도움말 표시"
    echo ""
    echo "예시:"
    echo "  $0 --env dev --function highValueUsersApi"
    echo "  $0 --env prod --dry-run"
    exit 0
}

# 인자 파싱
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            CURRENT_ENV="$2"
            shift 2
            ;;
        --function)
            SPECIFIC_FUNCTION="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-validation)
            SKIP_VALIDATION=true
            shift
            ;;
        --force)
            FORCE_DEPLOY=true
            shift
            ;;
        --help)
            show_usage
            ;;
        *)
            echo -e "${RED}오류: 알 수 없는 옵션 $1${NC}"
            show_usage
            ;;
    esac
done

# 환경 유효성 검사
if ! [[ " ${ENVIRONMENTS[*]} " =~ " ${CURRENT_ENV} " ]]; then
    echo -e "${RED}오류: 유효하지 않은 환경 - $CURRENT_ENV${NC}"
    echo -e "유효한 환경: ${ENVIRONMENTS[*]}"
    exit 1
fi

echo -e "${BLUE}==== Firebase Functions 자동 배포 스크립트 ====${NC}"
echo -e "${BLUE}환경:${NC} $CURRENT_ENV"
if [ -n "$SPECIFIC_FUNCTION" ]; then
    echo -e "${BLUE}대상 함수:${NC} $SPECIFIC_FUNCTION"
else
    echo -e "${BLUE}대상 함수:${NC} 모든 함수"
fi
echo -e "${BLUE}Dry Run:${NC} $DRY_RUN"

# 상태 확인 함수
function check_status {
    if [ $1 -ne 0 ]; then
        echo -e "${RED}오류: $2${NC}"
        exit $1
    fi
}

# 백업 생성
function create_backup {
    echo -e "\n${BLUE}Firebase Functions 백업 생성 중...${NC}"
    
    mkdir -p "$BACKUP_DIR"
    cp -r "$FUNCTIONS_DIR"/* "$BACKUP_DIR"
    
    echo -e "${GREEN}백업 완료:${NC} $BACKUP_DIR"
}

# 종속성 설치
function install_dependencies {
    echo -e "\n${BLUE}npm 종속성 설치 중...${NC}"
    
    cd "$FUNCTIONS_DIR"
    npm install
    
    check_status $? "npm 종속성 설치 실패"
    echo -e "${GREEN}npm 종속성 설치 완료${NC}"
}

# 코드 검증
function validate_code {
    if [ "$SKIP_VALIDATION" = true ]; then
        echo -e "\n${YELLOW}검증 건너뛰기...${NC}"
        return 0
    fi
    
    echo -e "\n${BLUE}코드 검증 실행 중...${NC}"
    
    # ESLint 검사
    echo -e "${BLUE}ESLint 검사 중...${NC}"
    cd "$FUNCTIONS_DIR"
    npm run lint
    check_status $? "ESLint 검사 실패"
    
    # 종속성 검사
    echo -e "${BLUE}npm 취약성 검사 중...${NC}"
    cd "$FUNCTIONS_DIR"
    npm audit --production
    
    # 경고가 있어도 계속 진행 (종료 코드가 비정상이어도)
    if [ $? -ne 0 ]; then
        if [ "$FORCE_DEPLOY" = true ]; then
            echo -e "${YELLOW}경고: npm 취약성이 발견되었지만 --force 옵션으로 계속 진행합니다.${NC}"
        else
            echo -e "${RED}오류: npm 취약성이 발견되었습니다. --force 옵션으로 무시할 수 있습니다.${NC}"
            exit 1
        fi
    fi
    
    # 고급 검증 스크립트 실행
    if [ -f "$VALIDATION_DIR/validate-functions.js" ]; then
        echo -e "${BLUE}함수 고급 검증 실행 중...${NC}"
        node "$VALIDATION_DIR/validate-functions.js"
        
        if [ $? -ne 0 ]; then
            if [ "$FORCE_DEPLOY" = true ]; then
                echo -e "${YELLOW}경고: 함수 검증에 문제가 발견되었지만 --force 옵션으로 계속 진행합니다.${NC}"
            else
                echo -e "${RED}오류: 함수 검증 실패. --force 옵션으로 무시할 수 있습니다.${NC}"
                exit 1
            fi
        fi
    else
        echo -e "${YELLOW}경고: 함수 고급 검증 스크립트를 찾을 수 없습니다.${NC}"
    fi
    
    echo -e "${GREEN}코드 검증 완료${NC}"
}

# 테스트 실행
function run_tests {
    if [ "$SKIP_TESTS" = true ]; then
        echo -e "\n${YELLOW}테스트 건너뛰기...${NC}"
        return 0
    fi
    
    echo -e "\n${BLUE}테스트 실행 중...${NC}"
    
    # 테스트 스크립트가 있는지 확인
    if [ -f "$FUNCTIONS_DIR/package.json" ]; then
        if grep -q "\"test\":" "$FUNCTIONS_DIR/package.json"; then
            cd "$FUNCTIONS_DIR"
            npm test
            check_status $? "테스트 실행 실패"
        else
            echo -e "${YELLOW}경고: package.json에 test 스크립트가 정의되지 않았습니다.${NC}"
        fi
    else
        echo -e "${YELLOW}경고: package.json을 찾을 수 없습니다.${NC}"
    fi
    
    # 함수 테스트 스크립트가 있는지 확인
    if [ -f "$SCRIPTS_DIR/run-function-tests.sh" ]; then
        echo -e "${BLUE}함수 통합 테스트 실행 중...${NC}"
        bash "$SCRIPTS_DIR/run-function-tests.sh"
        check_status $? "함수 통합 테스트 실행 실패"
    else
        echo -e "${YELLOW}경고: 함수 통합 테스트 스크립트를 찾을 수 없습니다.${NC}"
    fi
    
    echo -e "${GREEN}테스트 완료${NC}"
}

# 환경별 설정 적용
function apply_environment_config {
    echo -e "\n${BLUE}환경 설정 적용 중: $CURRENT_ENV${NC}"
    
    # 환경별 .env 파일
    ENV_FILE="$FUNCTIONS_DIR/.env.$CURRENT_ENV"
    
    if [ -f "$ENV_FILE" ]; then
        cp "$ENV_FILE" "$FUNCTIONS_DIR/.env"
        echo -e "${GREEN}환경 설정 적용 완료:${NC} $ENV_FILE -> .env"
    else
        echo -e "${YELLOW}경고: 환경 설정 파일을 찾을 수 없습니다: $ENV_FILE${NC}"
    fi
}

# 배포 실행
function deploy_functions {
    if [ "$DRY_RUN" = true ]; then
        echo -e "\n${YELLOW}Dry Run 모드: 실제 배포는 건너뜁니다.${NC}"
        return 0
    fi
    
    echo -e "\n${BLUE}Firebase Functions 배포 중: $CURRENT_ENV${NC}"
    
    # 배포 명령어 구성
    DEPLOY_CMD="firebase deploy --only functions"
    
    # 특정 함수만 배포하는 경우
    if [ -n "$SPECIFIC_FUNCTION" ]; then
        DEPLOY_CMD="$DEPLOY_CMD:$SPECIFIC_FUNCTION"
    fi
    
    # 환경 프로젝트 설정
    if [ "$CURRENT_ENV" != "prod" ]; then
        DEPLOY_CMD="$DEPLOY_CMD --project $CURRENT_ENV"
    fi
    
    # 배포 실행
    echo -e "${BLUE}실행 명령어:${NC} $DEPLOY_CMD"
    cd "$PROJECT_ROOT"
    eval $DEPLOY_CMD
    
    check_status $? "Firebase Functions 배포 실패"
    echo -e "${GREEN}Firebase Functions 배포 완료${NC}"
}

# 배포 후 검증
function verify_deployment {
    if [ "$DRY_RUN" = true ]; then
        echo -e "\n${YELLOW}Dry Run 모드: 배포 검증을 건너뜁니다.${NC}"
        return 0
    fi
    
    echo -e "\n${BLUE}배포 검증 중...${NC}"
    
    # API 모니터링 스크립트가 있는지 확인
    if [ -f "$SCRIPTS_DIR/firebase/api-monitor.js" ]; then
        echo -e "${BLUE}API 상태 확인 중...${NC}"
        node "$SCRIPTS_DIR/firebase/api-monitor.js" --check-only
        
        if [ $? -ne 0 ]; then
            echo -e "${RED}경고: API 상태 확인에 실패했습니다. 배포에 문제가 있을 수 있습니다.${NC}"
            echo -e "${YELLOW}조치: 모니터링 대시보드를 확인하고 필요하면 롤백을 고려하세요.${NC}"
        else
            echo -e "${GREEN}API 상태 확인 성공${NC}"
        fi
    else
        echo -e "${YELLOW}경고: API 모니터링 스크립트를 찾을 수 없습니다.${NC}"
    fi
    
    echo -e "${GREEN}배포 검증 완료${NC}"
}

# 롤백 함수
function rollback {
    echo -e "\n${RED}오류가 발생하여 롤백을 시작합니다...${NC}"
    
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}Dry Run 모드: 실제 롤백은 건너뜁니다.${NC}"
        return 0
    fi
    
    # 백업에서 복원
    if [ -d "$BACKUP_DIR" ]; then
        echo -e "${BLUE}백업에서 복원 중...${NC}"
        
        # 현재 파일 백업
        TEMP_DIR="$FUNCTIONS_DIR.failed"
        mv "$FUNCTIONS_DIR" "$TEMP_DIR"
        
        # 백업에서 복원
        mkdir -p "$FUNCTIONS_DIR"
        cp -r "$BACKUP_DIR"/* "$FUNCTIONS_DIR"
        
        # 이전 버전 재배포
        echo -e "${BLUE}이전 버전 재배포 중...${NC}"
        cd "$PROJECT_ROOT"
        
        ROLLBACK_CMD="firebase deploy --only functions"
        
        # 특정 함수만 롤백하는 경우
        if [ -n "$SPECIFIC_FUNCTION" ]; then
            ROLLBACK_CMD="$ROLLBACK_CMD:$SPECIFIC_FUNCTION"
        fi
        
        # 환경 프로젝트 설정
        if [ "$CURRENT_ENV" != "prod" ]; then
            ROLLBACK_CMD="$ROLLBACK_CMD --project $CURRENT_ENV"
        fi
        
        # 롤백 실행
        eval $ROLLBACK_CMD
        
        if [ $? -ne 0 ]; then
            echo -e "${RED}롤백 실패! 수동 개입이 필요합니다.${NC}"
            exit 2
        else
            echo -e "${GREEN}롤백 성공${NC}"
        fi
    else
        echo -e "${RED}오류: 롤백을 위한 백업을 찾을 수 없습니다.${NC}"
        exit 2
    fi
}

# 메인 실행 흐름
function main {
    # 트랩 설정 (오류 발생 시 롤백)
    trap 'rollback' ERR
    
    # 백업 생성
    create_backup
    
    # 종속성 설치
    install_dependencies
    
    # 코드 검증
    validate_code
    
    # 테스트 실행
    run_tests
    
    # 환경별 설정 적용
    apply_environment_config
    
    # 배포 실행
    deploy_functions
    
    # 배포 검증
    verify_deployment
    
    echo -e "\n${GREEN}배포 프로세스가 성공적으로 완료되었습니다!${NC}"
}

# 실행 시작
main
