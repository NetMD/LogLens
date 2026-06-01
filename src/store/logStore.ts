// logStore — 다중 파일 탭 (R13)
// 단일 파일 → files: Record<fileId, FileLogState> 맵으로 마이그레이션 (설계 §2).
// 큐레이터 제약: 단일 필드 selector(useLogStore 에 selector 인자 전달) 유지, 인자 없는 전체구독 금지.
// 호환 셀렉터 계층(useActiveFile* 등)은 src/store/activeFileSelectors.ts 참조.

import { create } from "zustand";
import type { LogEntry, LogLevel } from "../utils/logParser";
import type { AnalysisResult } from "../utils/errorAnalyzer";
import type { MainView } from "./uiStore";
import { toast } from "sonner";
import i18n from "../i18n";

// 링버퍼 상한 (실시간 감시 시 메모리 폭주 방지) — 파일별 독립 적용
const MAX_ENTRIES = 100_000;

// ── 메모리 회수 상수 (측정 기반 잠정값 — dogfooding 다중탭 실측 후 조정, 절대값 고정 금지. NFR-B/Q-D3) ──
export const RAW_INLINE_THRESHOLD_BYTES = 100 * 1024 * 1024; // Raw A/B 임계 (BL-16)
const HEAP_BUDGET_BYTES = 800 * 1024 * 1024; // 측정 기반 잠정 예산 (회수 트리거)
const ENTRY_HEAP_ESTIMATE = 280; // byte/엔트리 (측정 기반 환산, 프롬프트 250-300)
const RAW_LINE_HEAP_ESTIMATE = 280; // byte/raw 라인

export type WatchMode = "idle" | "starting" | "watching" | "error";
export type FileKind = "file" | "live";
export type RawSource = "A" | "B";

// 상태 전이 허용 테이블 (DEV warn) — 파일별 유지
const ALLOWED_WATCH_TRANSITIONS: Record<WatchMode, WatchMode[]> = {
  idle: ["starting"],
  starting: ["watching", "error", "idle"],
  watching: ["idle", "error"],
  error: ["starting", "idle"],
};

export interface FileLogState {
  fileId: string; // crypto.randomUUID()
  kind: FileKind; // 활성 탭 kind 가 appMode 파생 (BL-03)
  fileName: string;
  filePath: string | null; // \ → / 정규화. 재드롭 동일성 판정 키 (BL-04)
  fileSize: number;
  isParsing: boolean;
  progress: number; // 0–100
  entries: LogEntry[]; // 링버퍼 상한 MAX_ENTRIES (파일별 독립)
  analysis: AnalysisResult | null;
  parseError: string | null;
  parseFailCount: number;

  // 기능3 Raw
  rawLines?: string[]; // A안 — Raw 보기 연 탭만. 회수 시 undefined (BL-15/21)
  rawSource?: RawSource; // 임계치 라우팅 결과 (BL-16)
  rawLineIndex?: number; // B안: 인덱스 총 라인 수 (오프셋 인덱스는 Rust 보관)

  // 메모리 회수
  reclaimed?: boolean; // 재활성 시 재파싱 (BL-19/20)
  lastActiveAt: number; // LRU 회수 우선순위 (Date.now())

  // live 전용 (전역 watch 4필드 이관)
  watchMode?: WatchMode;
  watchPath?: string | null;
  watchSessionId?: string | null;
  watchError?: string | null;
  lastReadOffset?: number; // catch-up 재개 오프셋 (GATE-R13-1)

  // 탭-스코프 UI (Q-D4: FileLogState에 둔다 §2.5)
  selectedEntryId?: string | null;
  searchQuery?: string;
  levelFilter?: LogLevel | "ALL";
  scrollIndex?: number;
  rawScrollIndex?: number;
  mainView?: MainView;
  autoScrollPaused?: boolean; // live 전용
  pendingNewLineCount?: number; // live 전용
}

export interface LogStoreState {
  files: Record<string, FileLogState>;
  fileOrder: string[]; // 탭 정렬 순서 (불변식: 모든 원소가 files의 키)
  activeFileId: string | null;

  // 탭 라이프사이클
  addFileTab: (init: {
    fileId: string;
    kind: FileKind;
    fileName: string;
    filePath: string | null;
    fileSize: number;
  }) => void;
  removeFileTab: (fileId: string) => void;
  setActiveFileId: (fileId: string | null) => void;

  // 파일별 데이터 (모두 첫 인자 fileId)
  appendEntries: (fileId: string, newEntries: LogEntry[]) => void;
  setProgress: (fileId: string, p: number) => void;
  setAnalysis: (fileId: string, a: AnalysisResult) => void;
  setParsing: (fileId: string, v: boolean) => void;
  setParseError: (fileId: string, e: string | null) => void;
  incrementFailCount: (fileId: string, n: number) => void;
  setRawLines: (
    fileId: string,
    lines: string[] | undefined,
    source: RawSource,
  ) => void;
  setRawLineIndex: (fileId: string, lineCount: number, source: RawSource) => void;
  setFileName: (fileId: string, name: string, path: string, size: number) => void;

  // watch (fileId 스코프)
  setWatchMode: (fileId: string, mode: WatchMode) => void;
  setWatchSession: (
    fileId: string,
    sessionId: string | null,
    path: string | null,
  ) => void;
  setWatchError: (fileId: string, message: string | null) => void;
  setLastReadOffset: (fileId: string, offset: number) => void;

  // 탭-스코프 UI
  patchTabUi: (
    fileId: string,
    patch: Partial<
      Pick<
        FileLogState,
        | "selectedEntryId"
        | "searchQuery"
        | "levelFilter"
        | "scrollIndex"
        | "rawScrollIndex"
        | "mainView"
        | "autoScrollPaused"
        | "pendingNewLineCount"
      >
    >,
  ) => void;

  // 회수
  reclaimFile: (fileId: string) => void;
}

function makeInitialFileState(init: {
  fileId: string;
  kind: FileKind;
  fileName: string;
  filePath: string | null;
  fileSize: number;
}): FileLogState {
  return {
    fileId: init.fileId,
    kind: init.kind,
    fileName: init.fileName.replace(/\\/g, "/"),
    filePath: init.filePath,
    fileSize: init.fileSize,
    isParsing: false,
    progress: 0,
    entries: [],
    analysis: null,
    parseError: null,
    parseFailCount: 0,
    reclaimed: false,
    lastActiveAt: Date.now(),
    // live 기본
    watchMode: init.kind === "live" ? "idle" : undefined,
    watchPath: init.kind === "live" ? init.filePath : undefined,
    watchSessionId: null,
    watchError: null,
    // 탭-스코프 UI 기본
    selectedEntryId: null,
    searchQuery: "",
    levelFilter: "ALL",
    mainView: init.kind === "live" ? "liveLog" : "stacktrace",
    autoScrollPaused: false,
    pendingNewLineCount: 0,
  };
}

export const useLogStore = create<LogStoreState>((set) => ({
  files: {},
  fileOrder: [],
  activeFileId: null,

  addFileTab: (init) =>
    set((state) => {
      if (state.files[init.fileId]) return state; // 중복 가드
      return {
        files: {
          ...state.files,
          [init.fileId]: makeInitialFileState(init),
        },
        fileOrder: [...state.fileOrder, init.fileId],
      };
    }),

  removeFileTab: (fileId) =>
    set((state) => {
      if (!state.files[fileId]) return state;
      const nextFiles = { ...state.files };
      delete nextFiles[fileId];
      const nextOrder = state.fileOrder.filter((id) => id !== fileId);
      return { files: nextFiles, fileOrder: nextOrder };
    }),

  setActiveFileId: (fileId) =>
    set((state) => {
      if (fileId === null) return { activeFileId: null };
      const f = state.files[fileId];
      if (!f) return state;
      return {
        activeFileId: fileId,
        files: {
          ...state.files,
          [fileId]: { ...f, lastActiveAt: Date.now() },
        },
      };
    }),

  appendEntries: (fileId, newEntries) =>
    set((state) => {
      if (newEntries.length === 0) return state;
      const f = state.files[fileId];
      if (!f) return state; // 회수/닫힌 탭 가드
      const merged = f.entries.concat(newEntries);
      // 링버퍼: 상한 초과 시 앞쪽 제거 (파일별 독립)
      if (merged.length > MAX_ENTRIES) {
        merged.splice(0, merged.length - MAX_ENTRIES);
      }
      return { files: { ...state.files, [fileId]: { ...f, entries: merged } } };
    }),

  setProgress: (fileId, p) =>
    set((state) => {
      const f = state.files[fileId];
      if (!f) return state;
      return { files: { ...state.files, [fileId]: { ...f, progress: p } } };
    }),

  setAnalysis: (fileId, a) =>
    set((state) => {
      const f = state.files[fileId];
      if (!f) return state;
      return { files: { ...state.files, [fileId]: { ...f, analysis: a } } };
    }),

  setParsing: (fileId, v) =>
    set((state) => {
      const f = state.files[fileId];
      if (!f) return state;
      return { files: { ...state.files, [fileId]: { ...f, isParsing: v } } };
    }),

  setParseError: (fileId, e) =>
    set((state) => {
      const f = state.files[fileId];
      if (!f) return state;
      return {
        files: {
          ...state.files,
          [fileId]: { ...f, parseError: e, isParsing: false },
        },
      };
    }),

  incrementFailCount: (fileId, n) =>
    set((state) => {
      const f = state.files[fileId];
      if (!f) return state;
      return {
        files: {
          ...state.files,
          [fileId]: { ...f, parseFailCount: f.parseFailCount + n },
        },
      };
    }),

  setRawLines: (fileId, lines, source) =>
    set((state) => {
      const f = state.files[fileId];
      if (!f) return state;
      return {
        files: {
          ...state.files,
          [fileId]: { ...f, rawLines: lines, rawSource: source },
        },
      };
    }),

  setRawLineIndex: (fileId, lineCount, source) =>
    set((state) => {
      const f = state.files[fileId];
      if (!f) return state;
      return {
        files: {
          ...state.files,
          [fileId]: { ...f, rawLineIndex: lineCount, rawSource: source },
        },
      };
    }),

  setFileName: (fileId, name, path, size) =>
    set((state) => {
      const f = state.files[fileId];
      if (!f) return state;
      return {
        files: {
          ...state.files,
          [fileId]: {
            ...f,
            fileName: name.replace(/\\/g, "/"),
            filePath: path,
            fileSize: size,
          },
        },
      };
    }),

  setWatchMode: (fileId, mode) =>
    set((state) => {
      const f = state.files[fileId];
      if (!f) return state;
      const cur = f.watchMode ?? "idle";
      if (cur === mode) return state;
      if (import.meta.env.DEV) {
        const allowed = ALLOWED_WATCH_TRANSITIONS[cur] ?? [];
        if (!allowed.includes(mode)) {
          console.warn(`[logStore] 비정상 watchMode 전이: ${cur} -> ${mode}`);
        }
      }
      return { files: { ...state.files, [fileId]: { ...f, watchMode: mode } } };
    }),

  setWatchSession: (fileId, sessionId, path) =>
    set((state) => {
      const f = state.files[fileId];
      if (!f) return state;
      return {
        files: {
          ...state.files,
          [fileId]: { ...f, watchSessionId: sessionId, watchPath: path },
        },
      };
    }),

  setWatchError: (fileId, message) =>
    set((state) => {
      const f = state.files[fileId];
      if (!f) return state;
      return {
        files: {
          ...state.files,
          [fileId]: { ...f, watchError: message },
        },
      };
    }),

  setLastReadOffset: (fileId, offset) =>
    set((state) => {
      const f = state.files[fileId];
      if (!f) return state;
      return {
        files: {
          ...state.files,
          [fileId]: { ...f, lastReadOffset: offset },
        },
      };
    }),

  patchTabUi: (fileId, patch) =>
    set((state) => {
      const f = state.files[fileId];
      if (!f) return state;
      return { files: { ...state.files, [fileId]: { ...f, ...patch } } };
    }),

  reclaimFile: (fileId) =>
    set((state) => {
      const f = state.files[fileId];
      if (!f) return state;
      return {
        files: {
          ...state.files,
          [fileId]: {
            ...f,
            entries: [],
            rawLines: undefined,
            rawLineIndex: undefined,
            analysis: null,
            reclaimed: true,
          },
        },
      };
    }),
}));

// ── 메모리 회수: 예산 추산 + LRU ────────────────────────────────────────

export function estimateFileHeap(f: FileLogState): number {
  return (
    f.entries.length * ENTRY_HEAP_ESTIMATE +
    (f.rawLines?.length ?? 0) * RAW_LINE_HEAP_ESTIMATE
  );
}

/**
 * 회수 자격: 활성 탭 아님 + 파싱 중 아님 + 이미 회수되지 않음 + filePath 존재.
 * 진단 스트리밍/Export 생성 중 제외는 호출부에서 추가 검사 (planner §7-2).
 */
export function isReclaimEligible(
  fileId: string,
  files: Record<string, FileLogState>,
  activeFileId: string | null,
): boolean {
  const f = files[fileId];
  if (!f) return false;
  if (fileId === activeFileId) return false;
  if (f.isParsing) return false;
  return !f.reclaimed && f.filePath !== null;
}

/**
 * 예산 초과 시 LRU(오래 비활성 우선) 비활성 탭 회수.
 * extraEligibilityGuard: 진단/Export 진행 중 탭 추가 보호 (호출부 주입).
 * 반환: 회수된 탭 수.
 */
export function runReclaimIfNeeded(
  extraEligibilityGuard?: (fileId: string) => boolean,
): number {
  const { files, fileOrder, activeFileId } = useLogStore.getState();
  let used = fileOrder.reduce((s, id) => s + estimateFileHeap(files[id]), 0);
  if (used < HEAP_BUDGET_BYTES) return 0;

  const candidates = fileOrder
    .filter((id) => isReclaimEligible(id, files, activeFileId))
    .filter((id) => (extraEligibilityGuard ? extraEligibilityGuard(id) : true))
    .sort((a, b) => files[a].lastActiveAt - files[b].lastActiveAt); // LRU

  let reclaimed = 0;
  for (const victim of candidates) {
    if (used < HEAP_BUDGET_BYTES) break;
    used -= estimateFileHeap(files[victim]);
    useLogStore.getState().reclaimFile(victim);
    reclaimed++;
  }
  if (reclaimed > 0) {
    toast.warning(i18n.t("tabs.memoryReclaimed", { count: reclaimed }));
  }
  return reclaimed;
}
