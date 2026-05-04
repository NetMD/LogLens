// 분석 히스토리 타입 정의 + 검증 + 변환

import type { LogLevel } from '../utils/logParser';
import type { ErrorSummary } from '../utils/errorAnalyzer';

/** 분석 히스토리 단일 항목 */
export interface HistoryEntry {
  id: string;                        // crypto.randomUUID()
  analyzedAt: string;                // ISO 8601
  fileName: string;
  filePath: string;
  fileSize: number;                  // bytes
  summary: HistorySummary;
}

/** 히스토리 요약 (timeline 제외) */
export interface HistorySummary {
  totalEntries: number;
  levelCounts: Record<LogLevel, number>;
  topErrors: ErrorSummary[];         // 최대 10개
  parseFailCount: number;
}

/** maxHistoryCount 설정 옵션 */
export const MAX_HISTORY_COUNT_OPTIONS = [20, 50, 100] as const;
export type MaxHistoryCount = typeof MAX_HISTORY_COUNT_OPTIONS[number];
export const DEFAULT_MAX_HISTORY_COUNT: MaxHistoryCount = 50;

/** history.json 로드 시 개별 항목 유효성 검증 */
export function validateHistoryEntry(raw: unknown): raw is HistoryEntry {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || obj.id === '') return false;
  if (typeof obj.analyzedAt !== 'string' || obj.analyzedAt === '') return false;
  if (typeof obj.fileName !== 'string' || obj.fileName === '') return false;
  if (typeof obj.summary !== 'object' || obj.summary === null) return false;
  const summary = obj.summary as Record<string, unknown>;
  if (typeof summary.totalEntries !== 'number') return false;
  if (typeof summary.levelCounts !== 'object' || summary.levelCounts === null) return false;
  return true;
}

/** AnalysisResult -> HistorySummary 변환 (timeline 제외) */
export function toHistorySummary(analysis: {
  totalEntries: number;
  levelCounts: Record<LogLevel, number>;
  topErrors: ErrorSummary[];
  parseFailCount: number;
}): HistorySummary {
  return {
    totalEntries: analysis.totalEntries,
    levelCounts: { ...analysis.levelCounts },
    topErrors: analysis.topErrors.slice(0, 10),
    parseFailCount: analysis.parseFailCount,
  };
}
