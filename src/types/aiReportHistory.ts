// AI 리포트 히스토리 타입 (Step 4 + Step 5 비교 세션)
// analysis history(HistoryEntry) 와 별도로, AI가 생성한 리포트의 마크다운/메타를 보존한다.
// 목적: 같은 로그로 다시 생성하지 않고도 PDF/DOCX 로 "재다운로드" 가능하게 하는 것.

import type { AiProvider } from './settings';
import type { PresetType } from '../store/exportStore';

/** 비교 세션 내 개별 프로바이더 결과 */
export interface ComparisonHistoryResult {
  provider: AiProvider;
  model: string;
  status: 'done' | 'error';
  tokensUsed: number | null;
  estimatedCostUsd: number | null;
  markdown: string | null;       // error 일 때 null
  error: string | null;          // done 일 때 null
  elapsedSec: number | null;
}

/** AI 리포트 히스토리 단일 항목
 *
 *  - `comparisonResults` 가 undefined 면 **단일 생성** 항목 (기존)
 *  - `comparisonResults` 가 있으면 **비교 세션** 항목 (Step 5)
 *    이 경우 top-level provider/model/tokensUsed/estimatedCostUsd/markdown 은
 *    더미 값(빈 문자열 등)이며 실제 데이터는 comparisonResults 안에 있다. */
export interface AiReportHistoryEntry {
  id: string;                                // crypto.randomUUID()
  generatedAt: string;                       // ISO 8601

  // 소스 로그 메타 (히스토리 카드 보조 정보)
  sourceFileName: string;                    // 어떤 로그를 분석했는지
  sourceFileSize: number;                    // bytes

  // 생성 옵션 (재다운로드 시 파일명/제목 복원에 필요)
  presetType: PresetType;
  inputMode: 'preset' | 'upload';
  uploadedFileName: string | null;
  outputLanguage: 'ko' | 'en';
  outputFormat: 'pdf' | 'docx';

  // 사용 자원 (단일 모드 전용 — 비교 모드에서는 더미)
  provider: AiProvider;
  model: string;
  tokensUsed: number | null;
  estimatedCostUsd: number | null;

  // 콘텐츠 (단일 모드: 실제 마크다운 / 비교 모드: 빈 문자열)
  markdown: string;

  // Step 5: 비교 세션일 때만 존재
  comparisonResults?: ComparisonHistoryResult[];
}

/** FIFO 상한 (너무 크면 Tauri store 직렬화 비용 ↑) */
export const AI_REPORT_HISTORY_MAX = 30;

/** 단일 생성 항목인지 (comparisonResults 미존재) */
export function isSingleEntry(e: AiReportHistoryEntry): boolean {
  return !e.comparisonResults || e.comparisonResults.length === 0;
}

/** 로드 시 개별 항목 유효성 검증 */
export function validateAiReportHistoryEntry(raw: unknown): raw is AiReportHistoryEntry {
  if (typeof raw !== 'object' || raw === null) return false;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id === '') return false;
  if (typeof o.generatedAt !== 'string' || o.generatedAt === '') return false;
  if (typeof o.sourceFileName !== 'string') return false;
  if (typeof o.sourceFileSize !== 'number') return false;
  if (typeof o.presetType !== 'string') return false;
  if (o.inputMode !== 'preset' && o.inputMode !== 'upload') return false;
  if (o.uploadedFileName !== null && typeof o.uploadedFileName !== 'string') return false;
  if (o.outputLanguage !== 'ko' && o.outputLanguage !== 'en') return false;
  if (o.outputFormat !== 'pdf' && o.outputFormat !== 'docx') return false;
  if (typeof o.provider !== 'string') return false;
  if (typeof o.model !== 'string') return false;

  // 비교 세션: comparisonResults 가 있으면 markdown 이 빈 문자열이어도 허용
  const hasComparison = Array.isArray(o.comparisonResults) && (o.comparisonResults as unknown[]).length > 0;
  if (hasComparison) {
    if (typeof o.markdown !== 'string') return false;
  } else {
    if (typeof o.markdown !== 'string' || o.markdown === '') return false;
  }
  return true;
}
