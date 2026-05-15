// 에러 메시지 중앙 관리 — i18n 호환 getter (R12 설계서 §9.1 방식 A 변형)
//
// 기존 호출처(`ERROR_LABELS.X`)와 호환 유지를 위해 객체 형태를 유지하되
// 각 키를 getter 로 변환하여 호출 시점의 i18n.language 기준 텍스트를 반환한다.
// 신규 호출처는 `i18n.t('common.xxx')` 직접 호출을 권장.

import i18n from '../i18n';

export const ERROR_LABELS = {
  // 라이선스 키 3개는 R10 라이선스 모델 폐기 이후 사실상 미사용 — 영문 한정 보존
  get LICENSE_NETWORK_ERROR(): string {
    return '라이선스 서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.';
  },
  get LICENSE_INVALID_KEY(): string {
    return '유효하지 않은 라이선스 키입니다.';
  },
  get LICENSE_FORMAT_ERROR(): string {
    return '올바른 형식이 아닙니다. 예: LOGLENS-A1B2C3-X7Y8Z9K';
  },
  get SETTINGS_SAVE_FAILED(): string {
    return i18n.t('common.settingsSaveFailed');
  },

  // 히스토리
  get HISTORY_SAVE_FAILED(): string {
    return i18n.t('common.historySaveFailed');
  },
  get HISTORY_LOAD_FAILED(): string {
    return i18n.t('common.historyLoadFailed');
  },
  get HISTORY_CLEAR_CONFIRM(): string {
    return i18n.t('common.historyClearConfirm');
  },
} as const;
