// 앱 설정 타입 정의 + 기본값 + 유효성 교정 함수

// --- AI 프로바이더 타입 ---
export type AiProvider = 'claude' | 'openai' | 'gemini' | 'local';

/** API 키 기반 클라우드 프로바이더 (키 등록 뱃지 · 키 입력 UI 에 사용) */
export const CLOUD_PROVIDERS: AiProvider[] = ['claude', 'openai', 'gemini'];

export const AI_PROVIDERS: AiProvider[] = ['claude', 'openai', 'gemini', 'local'];

/** 프로바이더별 키 맵 — 각 프로바이더의 API 키를 독립 저장 */
export type AiApiKeys = Record<AiProvider, string>;

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  fontFamily: string;
  fontSize: number;       // 10-20 범위
  maxLogLines: 500 | 1000 | 3000 | 0;  // 0 = 무제한
  errorToast: boolean;
  alertSound: boolean;
  maxHistoryCount: 20 | 50 | 100;  // 히스토리 최대 보관 건수
  // --- AI 설정 필드 ---
  aiProvider: AiProvider | null;
  /** 프로바이더별 독립 저장되는 API 키 맵 */
  aiApiKeys: AiApiKeys;
  aiModel: string;
  /** DEBUG/TRACE 로그 표시 여부 (OFF 시 INFO/WARN/ERROR/FATAL 만 표시) */
  showDebugLog: boolean;
  // --- 로컬 LLM 설정 ---
  /** 로컬 LLM 엔드포인트 (Ollama / LM Studio 등) */
  localLlmEndpoint: string;
  /** 로컬 LLM 모델명 (예: qwen3-coder, llama3.2) */
  localLlmModel: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontFamily: 'JetBrains Mono',
  fontSize: 13,
  maxLogLines: 1000,
  errorToast: true,
  alertSound: false,
  maxHistoryCount: 50,
  // --- AI 기본값 ---
  aiProvider: null,
  aiApiKeys: { claude: '', openai: '', gemini: '', local: '' },
  aiModel: '',
  showDebugLog: false,
  localLlmEndpoint: 'http://localhost:11434',
  localLlmModel: '',
};

// 프로바이더별 기본 모델 매핑
// 사용자 실측 / 공식 SDK 기준 실존 확인된 모델 ID만 사용
export const AI_DEFAULT_MODELS: Record<AiProvider, string> = {
  // Claude: Anthropic Java SDK 기준 (사용자 MCP 오케스트레이터에서 실사용 중)
  claude: 'claude-opus-4-6',
  // OpenAI: gpt-4o 는 reasoning 파라미터 호환성 영향 없는 안전한 기본값
  // GPT-5 / o-series 는 드롭다운에서 선택 가능 (max_completion_tokens 자동 전환)
  openai: 'gpt-4o',
  // Gemini 2.5-flash: 200 OK 실측 확인
  gemini: 'gemini-2.5-flash',
  // 로컬 LLM: 사용자가 직접 모델명을 입력하므로 빈 문자열
  local: '',
};

// 프로바이더별 선택 가능 모델 목록
// 드롭다운 UX 를 위해 주요 모델만 하드코딩. 추가 모델은 "모델 목록 새로고침" 버튼으로 조회.
export const AI_MODEL_OPTIONS: Record<AiProvider, string[]> = {
  claude: [
    // Claude 4 시리즈 alias (자동으로 최신 snapshot 을 가리킴)
    // 재현성이 필요하면 새로고침 버튼으로 dated snapshot 사용
    'claude-opus-4-6',              // Premium, 최대 지능 (기본값)
    'claude-sonnet-4-6',            // 속도 + 지능 최적 균형 (권장)
    'claude-haiku-4-5',             // 최고 속도 + near-frontier intelligence
    'claude-opus-4-5',              // 이전 세대 Premium
    'claude-sonnet-4-5',            // 에이전트/코딩 특화
  ],
  openai: [
    // 사용자 실측 확인된 OpenAI 모델 (2026-03 시점)
    // GPT-5 / o-series 는 reasoning 모델이라 max_completion_tokens 파라미터 사용
    // (openai.ts 에서 모델명 기반 자동 분기)
    'gpt-4o',                        // GPT-4o (기본값, 안정, 멀티모달)
    'gpt-4o-mini',                   // 4o-mini (저비용)
    'gpt-4.1',                       // GPT-4.1 (안정 플래그십)
    'gpt-4.1-mini',                  // 4.1 mini (저비용)
    'gpt-5.1',                       // GPT-5.1 (최신 플래그십, reasoning)
    'gpt-5.1-mini',                  // 5.1 mini (저비용 reasoning)
    'gpt-5',                         // GPT-5 (이전 세대 reasoning)
    'o4-mini',                       // o4-mini (경량 reasoning)
  ],
  // Gemini: 사용자 실측 기반 (Google AI Studio ListModels 결과)
  // 주의: gemini-3.1-flash / gemini-3.1-pro 단독 이름은 존재하지 않음.
  //       실제로는 모두 '-preview' 접미사 필수.
  gemini: [
    'gemini-2.5-flash',              // 2.5 Flash (기본값, 200 OK 실측 확인, 안정)
    'gemini-2.5-pro',                // 2.5 Pro (고성능, 대용량 컨텍스트)
    'gemini-2.5-flash-lite',         // 2.5 Flash Lite (저비용)
    'gemini-flash-latest',           // Flash latest alias (자동 최신)
    'gemini-pro-latest',             // Pro latest alias (자동 최신)
    'gemini-3-pro-preview',          // 3.0 Pro preview
    'gemini-3-flash-preview',        // 3.0 Flash preview
    'gemini-3.1-pro-preview',        // 3.1 Pro preview (사용자가 원했던 '3.1 Pro' 의 실제 이름)
    'gemini-3.1-flash-lite-preview', // 3.1 Flash Lite preview
  ],
  // 로컬 LLM: 모델은 사용자가 직접 입력하므로 하드코딩 목록 없음
  local: [],
};

/** 프로바이더별 표시명 */
export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  claude: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  local: '로컬 LLM',
};

/** aiApiKeys 교정: 3 프로바이더 모두 string 값 보장 + 앞뒤 공백/개행 제거
 * (복사/붙여넣기 시 trailing whitespace 때문에 401 Unauthorized 발생하는 문제 방지) */
function sanitizeApiKeys(raw: unknown): AiApiKeys {
  const base: AiApiKeys = { claude: '', openai: '', gemini: '', local: '' };
  if (raw && typeof raw === 'object') {
    for (const p of AI_PROVIDERS) {
      const v = (raw as Record<string, unknown>)[p];
      if (typeof v === 'string') base[p] = v.trim();
    }
  }
  return base;
}

/** settings.json 로드 시 + "저장" 클릭 시 양쪽에서 호출하여 값을 교정 */
export function sanitizeSettings(raw: Partial<AppSettings> & { aiApiKey?: unknown }): AppSettings {
  // 프로바이더 교정
  const aiProvider: AiProvider | null =
    raw.aiProvider != null &&
    (AI_PROVIDERS as string[]).includes(raw.aiProvider)
      ? (raw.aiProvider as AiProvider)
      : null;

  // 키 맵 교정 + 레거시 aiApiKey 마이그레이션
  // 기존 스키마: { aiProvider: 'claude', aiApiKey: 'sk-...' }
  // 신규 스키마: { aiProvider: 'claude', aiApiKeys: { claude: 'sk-...', openai: '', gemini: '' } }
  const aiApiKeys = sanitizeApiKeys(raw.aiApiKeys);
  if (
    typeof raw.aiApiKey === 'string' &&
    raw.aiApiKey.trim() !== '' &&
    aiProvider !== null &&
    aiApiKeys[aiProvider] === ''
  ) {
    // 레거시 키가 있고 해당 프로바이더의 신규 키가 비어 있을 때만 이관 (trim 포함)
    aiApiKeys[aiProvider] = raw.aiApiKey.trim();
  }

  return {
    theme: (['dark', 'light', 'system'] as string[]).includes(raw.theme as string)
      ? (raw.theme as AppSettings['theme'])
      : DEFAULT_SETTINGS.theme,
    fontFamily:
      typeof raw.fontFamily === 'string' && raw.fontFamily.trim()
        ? raw.fontFamily
        : DEFAULT_SETTINGS.fontFamily,
    fontSize:
      typeof raw.fontSize === 'number' && raw.fontSize >= 10 && raw.fontSize <= 20
        ? raw.fontSize
        : DEFAULT_SETTINGS.fontSize,
    maxLogLines:
      ([500, 1000, 3000, 0] as number[]).includes(raw.maxLogLines as number)
        ? (raw.maxLogLines as AppSettings['maxLogLines'])
        : DEFAULT_SETTINGS.maxLogLines,
    errorToast:
      typeof raw.errorToast === 'boolean'
        ? raw.errorToast
        : DEFAULT_SETTINGS.errorToast,
    alertSound:
      typeof raw.alertSound === 'boolean'
        ? raw.alertSound
        : DEFAULT_SETTINGS.alertSound,
    maxHistoryCount:
      ([20, 50, 100] as number[]).includes(raw.maxHistoryCount as number)
        ? (raw.maxHistoryCount as AppSettings['maxHistoryCount'])
        : DEFAULT_SETTINGS.maxHistoryCount,
    // --- AI 설정 교정 ---
    aiProvider,
    aiApiKeys,
    // 모델 ID 자동 복구: 저장된 모델이 현재 AI_MODEL_OPTIONS 에 없으면
    // (deprecated 되었거나 옵션에서 제거된 경우) 해당 프로바이더의 기본 모델로 폴백.
    // 예: 저장값이 'gemini-1.5-flash' 인데 옵션에서 제거된 경우 'gemini-2.0-flash' 로 복구.
    aiModel: (() => {
      const stored = typeof raw.aiModel === 'string' ? raw.aiModel : '';
      if (aiProvider === null) return stored;
      const validOptions = AI_MODEL_OPTIONS[aiProvider];
      if (stored && validOptions.includes(stored)) return stored;
      return AI_DEFAULT_MODELS[aiProvider];
    })(),
    showDebugLog:
      typeof raw.showDebugLog === 'boolean' ? raw.showDebugLog : DEFAULT_SETTINGS.showDebugLog,
    // --- 로컬 LLM 교정 ---
    localLlmEndpoint:
      typeof raw.localLlmEndpoint === 'string' && raw.localLlmEndpoint.trim()
        ? raw.localLlmEndpoint.trim()
        : DEFAULT_SETTINGS.localLlmEndpoint,
    localLlmModel:
      typeof raw.localLlmModel === 'string'
        ? raw.localLlmModel.trim()
        : DEFAULT_SETTINGS.localLlmModel,
  };
}

/** 현재 활성 프로바이더의 API 키를 반환 (없으면 빈 문자열).
 *  로컬 LLM은 API 키가 필요 없으므로 빈 문자열 반환. */
export function getActiveApiKey(settings: AppSettings): string {
  if (settings.aiProvider === null) return '';
  return settings.aiApiKeys[settings.aiProvider] ?? '';
}

/** 로컬 LLM 프로바이더 여부 판별 */
export function isLocalProvider(provider: AiProvider | null): boolean {
  return provider === 'local';
}
