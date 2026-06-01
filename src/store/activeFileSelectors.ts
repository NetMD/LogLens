// 활성 파일 파생 셀렉터 계층 (Compatibility Selector Layer) — 설계 §2.4 / §10
// 큐레이터 제약 #1: 모든 셀렉터는 단일 필드 selector(useLogStore 에 selector 인자 전달) 형태.
//   인자 없는 전체 구독 금지(G-1).
// H-2: activeFileId=null 시 매 렌더 새 [] 생성으로 인한 무한 리렌더 차단을 위해 EMPTY_ENTRIES 모듈 상수 사용.

import { useLogStore } from "./logStore";
import type {
  FileLogState,
  LogStoreState,
  RawSource,
} from "./logStore";
import { canGenerate, isGenerating } from "./exportStore";
import type { ExportState } from "./exportStore";
import type { LogEntry } from "../utils/logParser";
import type { AnalysisResult } from "../utils/errorAnalyzer";
import type { DiagnosisTabState } from "./uiStore";

// ★ 안정적 빈 상수 — 무한 리렌더 차단 (H-2)
const EMPTY_ENTRIES: LogEntry[] = [];

// ── 호환 셀렉터 (단일 필드 selector 유지) ────────────────────────────────

export const useActiveFileId = (): string | null =>
  useLogStore((s) => s.activeFileId);

export const useActiveFile = (): FileLogState | null =>
  useLogStore((s) => (s.activeFileId ? s.files[s.activeFileId] ?? null : null));

export const useActiveFileEntries = (): LogEntry[] =>
  useLogStore((s) =>
    s.activeFileId
      ? s.files[s.activeFileId]?.entries ?? EMPTY_ENTRIES
      : EMPTY_ENTRIES,
  );

export const useActiveFileAnalysis = (): AnalysisResult | null =>
  useLogStore((s) =>
    s.activeFileId ? s.files[s.activeFileId]?.analysis ?? null : null,
  );

export const useActiveFileIsParsing = (): boolean =>
  useLogStore((s) =>
    s.activeFileId ? s.files[s.activeFileId]?.isParsing ?? false : false,
  );

export const useActiveFileName = (): string | null =>
  useLogStore((s) =>
    s.activeFileId ? s.files[s.activeFileId]?.fileName ?? null : null,
  );

export const useActiveFileSize = (): number =>
  useLogStore((s) =>
    s.activeFileId ? s.files[s.activeFileId]?.fileSize ?? 0 : 0,
  );

export const useActiveFileProgress = (): number =>
  useLogStore((s) =>
    s.activeFileId ? s.files[s.activeFileId]?.progress ?? 0 : 0,
  );

export const useActiveFileParseError = (): string | null =>
  useLogStore((s) =>
    s.activeFileId ? s.files[s.activeFileId]?.parseError ?? null : null,
  );

export const useActiveFileWatchMode = (): FileLogState["watchMode"] =>
  useLogStore((s) =>
    s.activeFileId ? s.files[s.activeFileId]?.watchMode : undefined,
  );

export const useTabCount = (): number => useLogStore((s) => s.fileOrder.length);

// ── 헬퍼 (getState 기반 — 비반응형 조회) ─────────────────────────────────

/** 활성 파일 즉시 조회 (액션 내부용 — 클로저 캡처 금지) */
export function getActiveFile(): FileLogState | null {
  const { activeFileId, files } = useLogStore.getState();
  return activeFileId ? files[activeFileId] ?? null : null;
}

// ── 컨트롤 활성화 7헬퍼 (설계 §10) ──────────────────────────────────────

export function hasActiveTab(s: LogStoreState): boolean {
  return s.activeFileId !== null && !!s.files[s.activeFileId];
}

export function canShowRaw(
  fileId: string | null,
  files: Record<string, FileLogState>,
): boolean {
  if (!fileId) return false;
  const f = files[fileId];
  return !!f && !f.isParsing; // 파싱 완료 후 raw 진입
}

export function canCompare(
  a: string | null,
  b: string | null,
  files: Record<string, FileLogState>,
): boolean {
  return a !== null && b !== null && a !== b && !!files[a] && !!files[b];
}

export function isStreamingForFile(
  fileId: string | null,
  diagnoses: Record<string, DiagnosisTabState>,
): boolean {
  return fileId !== null && diagnoses[fileId]?.isStreaming === true;
}

export function canGenerateForFile(
  fileId: string | null,
  byFile: Record<string, ExportState>,
): boolean {
  if (!fileId) return false;
  return canGenerate(byFile[fileId]?.generationStatus ?? "idle");
}

export function needsCloseConfirm(
  fileId: string,
  files: Record<string, FileLogState>,
  byFile: Record<string, ExportState>,
  diagnoses: Record<string, DiagnosisTabState>,
): boolean {
  const f = files[fileId];
  if (!f) return false;
  return (
    f.isParsing ||
    f.watchMode === "watching" ||
    f.watchMode === "starting" ||
    isGenerating(byFile[fileId]?.generationStatus ?? "idle") ||
    diagnoses[fileId]?.isStreaming === true
  );
}

// isReclaimEligible 는 logStore 에서 export (회수 로직과 동일 모듈)
export { isReclaimEligible } from "./logStore";
export type { RawSource };
