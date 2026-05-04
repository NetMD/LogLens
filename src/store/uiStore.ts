import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { DiagnosisInput } from "../types/diagnosis";

// 앱 모드: 파일 분석 vs 실시간 감시
export type AppMode = "file" | "live";

// 메인 뷰: 스택트레이스 / 에러 패턴 / 실시간 로그
export type MainView = "stacktrace" | "errorPattern" | "liveLog";

// 분석 도구 탭 타입
export type ToolTab = "history" | "compare" | "export" | "ai";

export type RotationReason = "FILE_ID_CHANGED" | "TRUNCATED" | "RECREATED";

interface RotationBannerState {
  visible: boolean;
  reason: RotationReason;
}

interface UiState {
  // 신규: 모드/뷰 상태 (non-persist)
  appMode: AppMode;
  mainView: MainView;

  // 분석 도구 탭 (non-persist)
  activeToolTab: ToolTab | null;

  selectedEntryId: string | null;
  searchQuery: string;

  // 설정 모달 상태 (non-persist)
  isSettingsModalOpen: boolean;
  settingsModalScrollTarget: 'about' | 'ai' | null;

  // 사이드바 그룹 접힘 상태 (persist)
  sidebarFileGroupCollapsed: boolean;
  sidebarLiveGroupCollapsed: boolean;
  sidebarToolsGroupCollapsed: boolean;

  // 실시간 감시 UI 상태
  autoScrollPaused: boolean;
  pendingNewLineCount: number;
  rotationBanner: RotationBannerState | null;

  // AI 진단 화면 상태 (non-persist)
  diagnosisInput: DiagnosisInput | null;
  isDiagnosisViewOpen: boolean;
  diagnosisEntrySource: 'stacktrace' | 'errorPattern' | 'landing' | null;
  diagnosisEntryAppMode: AppMode | null;

  // 액션: 모드/뷰
  setAppMode: (mode: AppMode) => void;
  setMainView: (view: MainView) => void;
  requestModeChange: (next: { appMode: AppMode; mainView: MainView }) => void;
  resetFileScopedUi: () => void;

  // 분석 도구 탭 액션
  setActiveToolTab: (tab: ToolTab | null) => void;

  setSelectedEntry: (id: string | null) => void;
  setSearchQuery: (q: string) => void;

  // 설정 모달 액션
  openSettingsModal: (scrollTarget?: 'about' | 'ai') => void;
  closeSettingsModal: () => void;
  clearSettingsScrollTarget: () => void;

  // 사이드바 그룹 토글
  toggleSidebarFileGroup: () => void;
  toggleSidebarLiveGroup: () => void;
  toggleSidebarToolsGroup: () => void;

  // AI 진단 액션
  openDiagnosis: (input: DiagnosisInput, source?: 'stacktrace' | 'errorPattern' | 'landing') => void;
  closeDiagnosis: () => void;

  // 실시간 감시 UI 액션
  setAutoScrollPaused: (paused: boolean) => void;
  incrementPendingNewLineCount: (n: number) => void;
  resetPendingNewLineCount: () => void;
  showRotationBanner: (reason: RotationReason) => void;
  dismissRotationBanner: () => void;
}

// Rotation 배너 자동 dismiss 타이머 핸들 (store 외부 모듈 변수)
let rotationDismissTimer: ReturnType<typeof setTimeout> | null = null;

// 불변식 교정: file 모드에서 liveLog 는 허용하지 않음
function normalizeView(appMode: AppMode, view: MainView): MainView {
  if (appMode === "file" && view === "liveLog") return "stacktrace";
  return view;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      appMode: "file",
      mainView: "stacktrace",
      activeToolTab: null,

      selectedEntryId: null,
      searchQuery: "",

      isSettingsModalOpen: false,
      settingsModalScrollTarget: null,

      sidebarFileGroupCollapsed: false,
      sidebarLiveGroupCollapsed: false,
      sidebarToolsGroupCollapsed: false,

      autoScrollPaused: false,
      pendingNewLineCount: 0,
      rotationBanner: null,

      diagnosisInput: null,
      isDiagnosisViewOpen: false,
      diagnosisEntrySource: null,
      diagnosisEntryAppMode: null,

      setAppMode: (mode) => set({ appMode: mode }),
      setMainView: (view) => set({ mainView: view }),

      // 모드/뷰 동시 전환 — 불변식 교정 + 도구 탭 초기화
      requestModeChange: ({ appMode, mainView }) => {
        const normalized = normalizeView(appMode, mainView);
        set({
          appMode,
          mainView: normalized,
          activeToolTab: null,
        });
      },

      // 파일 스코프 UI 초기화: 파일 해제 시 호출 (현재 모드 유지)
      resetFileScopedUi: () => {
        const currentMode = get().appMode;
        set({
          selectedEntryId: null,
          searchQuery: "",
          autoScrollPaused: false,
          pendingNewLineCount: 0,
          rotationBanner: null,
          activeToolTab: null,
          diagnosisInput: null,
          isDiagnosisViewOpen: false,
          diagnosisEntrySource: null,
          diagnosisEntryAppMode: null,
          appMode: currentMode,
          mainView: currentMode === "live" ? "liveLog" : "stacktrace",
        });
      },

      setActiveToolTab: (tab) => set({ activeToolTab: tab }),

      setSelectedEntry: (id) => set({ selectedEntryId: id }),

      // 설정 모달 액션
      openSettingsModal: (scrollTarget) => set({
        isSettingsModalOpen: true,
        settingsModalScrollTarget: scrollTarget ?? null,
      }),
      closeSettingsModal: () => set({
        isSettingsModalOpen: false,
        settingsModalScrollTarget: null,
      }),
      clearSettingsScrollTarget: () => set({ settingsModalScrollTarget: null }),

      setSearchQuery: (q) => set({ searchQuery: q }),

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

      // AI 진단 액션
      openDiagnosis: (input, source = 'landing') => set((s) => ({
        diagnosisInput: input,
        isDiagnosisViewOpen: true,
        diagnosisEntrySource: source,
        diagnosisEntryAppMode: s.appMode,
        activeToolTab: null,
      })),
      closeDiagnosis: () => set({
        diagnosisInput: null,
        isDiagnosisViewOpen: false,
        diagnosisEntrySource: null,
        diagnosisEntryAppMode: null,
      }),

      setAutoScrollPaused: (paused) => set({ autoScrollPaused: paused }),

      incrementPendingNewLineCount: (n) =>
        set((s) => ({ pendingNewLineCount: s.pendingNewLineCount + n })),

      resetPendingNewLineCount: () => set({ pendingNewLineCount: 0 }),

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
      version: 4,
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
          // v2 이하: sidebarAnalysisGroupCollapsed → sidebarFileGroupCollapsed
          next.sidebarFileGroupCollapsed =
            (base.sidebarAnalysisGroupCollapsed as boolean | undefined) ?? false;
          next.sidebarLiveGroupCollapsed = false;
          delete next.sidebarAnalysisGroupCollapsed;
        }
        if (version < 4) {
          // v4: 라이선스/데모/업그레이드 관련 필드 제거 + 도구 그룹 접힘 신설
          delete next.isDemoMode;
          delete next.demoTargetFeature;
          delete next.isUpgradeModalOpen;
          delete next.upgradeTargetFeature;
          delete next.isLicenseModalOpen;
          delete next.activeProTab;
          if (next.settingsModalScrollTarget === 'license') {
            next.settingsModalScrollTarget = null;
          }
          if (typeof next.sidebarToolsGroupCollapsed !== 'boolean') {
            next.sidebarToolsGroupCollapsed = false;
          }
        }
        return next as Partial<UiState>;
      },
    }
  )
);
