// 에러 메시지 중앙 관리 상수

export const ERROR_LABELS = {
  LICENSE_NETWORK_ERROR: '라이선스 서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.',
  LICENSE_INVALID_KEY: '유효하지 않은 라이선스 키입니다.',
  LICENSE_FORMAT_ERROR: '올바른 형식이 아닙니다. 예: LOGLENS-A1B2C3-X7Y8Z9K',
  SETTINGS_SAVE_FAILED: '설정을 저장하지 못했습니다. 앱을 재시작하면 이전 설정으로 돌아갈 수 있습니다.',

  // 히스토리
  HISTORY_SAVE_FAILED: '히스토리를 저장하지 못했습니다. 분석 결과에는 영향이 없습니다.',
  HISTORY_LOAD_FAILED: '히스토리를 불러오지 못했습니다. 빈 목록으로 시작합니다.',
  HISTORY_CLEAR_CONFIRM: '모든 분석 히스토리가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.',
} as const;
