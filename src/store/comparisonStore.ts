// 비교 기능 전용 Zustand store
// 기존 logStore와 완전히 독립된 상태 관리

import { create } from "zustand";
import type { LogEntry } from "../utils/logParser";
import type { AnalysisResult } from "../utils/errorAnalyzer";
import type { ComparisonResult } from "../utils/comparisonAnalyzer";

// --- 타입 정의 ---

/** 비교 화면의 3단계 phase */
export type ComparisonPhase = "select" | "parsing" | "result";

/** 한쪽 파일의 전체 상태 */
export interface ComparisonFileState {
  filePath: string | null;
  fileName: string | null;
  fileSize: number;
  firstTimestamp: string | null;

  isParsing: boolean;
  progress: number; // 0-100
  parseError: string | null;

  entries: LogEntry[];
  analysis: AnalysisResult | null;
}

interface ComparisonStoreState {
  fileA: ComparisonFileState;
  fileB: ComparisonFileState;
  comparisonResult: ComparisonResult | null;

  // 파일 메타 설정
  setFileMeta: (side: "A" | "B", name: string, path: string, size: number) => void;
  // 파싱 상태
  setParsing: (side: "A" | "B", v: boolean) => void;
  setProgress: (side: "A" | "B", p: number) => void;
  setParseError: (side: "A" | "B", e: string | null) => void;
  // 엔트리 축적
  appendEntries: (side: "A" | "B", entries: LogEntry[]) => void;
  // 분석 결과
  setAnalysis: (side: "A" | "B", a: AnalysisResult) => void;
  setFirstTimestamp: (side: "A" | "B", ts: string | null) => void;
  // 비교 결과
  setComparisonResult: (r: ComparisonResult) => void;
  // 초기화
  resetSide: (side: "A" | "B") => void;
  reset: () => void;
}

// --- 초기값 ---

const INITIAL_FILE_STATE: ComparisonFileState = {
  filePath: null,
  fileName: null,
  fileSize: 0,
  firstTimestamp: null,
  isParsing: false,
  progress: 0,
  parseError: null,
  entries: [],
  analysis: null,
};

// --- phase 파생 상태 함수 ---
// phase를 store 필드가 아닌 getter 함수로 계산
// 근거: isParsing, analysis, comparisonResult 조합으로 유일하게 결정됨

export function getPhase(state: {
  fileA: ComparisonFileState;
  fileB: ComparisonFileState;
  comparisonResult: ComparisonResult | null;
}): ComparisonPhase {
  // result: 양쪽 모두 analysis 존재 + comparisonResult 존재
  if (state.fileA.analysis && state.fileB.analysis && state.comparisonResult) {
    return "result";
  }
  // parsing: 최소 한쪽이 isParsing
  if (state.fileA.isParsing || state.fileB.isParsing) {
    return "parsing";
  }
  // 한쪽 완료 + 다른쪽 파일 선택됨 (아직 파싱 시작 전 대기)
  if (
    (state.fileA.analysis && state.fileB.filePath && !state.fileB.analysis) ||
    (state.fileB.analysis && state.fileA.filePath && !state.fileA.analysis)
  ) {
    return "parsing";
  }
  return "select";
}

// --- 내부 헬퍼: side에 따라 fileA 또는 fileB를 업데이트 ---

function updateSide(
  state: ComparisonStoreState,
  side: "A" | "B",
  patch: Partial<ComparisonFileState>
): Partial<ComparisonStoreState> {
  const key = side === "A" ? "fileA" : "fileB";
  return { [key]: { ...state[key], ...patch } };
}

// --- Store 생성 ---

export const useComparisonStore = create<ComparisonStoreState>((set) => ({
  fileA: { ...INITIAL_FILE_STATE },
  fileB: { ...INITIAL_FILE_STATE },
  comparisonResult: null,

  setFileMeta: (side, name, path, size) =>
    set((s) =>
      updateSide(s, side, {
        fileName: name.replace(/\\/g, "/"),
        filePath: path,
        fileSize: size,
      })
    ),

  setParsing: (side, v) => set((s) => updateSide(s, side, { isParsing: v })),

  setProgress: (side, p) => set((s) => updateSide(s, side, { progress: p })),

  setParseError: (side, e) =>
    set((s) => updateSide(s, side, { parseError: e, isParsing: false })),

  appendEntries: (side, entries) =>
    set((s) => {
      const key = side === "A" ? "fileA" : "fileB";
      const current = s[key];
      return { [key]: { ...current, entries: current.entries.concat(entries) } };
    }),

  setAnalysis: (side, a) => set((s) => updateSide(s, side, { analysis: a })),

  setFirstTimestamp: (side, ts) =>
    set((s) => updateSide(s, side, { firstTimestamp: ts })),

  setComparisonResult: (r) => set({ comparisonResult: r }),

  resetSide: (side) =>
    set((s) => ({
      ...updateSide(s, side, { ...INITIAL_FILE_STATE }),
      comparisonResult: null, // 한쪽 초기화하면 비교 결과도 무효
    })),

  reset: () =>
    set({
      fileA: { ...INITIAL_FILE_STATE },
      fileB: { ...INITIAL_FILE_STATE },
      comparisonResult: null,
    }),
}));
