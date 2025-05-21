/**
 * 설정 로드 유틸리티 모듈
 */

const fs = require('fs');
const path = require('path');

/**
 * 설정 파일 로드
 * @param {string} configPath 설정 파일 경로
 * @returns {Object} 설정 객체
 */
function loadConfig(configPath) {
  try {
    if (!fs.existsSync(configPath)) {
      return getDefaultConfig();
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return Object.assign(getDefaultConfig(), config);
  } catch (error) {
    console.error(`설정 파일 로드 오류: ${error.message}`);
    return getDefaultConfig();
  }
}

/**
 * 기본 설정 가져오기
 * @returns {Object} 기본 설정 객체
 */
function getDefaultConfig() {
  return {
    validation: {
      schema: {
        enabled: true,
        generateTemplates: false
      },
      rules: {
        enabled: true,
        validateDeployment: false
      },
      functions: {
        enabled: true
      },
      indexes: {
        enabled: true,
        compareWithActual: true
      },
      environments: {
        enabled: true
      },
      impact: {
        enabled: false
      }
    },
    reporting: {
      enabled: true,
      format: 'json',
      directory: 'reports'
    },
    notifications: {
      enabled: false,
      channels: ['slack'],
      criticalOnly: true
    }
  };
}

module.exports = {
  loadConfig
};