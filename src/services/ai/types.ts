// AI 서비스 공통 타입 정의 (8차 확장)

import type { ErrorSummary } from '../../utils/errorAnalyzer';

/** AI API 요청용 데이터 구조 (프로바이더 무관) */
export interface AiReportRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
}

/** AI API 응답 (프로바이더 무관) */
export interface AiReportResponse {
  content: string;       // AI가 생성한 리포트 텍스트 (마크다운)
  tokensUsed?: number;   // 사용 토큰 수 (디버깅용)
}

/**
 * 프로바이더 어댑터 인터페이스 (8차 확장)
 * - send: AI 리포트 생성 (onDelta 옵셔널 — 스트리밍 모드)
 * - listModels: 해당 API 키로 실제 사용 가능한 모델 ID 목록 조회
 *   → 신규/레거시 모델 충돌 방지 용도. 호출부는 실패 시 AI_MODEL_OPTIONS 하드코딩 fallback 사용.
 */
export interface AiProviderAdapter {
  send(
    request: AiReportRequest,
    apiKey: string,
    model: string,
    signal?: AbortSignal,
    onDelta?: (delta: string) => void,
  ): Promise<AiReportResponse>;

  /**
   * API 키로 실제 사용 가능한 모델 ID 목록을 조회한다.
   * - Claude: GET /v1/models
   * - OpenAI: GET /v1/models (gpt-* 필터링)
   * - Gemini: GET /v1beta/models?key=... (generateContent 지원 필터링)
   *
   * @returns 사용 가능한 모델 short ID 배열 (예: ['gpt-4o', 'gpt-4o-mini', ...])
   * @throws AiApiError INVALID_API_KEY / RATE_LIMIT / SERVER_ERROR / NETWORK_ERROR
   */
  listModels(apiKey: string, signal?: AbortSignal): Promise<string[]>;
}

/** 출력 언어 */
export type ReportLanguage = 'ko' | 'en';

/** 요약 모드 (4조건 매트릭스) */
export type SummaryMode = 'summary' | 'full';

/** dataBuilder.buildAnalysisData 옵션 */
export interface BuildOptions {
  projectRoot: string | null;
  language: ReportLanguage;
  abortSignal?: AbortSignal;
}

/**
 * AI 프롬프트 투입용 분석 페이로드 (8차 신규)
 * dataBuilder.buildAnalysisData()가 반환하며, 기존 ReportDataSummary를 대체한다.
 */
export interface AnalysisPayload {
  summary: {
    fileName: string;
    fileSize: number;
    analyzedAt: string;   // ISO-8601
    totalCount: number;
    errorCount: number;
    warnCount: number;
    infoCount: number;
    errorRate: number;    // 0.0 ~ 1.0
  };
  topExceptions: Array<{
    rank: number;
    className: string;
    fullName: string;
    count: number;
    firstOccurrence: string;
    lastOccurrence: string;
  }>;
  hourlyDistribution: Array<{
    hour: string;
    error: number;
    warn: number;
    info: number;
  }>;
  stackTraces?: Array<{
    level: string;
    timestamp: string;
    logger: string;
    message: string;
    exceptionClass: string;
    frames: string[];
  }>;
  sourceCode?: {
    files: Array<{
      path: string;
      relevantLines: Array<{ lineNumber: number; content: string }>;
    }>;
  };
  meta: {
    summaryMode: SummaryMode;
    sourceCodeTruncated: boolean;
    language: ReportLanguage;
    generatedAt: string;  // ISO-8601
  };
}

/**
 * reportGenerator에 전달하는 분석 데이터 요약 (구버전)
 * @deprecated 8차 이후 AnalysisPayload로 대체됨. 3주기 이후 제거 예정.
 */
export interface ReportDataSummary {
  fileName: string;
  fileSize: number;
  totalEntries: number;
  levelCounts: Record<string, number>;
  topErrors: ErrorSummary[];
  timeline: { hour: string; ERROR: number; WARN: number; INFO: number }[];
  sampleStacktraces: {
    exceptionClass: string;
    message: string;
    timestamp: string;
    frames: { className: string; method: string; file: string; line: number; isUserCode: boolean }[];
  }[];
}

/** AI API 에러 분류 (8차 확장: 16종) */
export type AiErrorType =
  | 'INVALID_API_KEY'            // 401
  | 'RATE_LIMIT'                 // 429
  | 'SERVER_ERROR'               // 5xx
  | 'NETWORK_ERROR'              // fetch 실패
  | 'PARSE_ERROR'                // 응답 파싱 실패
  | 'ABORTED'                    // 사용자 취소
  | 'API_KEY_NOT_CONFIGURED'     // 설정에 API 키 없음
  | 'FILE_SCOPE_DENIED'          // plugin-fs scope 밖 경로
  | 'SOURCE_FILE_NOT_FOUND'      // 소스 파일 탐색 실패
  | 'WORD_TEMPLATE_PARSE_FAIL'   // mammoth 파싱 실패
  | 'WORD_UPLOAD_EXT_FAIL'       // 확장자 오류
  | 'WORD_UPLOAD_SIZE_FAIL'      // 크기 초과 (10MB)
  | 'PAYLOAD_TOO_LARGE'          // 80KB 토큰 가드 초과
  | 'DOCX_GENERATION_FAIL'       // docx Blob 생성 실패
  | 'FILE_SIZE_SMALL_WARNING'    // 1MB 미만 경고 (실제로는 throw 아님, UI용)
  | 'FILE_SIZE_LARGE_WARNING';   // 5MB 이상 경고 (실제로는 throw 아님, UI용)

/** AI API 에러 클래스 */
export class AiApiError extends Error {
  constructor(
    public readonly type: AiErrorType,
    message: string,
  ) {
    super(message);
    this.name = 'AiApiError';
  }
}

/**
 * 에러 타입 -> 사용자 메시지 매핑 (ko/en 2차원)
 * 호출부 접근: `AI_ERROR_MESSAGES[type][language]`
 */
export const AI_ERROR_MESSAGES: Record<AiErrorType, { ko: string; en: string }> = {
  INVALID_API_KEY: {
    ko: 'API 키가 유효하지 않거나 API 크레딧이 없습니다. Claude Pro/ChatGPT Plus 같은 월 구독은 API 사용이 포함되지 않으므로, 프로바이더 Console에서 API 크레딧을 별도로 구매해야 합니다',
    en: 'API key is invalid or has no credits. Web subscriptions like Claude Pro / ChatGPT Plus do NOT include API usage — please purchase API credits separately from the provider console.',
  },
  RATE_LIMIT: {
    ko: '요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요',
    en: 'Rate limit exceeded. Please try again later.',
  },
  SERVER_ERROR: {
    ko: 'AI 서비스에 일시적 문제가 발생했습니다. 잠시 후 다시 시도해 주세요',
    en: 'Temporary AI service issue. Please try again later.',
  },
  NETWORK_ERROR: {
    ko: '네트워크 연결을 확인해 주세요',
    en: 'Please check your network connection.',
  },
  PARSE_ERROR: {
    ko: 'AI 응답을 처리하지 못했습니다. 다시 시도해 주세요',
    en: 'Failed to parse AI response. Please try again.',
  },
  ABORTED: {
    ko: '',
    en: '',
  },
  API_KEY_NOT_CONFIGURED: {
    ko: 'AI 프로바이더가 설정되지 않았습니다. 설정에서 API 키를 등록해 주세요',
    en: 'AI provider is not configured. Please set an API key in settings.',
  },
  FILE_SCOPE_DENIED: {
    ko: '선택한 폴더의 접근 권한이 없습니다. Documents나 Home 아래 경로를 선택해 주세요',
    en: 'Access denied to the selected folder. Please choose a path under Documents or Home.',
  },
  SOURCE_FILE_NOT_FOUND: {
    ko: '관련 소스 파일을 찾지 못했습니다',
    en: 'Related source files were not found.',
  },
  WORD_TEMPLATE_PARSE_FAIL: {
    ko: 'Word 템플릿을 읽지 못했습니다. 파일이 손상되었거나 지원되지 않는 형식입니다',
    en: 'Failed to parse the Word template. The file may be corrupted or unsupported.',
  },
  WORD_UPLOAD_EXT_FAIL: {
    ko: '.docx 파일만 업로드할 수 있습니다',
    en: 'Only .docx files are supported.',
  },
  WORD_UPLOAD_SIZE_FAIL: {
    ko: '10MB 이하의 파일만 업로드할 수 있습니다',
    en: 'Only files under 10MB are supported.',
  },
  PAYLOAD_TOO_LARGE: {
    ko: '분석 데이터가 너무 커서 AI에 전달할 수 없습니다. 필터를 줄여 주세요',
    en: 'Analysis payload is too large for AI. Please reduce the scope.',
  },
  DOCX_GENERATION_FAIL: {
    ko: 'Word 문서 생성에 실패했습니다',
    en: 'Failed to generate Word document.',
  },
  FILE_SIZE_SMALL_WARNING: {
    ko: '파일이 1MB 미만입니다. 로그 양이 적어 AI 분석 품질이 낮을 수 있습니다',
    en: 'File is under 1MB. AI analysis quality may be limited due to small log volume.',
  },
  FILE_SIZE_LARGE_WARNING: {
    ko: '파일이 5MB 이상입니다. 요약 모드로 분석되어 스택트레이스와 소스코드가 제외됩니다',
    en: 'File is 5MB or larger. Summary mode is used; stack traces and source code are excluded.',
  },
};
