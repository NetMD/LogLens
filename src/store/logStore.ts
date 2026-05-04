import { create } from "zustand";
import type { LogEntry } from "../utils/logParser";
import type { AnalysisResult } from "../utils/errorAnalyzer";

// 링버퍼 상한 (실시간 감시 시 메모리 폭주 방지)
const MAX_ENTRIES = 100_000;

export type WatchMode = "idle" | "starting" | "watching" | "error";

// 상태 전이 허용 테이블 (DEV warn)
const ALLOWED_WATCH_TRANSITIONS: Record<WatchMode, WatchMode[]> = {
  idle: ["starting"],
  starting: ["watching", "error", "idle"],
  watching: ["idle", "error"],
  error: ["starting", "idle"],
};

interface LogState {
  // 파일 정보
  fileName: string | null;
  filePath: string | null;
  fileSize: number;

  // 파싱 상태
  isParsing: boolean;
  progress: number; // 0-100
  entries: LogEntry[];
  analysis: AnalysisResult | null;
  parseError: string | null;
  parseFailCount: number;

  // 실시간 감시 상태
  watchMode: WatchMode;
  watchPath: string | null;
  watchSessionId: string | null;
  watchError: string | null;

  // Actions
  setFile: (name: string, path: string, size: number) => void;
  appendEntries: (newEntries: LogEntry[]) => void;
  setProgress: (p: number) => void;
  setAnalysis: (a: AnalysisResult) => void;
  setParsing: (v: boolean) => void;
  setParseError: (e: string | null) => void;
  incrementFailCount: (n: number) => void;
  reset: () => void;

  // Watch 액션
  setWatchMode: (mode: WatchMode) => void;
  setWatchSession: (sessionId: string | null, path: string | null) => void;
  setWatchError: (message: string | null) => void;
  resetWatch: () => void;
}

const initialState = {
  fileName: null,
  filePath: null,
  fileSize: 0,
  isParsing: false,
  progress: 0,
  entries: [],
  analysis: null,
  parseError: null,
  parseFailCount: 0,
  watchMode: "idle" as WatchMode,
  watchPath: null,
  watchSessionId: null,
  watchError: null,
};

export const useLogStore = create<LogState>((set, get) => ({
  ...initialState,

  setFile: (name, path, size) =>
    set({ fileName: name.replace(/\\/g, "/"), filePath: path, fileSize: size }),

  appendEntries: (newEntries) =>
    set((state) => {
      if (newEntries.length === 0) return state;
      const merged = state.entries.concat(newEntries);
      // 링버퍼: 상한 초과 시 앞쪽 제거
      if (merged.length > MAX_ENTRIES) {
        merged.splice(0, merged.length - MAX_ENTRIES);
      }
      return { entries: merged };
    }),

  setProgress: (p) => set({ progress: p }),

  setAnalysis: (a) => set({ analysis: a }),

  setParsing: (v) => set({ isParsing: v }),

  setParseError: (e) => set({ parseError: e, isParsing: false }),

  incrementFailCount: (n) =>
    set((state) => ({ parseFailCount: state.parseFailCount + n })),

  reset: () => set(initialState),

  setWatchMode: (mode) => {
    const cur = get().watchMode;
    if (cur === mode) return;
    if (import.meta.env.DEV) {
      const allowed = ALLOWED_WATCH_TRANSITIONS[cur] ?? [];
      if (!allowed.includes(mode)) {
        // 개발 중에만 경고 출력 (에러 상태 복구 등 비정상 전이 추적)
        console.warn(
          `[logStore] 비정상 watchMode 전이: ${cur} -> ${mode}`
        );
      }
    }
    set({ watchMode: mode });
  },

  setWatchSession: (sessionId, path) =>
    set({ watchSessionId: sessionId, watchPath: path }),

  setWatchError: (message) => set({ watchError: message }),

  resetWatch: () =>
    set({
      entries: [],
      analysis: null,
      parseFailCount: 0,
      parseError: null,
      watchError: null,
      progress: 0,
    }),
}));
