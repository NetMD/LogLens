// AI 진단 기능 타입 정의

import type { LogEntry, StackFrame } from '../utils/logParser';
import type { AiProvider } from './settings';

// === 진입 페이로드 ===

export type DiagnosisEntryType = 'exception' | 'single';

/** 에러 패턴 화면에서 진입 시 전달 데이터 */
export interface ExceptionDiagnosisInput {
  type: 'exception';
  exceptionClass: string;      // 단축명 (NullPointerException)
  fullName: string;             // java.lang.NullPointerException
  count: number;
  stackTraces: StackFrame[][];  // 해당 예외의 모든 스택트레이스
  firstOccurrence: string;      // ISO-8601
  lastOccurrence: string;
  relatedLogs: LogEntry[];      // 각 에러 전후 5줄
}

/** 스택트레이스 카드에서 진입 시 전달 데이터 */
export interface SingleDiagnosisInput {
  type: 'single';
  logEntry: LogEntry;
  stackTrace: StackFrame[];
  contextLogs: LogEntry[];      // 전후 10줄
}

export type DiagnosisInput = ExceptionDiagnosisInput | SingleDiagnosisInput;

// === 단방향 분석 결과 ===

export interface UnidirectionalResult {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  severityReason: string;
  rootCause: string;
  solution: {
    description: string;
    codeExample?: {
      before: string;
      after: string;
      language: string;
    };
  };
  prevention: string[];
  relatedErrors: Array<{
    exceptionClass: string;
    reason: string;
  }>;
}

// === 채팅 메시지 ===

export interface ChatMessageData {
  role: 'user' | 'assistant' | 'system';  // system: 이전 분석 버블용
  content: string;
  timestamp: string;  // ISO-8601
}

// === 진단 히스토리 ===

export interface DiagnosisHistory {
  id: string;                       // crypto.randomUUID()
  savedAt: string;                  // ISO-8601
  exceptionClass: string;
  fullName: string;
  sourceFile: string;               // logStore.fileName
  provider: AiProvider;
  model: string;
  tokensUsed: number;
  estimatedCost: number;
  unidirectional?: UnidirectionalResult;
  conversation?: ChatMessageData[];
}

// === 진단 Phase ===

export type DiagnosisPhase =
  | 'idle'
  | 'preparing'
  | 'analyzing'
  | 'solving'
  | 'completed'
  | 'error'
  | 'partial';

// === 프로바이더별 토큰 단가 (예상 비용 계산용, 입력 토큰 기준 per 1K) ===

export const TOKEN_PRICE_PER_1K_INPUT: Record<AiProvider, number> = {
  claude:  0.015,    // Claude Opus 4 기준
  openai:  0.005,    // GPT-4o 기준
  gemini:  0.00035,  // Gemini 2.5 Flash 기준
  local:   0,
};

// === 진행률 메시지 상수 ===

export const DIAGNOSIS_PROGRESS_MESSAGES: Record<string, string> = {
  preparing: '에러 데이터 준비 중...',
  analyzing: 'AI가 스택트레이스를 분석하고 있습니다...',
  solving: '해결 방법을 찾고 있습니다...',
};

// === 추천 질문 상수 ===

export const SUGGESTED_QUESTIONS = [
  '이 에러의 원인이 뭔가요?',
  '고치는 코드 예시 보여줘',
  '이 에러가 재발하지 않으려면?',
  '관련된 다른 문제가 있을까요?',
] as const;

// === phase 목표 진행률 ===

export const PHASE_TARGETS: Record<DiagnosisPhase, number> = {
  idle: 0,
  preparing: 30,
  analyzing: 70,
  solving: 100,
  completed: 100,
  error: 0,
  partial: 100,
};
