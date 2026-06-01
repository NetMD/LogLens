import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { DiagnosisInput, ChatMessageData, DiagnosisPhase, UnidirectionalResult } from "../types/diagnosis";
import type { AiApiError } from "../services/ai/types";
import { useLogStore } from "./logStore";

// 앱 모드: 파일 분석 vs 실시간 감시 (활성 탭 kind 파생 §7)
export type AppMode = "file" | "live";

// 메인 뷰: 스택트레이스 / 에러 패턴 / 실시간 로그 / 원본(raw) — R13 raw 추가
export type MainView = "stacktrace" | "errorPattern" | "liveLog" | "raw";

// 분석 도구 탭 타입
export type ToolTab = "history" | "compare" | "export" | "ai";

export type RotationReason = "FILE_ID_CHANGED" | "TRUNCATED" | "RECREATED";

interface RotationBannerState {
  visible: boolean;
  reason: RotationReason;
}

// ── AI 진단 fileId 스코프 상태 (FR-15, BL-11, §4.1/§4.2) ──
// 진단 reducer 상태(phase/messages/result/isStreaming)를 fileId 키 store로 승격하여
// 탭 전환 시(컴포넌트 언마운트) 상태 손실을 막는다 (AC-08-1/3).
export interface DiagnosisTabState {
  input: DiagnosisInput | null;
  isViewOpen: boolean;
  entrySource: "stacktrace" | "errorPattern" | "landing" | null;
  entryAppMode: AppMode | null;

  // reducer 상태 (탭 스코프)
  phase: DiagnosisPhase;
  progress: number;
  result: UnidirectionalResult | null;
  rawResponse: string;
  error: AiApiError | null;
  streamBuffer: string;
  messages: ChatMessageData[];
  isStreaming: boolean;
  streamingContent: string;
  lastScope: "selected" | "full";
}

export function makeInitialDiagnosisTabState(): DiagnosisTabState {
  return {
    input: null,
    isViewOpen: false,
    entrySource: null,
    entryAppMode: null,
    phase: "idle",
    progress: 0,
    result: null,
    rawResponse: "",
    error: null,
    streamBuffer: "",
    messages: [],
    isStreaming: false,
    streamingContent: "",
    lastScope: "selected",
  };
}

interface UiState {
  // mainView 는 R13에서 FileLogState(탭별)로 이관 — uiStore 의 전역 mainView 는 폐기.
  // appMode 도 활성 탭 kind 파생(useAppMode) 으로 전환.

  // 분석 도구 탭 (non-persist) — compare/history 만 앱레벨 (§7.3)
  activeToolTab: ToolTab | null;

  // 설정 모달 상태 (non-persist)
  isSettingsModalOpen: boolean;
  settingsModalScrollTarget: "about" | "ai" | null;

  // 사이드바 그룹 접힘 상태 (persist)
  sidebarFileGroupCollapsed: boolean;
  sidebarLiveGroupCollapsed: boolean;
  sidebarToolsGroupCollapsed: boolean;

  rotationBanner: RotationBannerState | null;

  // AI 진단 fileId 스코프 (§4.1)
  diagnoses: Record<string, DiagnosisTabState>;

  // 액션: 분석 도구 탭
  setActiveToolTab: (tab: ToolTab | null) => void;

  // 설정 모달 액션
  openSettingsModal: (scrollTarget?: "about" | "ai") => void;
  closeSettingsModal: () => void;
  clearSettingsScrollTarget: () => void;

  // 사이드바 그룹 토글
  toggleSidebarFileGroup: () => void;
  toggleSidebarLiveGroup: () => void;
  toggleSidebarToolsGroup: () => void;

  // AI 진단 액션 (activeFileId 자동 태깅)
  openDiagnosis: (
    input: DiagnosisInput,
    source?: "stacktrace" | "errorPattern" | "landing",
  ) => void;
  closeDiagnosis: () => void;
  ensureDiagnosisState: (fileId: string) => void;
  patchDiagnosis: (fileId: string, patch: Partial<DiagnosisTabState>) => void;
  removeDiagnosis: (fileId: string) => void;

  // 실시간 감시 배너
  showRotationBanner: (reason: RotationReason) => void;
  dismissRotationBanner: () => void;
}

// Rotation 배너 자동 dismiss 타이머 핸들 (store 외부 모듈 변수)
let rotationDismissTimer: ReturnType<typeof setTimeout> | null = null;

// 불변식 교정: file 모드에서 liveLog 는 허용하지 않음. raw 는 양쪽 모드 허용 (§7.2).
export function normalizeView(appMode: AppMode, view: MainView): MainView {
  if (appMode === "file" && view === "liveLog") return "stacktrace";
  return view;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeToolTab: null,

      isSettingsModalOpen: false,
      settingsModalScrollTarget: null,

      sidebarFileGroupCollapsed: false,
      sidebarLiveGroupCollapsed: false,
      sidebarToolsGroupCollapsed: false,

      rotationBanner: null,

      diagnoses: {},

      setActiveToolTab: (tab) => set({ activeToolTab: tab }),

      // 설정 모달 액션
      openSettingsModal: (scrollTarget) =>
        set({
          isSettingsModalOpen: true,
          settingsModalScrollTarget: scrollTarget ?? null,
        }),
      closeSettingsModal: () =>
        set({
          isSettingsModalOpen: false,
          settingsModalScrollTarget: null,
        }),
      clearSettingsScrollTarget: () => set({ settingsModalScrollTarget: null }),

      toggleSidebarFileGroup: () =>
        set((s) => ({
          sidebarFileGroupCollapsed: !s.sidebarFileGroupCollapsed,
        })),

      toggleSidebarLiveGroup: () =>
        set((s) => ({
          sidebarLiveGroupCollapsed: !s.sidebarLiveGroupCollapsed,
        })),

      toggleSidebarToolsGroup: () =>
        set((s) => ({
          sidebarToolsGroupCollapsed: !s.sidebarToolsGroupCollapsed,
        })),

      // AI 진단 액션 — activeFileId 자동 태깅 (§4.1)
      openDiagnosis: (input, source = "landing") => {
        const fid = useLogStore.getState().activeFileId;
        if (!fid) return;
        const appMode: AppMode =
          useLogStore.getState().files[fid]?.kind === "live" ? "live" : "file";
        set((s) => {
          const prev = s.diagnoses[fid] ?? makeInitialDiagnosisTabState();
          return {
            diagnoses: {
              ...s.diagnoses,
              [fid]: {
                ...prev,
                input,
                isViewOpen: true,
                entrySource: source,
                entryAppMode: appMode,
              },
            },
            activeToolTab: null,
          };
        });
      },
      closeDiagnosis: () => {
        const fid = useLogStore.getState().activeFileId;
        if (!fid) return;
        set((s) => {
          const prev = s.diagnoses[fid];
          if (!prev) return s;
          return {
            diagnoses: {
              ...s.diagnoses,
              [fid]: { ...prev, isViewOpen: false },
            },
          };
        });
      },
      ensureDiagnosisState: (fileId) =>
        set((s) => {
          if (s.diagnoses[fileId]) return s;
          return {
            diagnoses: {
              ...s.diagnoses,
              [fileId]: makeInitialDiagnosisTabState(),
            },
          };
        }),
      patchDiagnosis: (fileId, patch) =>
        set((s) => {
          const prev = s.diagnoses[fileId] ?? makeInitialDiagnosisTabState();
          return {
            diagnoses: { ...s.diagnoses, [fileId]: { ...prev, ...patch } },
          };
        }),
      removeDiagnosis: (fileId) =>
        set((s) => {
          if (!s.diagnoses[fileId]) return s;
          const next = { ...s.diagnoses };
          delete next[fileId];
          return { diagnoses: next };
        }),

      showRotationBanner: (reason) => {
        if (rotationDismissTimer) {
          clearTimeout(rotationDismissTimer);
          rotationDismissTimer = null;
        }
        set({ rotationBanner: { visible: true, reason } });
        rotationDismissTimer = setTimeout(() => {
          set({ rotationBanner: null });
          rotationDismissTimer = null;
        }, 5000);
      },

      dismissRotationBanner: () => {
        if (rotationDismissTimer) {
          clearTimeout(rotationDismissTimer);
          rotationDismissTimer = null;
        }
        set({ rotationBanner: null });
      },
    }),
    {
      name: "loglens-ui-store",
      version: 5,
      storage: createJSONStorage(() => localStorage),
      // persist 대상: 사이드바 그룹 접힘 상태만 유지
      partialize: (s) => ({
        sidebarFileGroupCollapsed: s.sidebarFileGroupCollapsed,
        sidebarLiveGroupCollapsed: s.sidebarLiveGroupCollapsed,
        sidebarToolsGroupCollapsed: s.sidebarToolsGroupCollapsed,
      }),
      migrate: (persisted, version) => {
        const base = (persisted as Record<string, unknown>) ?? {};
        const next: Record<string, unknown> = { ...base };
        if (version < 3) {
          next.sidebarFileGroupCollapsed =
            (base.sidebarAnalysisGroupCollapsed as boolean | undefined) ?? false;
          next.sidebarLiveGroupCollapsed = false;
          delete next.sidebarAnalysisGroupCollapsed;
        }
        if (version < 4) {
          delete next.isDemoMode;
          delete next.demoTargetFeature;
          delete next.isUpgradeModalOpen;
          delete next.upgradeTargetFeature;
          delete next.isLicenseModalOpen;
          delete next.activeProTab;
          if (next.settingsModalScrollTarget === "license") {
            next.settingsModalScrollTarget = null;
          }
          if (typeof next.sidebarToolsGroupCollapsed !== "boolean") {
            next.sidebarToolsGroupCollapsed = false;
          }
        }
        if (version < 5) {
          // v5: mainView/appMode/selectedEntryId 등 fileId 스코프 이관 — persist 대상 아님
          delete next.appMode;
          delete next.mainView;
          delete next.selectedEntryId;
          delete next.searchQuery;
        }
        return next as Partial<UiState>;
      },
    },
  ),
);

// ── appMode 파생 셀렉터 (BL-03, §7.1) ───────────────────────────────────
// uiStore.appMode 독립 set 제거 → 활성 탭 kind 파생. 빈 탭 시 기본 'file'.
export const useAppMode = (): AppMode =>
  useLogStore((s) =>
    s.activeFileId && s.files[s.activeFileId]?.kind === "live"
      ? "live"
      : "file",
  );

export function getAppMode(): AppMode {
  const { activeFileId, files } = useLogStore.getState();
  return activeFileId && files[activeFileId]?.kind === "live" ? "live" : "file";
}

// ── mainView 파생 (활성 탭의 mainView, FileLogState에 보존 §2.5/§7.2) ──
export const useMainView = (): MainView =>
  useLogStore((s) => {
    const f = s.activeFileId ? s.files[s.activeFileId] : null;
    if (!f) return "stacktrace";
    const kind = f.kind === "live" ? "live" : "file";
    return normalizeView(kind, f.mainView ?? (f.kind === "live" ? "liveLog" : "stacktrace"));
  });

// ── 활성 탭 진단 상태 셀렉터 ──
export const useActiveDiagnosisViewOpen = (): boolean => {
  const activeFileId = useLogStore((s) => s.activeFileId);
  return useUiStore((s) =>
    activeFileId ? s.diagnoses[activeFileId]?.isViewOpen ?? false : false,
  );
};

/** 활성 탭의 mainView 변경 (탭별 보존) */
export function setActiveMainView(view: MainView): void {
  const { activeFileId, files, patchTabUi } = useLogStore.getState();
  if (!activeFileId) return;
  const f = files[activeFileId];
  if (!f) return;
  const kind: AppMode = f.kind === "live" ? "live" : "file";
  patchTabUi(activeFileId, { mainView: normalizeView(kind, view) });
}
