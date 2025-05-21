/**
 * DB2 프로젝트를 위한 간단한 Memory Bank 시스템
 * 세션 간 프로젝트 상태와 컨텍스트를 유지하기 위한 도구
 */

const fs = require('fs');
const path = require('path');

/**
 * Memory Bank 클래스 - 프로젝트 상태 관리
 */
class MemoryBank {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.memoryPath = path.join(projectRoot, 'memory_bank');
    this.statusFile = path.join(this.memoryPath, 'project_status.md');
    this.contextFile = path.join(this.memoryPath, 'context.md');
    this.tasksFile = path.join(this.memoryPath, 'active_tasks.json');

    // 메모리 뱅크 디렉토리가 없으면 생성
    if (!fs.existsSync(this.memoryPath)) {
      fs.mkdirSync(this.memoryPath, { recursive: true });
    }

    // 기본 파일들이 없으면 생성
    this._initFiles();
  }

  /**
   * 기본 파일 초기화
   */
  _initFiles() {
    // 프로젝트 상태 파일
    if (!fs.existsSync(this.statusFile)) {
      const initialStatus = `# DB2 프로젝트 상태
마지막 업데이트: ${new Date().toISOString()}

## 프로젝트 개요
- 목표: 오랫동안 게임을 하지 않은 사용자가 이벤트를 통해 게임에 참여하고, 결국 입금까지 이어지게 하는 시스템 개발
- 상태: 진행 중

## 최근 작업 내역
- 프로젝트 초기 설정 완료

## 다음 단계
- 휴면 사용자 식별 및 분석 시스템 구현
`;
      fs.writeFileSync(this.statusFile, initialStatus, 'utf8');
    }

    // 컨텍스트 파일
    if (!fs.existsSync(this.contextFile)) {
      const initialContext = `# DB2 프로젝트 컨텍스트

## 프로젝트 정보
- 프로젝트 루트: ${this.projectRoot}
- 데이터베이스: Hermes (MariaDB)

## 주요 개념
- 휴면 사용자: 10일 이상 게임에 접속하지 않은 사용자
- 이벤트: 사용자에게 제공되는 보상 및 혜택
- 전환: 이벤트를 통해 사용자가 다시 게임에 참여하고 입금하는 것

## 주요 파일 및 디렉토리
- queries/event/: 이벤트 관련 SQL 쿼리
- queries/user/: 사용자 분석 관련 SQL 쿼리
- src/database/: 데이터베이스 연결 및 쿼리 모듈
`;
      fs.writeFileSync(this.contextFile, initialContext, 'utf8');
    }

    // 활성 태스크 파일
    if (!fs.existsSync(this.tasksFile)) {
      const initialTasks = {
        activeTasks: [
          {
            id: 18,
            title: "Inactive User Targeting System Development",
            status: "pending"
          },
          {
            id: 19,
            title: "Implement Personalized Event Recommendation System",
            status: "pending"
          }
        ],
        lastUpdate: new Date().toISOString()
      };
      fs.writeFileSync(this.tasksFile, JSON.stringify(initialTasks, null, 2), 'utf8');
    }
  }

  /**
   * 프로젝트 상태 업데이트
   * @param {string} content - 추가할 내용
   * @param {boolean} overwrite - 덮어쓰기 여부
   * @returns {boolean} - 성공 여부
   */
  updateStatus(content, overwrite = false) {
    try {
      const timestamp = new Date().toISOString();
      
      if (overwrite) {
        // 전체 내용 덮어쓰기
        fs.writeFileSync(this.statusFile, content, 'utf8');
      } else {
        // 기존 내용에 추가
        const section = `\n\n## 업데이트: ${timestamp}\n${content}\n`;
        fs.appendFileSync(this.statusFile, section, 'utf8');
      }
      return true;
    } catch (error) {
      console.error('상태 업데이트 실패:', error);
      return false;
    }
  }

  /**
   * 프로젝트 상태 읽기
   * @returns {string} 상태 내용
   */
  readStatus() {
    try {
      return fs.readFileSync(this.statusFile, 'utf8');
    } catch (error) {
      console.error('상태 읽기 실패:', error);
      return '';
    }
  }

  /**
   * 활성 태스크 업데이트
   * @param {Array} tasks - 태스크 목록
   * @returns {boolean} - 성공 여부
   */
  updateActiveTasks(tasks) {
    try {
      const data = {
        activeTasks: tasks,
        lastUpdate: new Date().toISOString()
      };
      fs.writeFileSync(this.tasksFile, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('태스크 업데이트 실패:', error);
      return false;
    }
  }

  /**
   * 활성 태스크 읽기
   * @returns {Array} 태스크 목록
   */
  readActiveTasks() {
    try {
      const data = JSON.parse(fs.readFileSync(this.tasksFile, 'utf8'));
      return data.activeTasks || [];
    } catch (error) {
      console.error('태스크 읽기 실패:', error);
      return [];
    }
  }

  /**
   * 컨텍스트 업데이트
   * @param {string} content - 컨텍스트 내용
   * @param {boolean} overwrite - 덮어쓰기 여부
   * @returns {boolean} - 성공 여부
   */
  updateContext(content, overwrite = false) {
    try {
      if (overwrite) {
        fs.writeFileSync(this.contextFile, content, 'utf8');
      } else {
        const currentContent = fs.readFileSync(this.contextFile, 'utf8');
        const updatedContent = `${currentContent}\n\n${content}`;
        fs.writeFileSync(this.contextFile, updatedContent, 'utf8');
      }
      return true;
    } catch (error) {
      console.error('컨텍스트 업데이트 실패:', error);
      return false;
    }
  }

  /**
   * 컨텍스트 읽기
   * @returns {string} 컨텍스트 내용
   */
  readContext() {
    try {
      return fs.readFileSync(this.contextFile, 'utf8');
    } catch (error) {
      console.error('컨텍스트 읽기 실패:', error);
      return '';
    }
  }
}

/**
 * 프로젝트 상태 업데이트
 * @param {string} projectRoot - 프로젝트 루트 디렉토리
 * @param {string} content - 업데이트 내용
 * @returns {Object} - 결과 객체
 */
function memory_bank_update(projectRoot, content) {
  const memoryBank = new MemoryBank(projectRoot);
  const success = memoryBank.updateStatus(content);
  
  return {
    success,
    message: success ? '프로젝트 상태가 업데이트되었습니다.' : '프로젝트 상태 업데이트 실패'
  };
}

/**
 * 프로젝트 상태 조회
 * @param {string} projectRoot - 프로젝트 루트 디렉토리
 * @returns {Object} - 결과 객체
 */
function memory_bank_status(projectRoot) {
  const memoryBank = new MemoryBank(projectRoot);
  const status = memoryBank.readStatus();
  const tasks = memoryBank.readActiveTasks();
  
  return {
    status,
    tasks,
    lastUpdate: tasks.lastUpdate || '알 수 없음'
  };
}

/**
 * 현재 작업 변경
 * @param {string} projectRoot - 프로젝트 루트 디렉토리
 * @param {number} taskId - 태스크 ID
 * @param {string} taskTitle - 태스크 제목
 * @returns {Object} - 결과 객체
 */
function memory_bank_set_current_task(projectRoot, taskId, taskTitle) {
  const memoryBank = new MemoryBank(projectRoot);
  const tasks = memoryBank.readActiveTasks();
  
  // 현재 태스크 찾기 또는 새로 추가
  const existingTaskIndex = tasks.findIndex(task => task.id === taskId);
  
  if (existingTaskIndex >= 0) {
    tasks[existingTaskIndex].status = 'in-progress';
    tasks[existingTaskIndex].title = taskTitle || tasks[existingTaskIndex].title;
  } else {
    tasks.push({
      id: taskId,
      title: taskTitle || `태스크 #${taskId}`,
      status: 'in-progress'
    });
  }
  
  // 다른 태스크는 대기 상태로 변경
  tasks.forEach((task, index) => {
    if (index !== existingTaskIndex) {
      task.status = 'pending';
    }
  });
  
  const success = memoryBank.updateActiveTasks(tasks);
  
  // 상태 업데이트
  const content = `현재 작업 중인 태스크: #${taskId} ${taskTitle || ''}`;
  memoryBank.updateStatus(content);
  
  return {
    success,
    message: success ? `현재 태스크가 #${taskId}로 설정되었습니다.` : '태스크 설정 실패'
  };
}

module.exports = {
  MemoryBank,
  memory_bank_update,
  memory_bank_status,
  memory_bank_set_current_task
};
