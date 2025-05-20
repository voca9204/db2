"""
보안 강화 자동 실행 스크립트

이 스크립트는 보안 강화 작업을 자동으로 수행합니다.
- .env 파일 생성
- .env.example 파일 생성
- 하드코딩된 자격 증명 자동 교체
- .gitignore 파일 업데이트
"""

import os
import re
import glob
import sys
from pathlib import Path

def find_hardcoded_credentials(directory, password_pattern=r'password\s*=\s*["\']([^"\']+)["\']', exclude_dirs=None):
    """
    디렉토리 내의 파일에서 하드코딩된 비밀번호를 검색
    
    Args:
        directory (str): 검색할 디렉토리 경로
        password_pattern (str): 비밀번호를 찾기 위한 정규식 패턴
        exclude_dirs (list): 제외할 디렉토리 목록
        
    Returns:
        dict: 파일 경로와 발견된 비밀번호 정보 딕셔너리
    """
    if exclude_dirs is None:
        exclude_dirs = ['.git', 'venv', '__pycache__', 'node_modules']
    
    results = {}
    
    for root, dirs, files in os.walk(directory):
        # 제외 디렉토리 건너뛰기
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        
        for file in files:
            if file.endswith(('.py', '.js', '.php', '.json', '.yaml', '.yml', '.md')):
                file_path = os.path.join(root, file)
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        
                        # 비밀번호 패턴 검색
                        password_matches = re.finditer(password_pattern, content)
                        
                        matches = []
                        for match in password_matches:
                            password = match.group(1)
                            line_number = content[:match.start()].count('\n') + 1
                            context_start = max(match.start() - 50, 0)
                            context_end = min(match.end() + 50, len(content))
                            context = content[context_start:context_end]
                            
                            matches.append({
                                'password': password,
                                'line': line_number,
                                'context': context
                            })
                        
                        # 직접적인 비밀번호 검색
                        if 'mcygicng!022' in content:
                            line_number = -1
                            for i, line in enumerate(content.splitlines()):
                                if 'mcygicng!022' in line:
                                    line_number = i + 1
                                    break
                            
                            if not any(match['password'] == 'mcygicng!022' for match in matches):
                                matches.append({
                                    'password': os.getenv('DB_PASSWORD', ''),
                                    'line': line_number,
                                    'context': 'Direct password reference'
                                })
                        
                        if matches:
                            results[file_path] = matches
                
                except Exception as e:
                    print(f"오류: {file_path} 파일 읽기 실패 - {e}")
    
    return results

def find_exposed_env_files(directory):
    """
    .env 파일이 .gitignore에 제대로 포함되어 있는지 확인
    
    Args:
        directory (str): 프로젝트 디렉토리 경로
        
    Returns:
        list: .gitignore에 포함되지 않은 환경 변수 파일 목록
    """
    env_files = []
    gitignore_patterns = []
    
    # .gitignore 파일 읽기
    gitignore_path = os.path.join(directory, '.gitignore')
    if os.path.exists(gitignore_path):
        with open(gitignore_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    gitignore_patterns.append(line)
    
    # .env 파일 찾기
    for root, dirs, files in os.walk(directory):
        for file in files:
            if '.env' in file:
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, directory)
                
                # .gitignore 패턴과 매치되는지 확인
                is_ignored = False
                for pattern in gitignore_patterns:
                    if pattern == file or pattern.endswith('/'+file) or pattern == '*.env' or relative_path.startswith(pattern):
                        is_ignored = True
                        break
                
                if not is_ignored:
                    env_files.append(file_path)
    
    return env_files

def create_env_example(env_path, env_example_path):
    """
    .env 파일을 기반으로 .env.example 파일 생성
    
    Args:
        env_path (str): .env 파일 경로
        env_example_path (str): 생성할 .env.example 파일 경로
    """
    if not os.path.exists(env_path):
        print(f"오류: {env_path} 파일이 존재하지 않습니다.")
        return
    
    with open(env_path, 'r', encoding='utf-8') as f:
        env_content = f.readlines()
    
    example_content = []
    for line in env_content:
        line = line.strip()
        if line and not line.startswith('#'):
            if '=' in line:
                var_name, var_value = line.split('=', 1)
                example_content.append(f"{var_name}=\n")
            else:
                example_content.append(line + '\n')
        else:
            example_content.append(line + '\n')
    
    with open(env_example_path, 'w', encoding='utf-8') as f:
        f.writelines(example_content)
    
    print(f".env.example 파일이 생성되었습니다: {env_example_path}")

def auto_replace_hardcoded_credentials(project_dir, dry_run=False):
    """
    프로젝트 내 스크립트에서 하드코딩된 자격 증명을 자동으로 교체
    
    Args:
        project_dir (str): 프로젝트 디렉토리 경로
        dry_run (bool): 실제 변경 없이 예상 변경사항만 출력할지 여부
        
    Returns:
        int: 수정된 파일 수
    """
    # 자주 사용되는 교체 패턴 (정규식)
    replacements = [
        # PyMySQL 연결 정보 교체
        (
            r'"password"\s*:\s*"mcygicng!022"', 
            '"password": os.getenv("DB_PASSWORD", "")'
        ),
        (
            r"'password'\s*:\s*'mcygicng!022'", 
            "'password': os.getenv('DB_PASSWORD', '')"
        ),
        # DB_CONFIG 직접 설정 교체
        (
            r'DB_CONFIG\s*=\s*\{.*?"password":\s*"mcygicng!022".*?\}', 
            'DB_CONFIG = {\n    "host": os.getenv("DB_HOST", "211.248.190.46"),\n    "user": os.getenv("DB_USER", "hermes"),\n    "password": os.getenv("DB_PASSWORD", ""),\n    "database": os.getenv("DB_NAME", "hermes"),\n    "charset": os.getenv("DB_CHARSET", "utf8mb4"),\n    "cursorclass": DictCursor\n}'
        ),
        # 개별 변수 설정 교체
        (
            r'(db_password|password)\s*=\s*["\']mcygicng!022["\']', 
            r'\1 = os.getenv("DB_PASSWORD", "")'
        ),
    ]
    
    # 스크립트 디렉토리의 모든 Python 파일
    py_files = glob.glob(os.path.join(project_dir, 'scripts', '*.py'))
    py_files += glob.glob(os.path.join(project_dir, 'scripts', '**', '*.py'), recursive=True)
    
    modified_files = 0
    
    for file_path in py_files:
        # os, dotenv 임포트 추가 필요 확인
        needs_os_import = False
        needs_dotenv_import = False
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
                # 파일에 비밀번호가 있는지 확인
                has_password = os.getenv("DB_PASSWORD", "") in content
                
                if has_password:
                    # os 모듈 임포트 여부 확인
                    if 'import os' not in content and 'from os' not in content:
                        needs_os_import = True
                    
                    # dotenv 임포트 여부 확인
                    if 'dotenv' not in content:
                        needs_dotenv_import = True
            
            # 임포트 추가 및 자격 증명 교체
            if has_password:
                file_imports_added = False
                
                # 특별한 처리가 필요한 파일들
                if os.path.basename(file_path) == 'test_pymysql_simple.py':
                    # test_pymysql_simple.py 파일 전체 수정
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # 임포트 추가
                    import_section = "import sys\nimport time\nimport logging\nimport os\nfrom pathlib import Path\nfrom dotenv import load_dotenv\n\n# .env 파일 로드\nload_dotenv()\n"
                    content = re.sub(r'import sys\nimport time\nimport logging\nfrom pathlib import Path', import_section, content)
                    
                    # DB_CONFIG 교체
                    db_config_section = """# 데이터베이스 연결 정보
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "211.248.190.46"),
    "user": os.getenv("DB_USER", "hermes"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "hermes"),
    "charset": os.getenv("DB_CHARSET", "utf8mb4"),
    "cursorclass": DictCursor
}"""
                    content = re.sub(r'# 데이터베이스 연결 정보\nDB_CONFIG = \{.*?\}', db_config_section, content, flags=re.DOTALL)
                    
                    if not dry_run:
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(content)
                        print(f"수정 완료: {os.path.relpath(file_path, project_dir)}")
                        modified_files += 1
                    else:
                        print(f"수정 예정: {os.path.relpath(file_path, project_dir)}")
                    
                    file_imports_added = True
                
                # 일반적인 패턴 교체
                if not file_imports_added:
                    # 파일 읽기
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # 임포트 추가
                    modified_content = content
                    if needs_os_import and needs_dotenv_import:
                        import_line = "import os\nfrom dotenv import load_dotenv\n\n# .env 파일 로드\nload_dotenv()\n"
                        if "import" in modified_content:
                            modified_content = re.sub(r'(import [^\n]+\n)', r'\1' + import_line, modified_content, count=1)
                        else:
                            modified_content = import_line + modified_content
                    elif needs_os_import:
                        import_line = "import os\n"
                        if "import" in modified_content:
                            modified_content = re.sub(r'(import [^\n]+\n)', r'\1' + import_line, modified_content, count=1)
                        else:
                            modified_content = import_line + modified_content
                    elif needs_dotenv_import:
                        import_line = "from dotenv import load_dotenv\n\n# .env 파일 로드\nload_dotenv()\n"
                        if "import" in modified_content:
                            modified_content = re.sub(r'(import [^\n]+\n)', r'\1' + import_line, modified_content, count=1)
                        else:
                            modified_content = import_line + modified_content
                    
                    # 자격 증명 교체
                    for old_pattern, new_pattern in replacements:
                        modified_content = re.sub(old_pattern, new_pattern, modified_content)
                    
                    # 변경 사항이 있는 경우에만 파일 쓰기
                    if modified_content != content:
                        if not dry_run:
                            with open(file_path, 'w', encoding='utf-8') as f:
                                f.write(modified_content)
                            print(f"수정 완료: {os.path.relpath(file_path, project_dir)}")
                            modified_files += 1
                        else:
                            print(f"수정 예정: {os.path.relpath(file_path, project_dir)}")
        
        except Exception as e:
            print(f"오류: {file_path} 파일 처리 실패 - {e}")
    
    return modified_files

def create_env_file(project_dir, overwrite=False):
    """
    .env 파일 생성 또는 업데이트
    
    Args:
        project_dir (str): 프로젝트 디렉토리 경로
        overwrite (bool): 기존 파일 덮어쓰기 여부
    """
    env_path = os.path.join(project_dir, '.env')
    
    # 기존 파일이 있고 덮어쓰기가 비활성화된 경우
    if os.path.exists(env_path) and not overwrite:
        print(f".env 파일이 이미 존재합니다: {env_path}")
        return
    
    # .env 파일 내용 생성
    env_content = """# 데이터베이스 연결 설정
DB_HOST=211.248.190.46
DB_PORT=3306
DB_NAME=hermes
DB_USER=hermes
DB_PASSWORD=mcygicng!022
DB_CHARSET=utf8mb4

# 연결 풀 설정
DB_POOL_SIZE=5
DB_TIMEOUT=30

# 재시도 설정
DB_RETRY_MAX=3
DB_RETRY_DELAY=0.1
DB_RETRY_MAX_DELAY=2.0

# 로깅 설정
LOG_LEVEL=INFO
LOG_FILE=logs/app.log
"""
    
    # .env 파일 작성
    with open(env_path, 'w', encoding='utf-8') as f:
        f.write(env_content)
    
    print(f".env 파일이 생성되었습니다: {env_path}")
    
    # .gitignore에 .env 추가
    gitignore_path = os.path.join(project_dir, '.gitignore')
    add_to_gitignore = True
    
    if os.path.exists(gitignore_path):
        with open(gitignore_path, 'r', encoding='utf-8') as f:
            gitignore_content = f.read()
            if '.env' in gitignore_content:
                add_to_gitignore = False
    
    if add_to_gitignore:
        with open(gitignore_path, 'a', encoding='utf-8') as f:
            f.write("\n# 환경 변수 파일\n.env\n*.env\n")
        print(".gitignore 파일에 .env 제외 패턴이 추가되었습니다.")

def main():
    """자동 보안 강화 실행"""
    # 프로젝트 디렉토리 설정
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    print("=" * 80)
    print("보안 강화 스크립트 자동 실행")
    print("=" * 80)
    print(f"프로젝트 디렉토리: {project_dir}")
    print("\n모든 보안 강화 작업을 자동으로 수행합니다...")
    
    # 1. .env 파일 생성
    print("\n1. .env 파일 생성 또는 업데이트...")
    env_path = os.path.join(project_dir, '.env')
    
    if os.path.exists(env_path):
        print(".env 파일이 이미 존재합니다. 기존 파일을 유지합니다.")
    else:
        create_env_file(project_dir)
    
    # 2. .env.example 파일 생성
    print("\n2. .env.example 파일 생성...")
    env_example_path = os.path.join(project_dir, '.env.example')
    
    if os.path.exists(env_path) and not os.path.exists(env_example_path):
        create_env_example(env_path, env_example_path)
    elif os.path.exists(env_path) and os.path.exists(env_example_path):
        print(".env.example 파일이 이미 존재합니다.")
    
    # 3. 하드코딩된 자격 증명 검색
    print("\n3. 하드코딩된 자격 증명 검색 중...")
    credentials = find_hardcoded_credentials(project_dir)
    
    if credentials:
        print(f"\n{len(credentials)} 개의 파일에서 하드코딩된 자격 증명 발견:")
        for file_path, matches in credentials.items():
            rel_path = os.path.relpath(file_path, project_dir)
            print(f"- {rel_path} ({len(matches)}개)")
        
        # 4. 자격 증명 자동 교체 적용
        print("\n4. 자격 증명 자동 교체 적용 중...")
        modified_files = auto_replace_hardcoded_credentials(project_dir, dry_run=False)
        print(f"\n{modified_files}개 파일이 수정되었습니다.")
    else:
        print("하드코딩된 자격 증명이 발견되지 않았습니다.")
    
    # 5. 환경 변수 파일 보안 검사
    print("\n5. 환경 변수 파일 보안 검사 중...")
    exposed_env_files = find_exposed_env_files(project_dir)
    
    if exposed_env_files:
        print(f"\n{len(exposed_env_files)} 개의 환경 변수 파일이 .gitignore에 포함되지 않았습니다.")
        
        # .gitignore 자동 업데이트
        gitignore_path = os.path.join(project_dir, '.gitignore')
        with open(gitignore_path, 'a', encoding='utf-8') as f:
            f.write("\n# 환경 변수 파일\n.env\n*.env\n")
        print(".gitignore 파일에 .env 제외 패턴이 추가되었습니다.")
    else:
        print("모든 환경 변수 파일이 적절히 .gitignore에 포함되어 있습니다.")
    
    print("\n보안 강화 스크립트 실행 완료")
    print("=" * 80)
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
