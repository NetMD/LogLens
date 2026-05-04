import { useEffect } from "react";
import { useLogStore } from "./store/logStore";
import { useUiStore } from "./store/uiStore";
import { useSettingsStore } from "./store/settingsStore";
import { useSettings } from "./hooks/useSettings";
import type { AppMode, MainView, ToolTab } from "./store/uiStore";
import { MainLayout } from "./components/Layout/MainLayout";
import { LogDropZone } from "./components/LogDropZone";
import { StackTraceView } from "./components/StackTrace";
import { ErrorPatternView } from "./components/ErrorPattern";
import { SettingsModal } from "./components/SettingsModal";
import { HistoryView } from "./components/History/HistoryView";
import { useHistory } from "./hooks/useHistory";
import { useAiReportHistory } from "./hooks/useAiReportHistory";
import { ComparisonView } from "./components/Comparison/ComparisonView";
import { ExportView } from "./components/Export";
import { LiveLogView } from "./components/Watch/LiveLogView";
import { WatchStatusBadge } from "./components/Watch/WatchStatusBadge";
import { ErrorToastBridge } from "./components/Watch/ErrorToastBridge";
import { useLiveErrorAnalysis } from "./hooks/useLiveErrorAnalysis";
import { DiagnosisView } from "./components/diagnosis/DiagnosisView";
import { DiagnosisLanding } from "./components/diagnosis/DiagnosisLanding";

interface RenderCtx {
  isParsing: boolean;
  appMode: AppMode;
  mainView: MainView;
  activeToolTab: ToolTab | null;
  isDiagnosisViewOpen: boolean;
}

function App() {
  const entriesLength = useLogStore((s) => s.entries.length);
  const isParsing = useLogStore((s) => s.isParsing);
  const watchMode = useLogStore((s) => s.watchMode);
  const hasAnalysis = useLogStore((s) => s.analysis !== null);
  const appMode = useUiStore((s) => s.appMode);
  const mainView = useUiStore((s) => s.mainView);
  const activeToolTab = useUiStore((s) => s.activeToolTab);
  const isDiagnosisViewOpen = useUiStore((s) => s.isDiagnosisViewOpen);

  // 설정 로드 + 테마/폰트 적용
  const theme = useSettingsStore((s) => s.theme);
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const settingsInitialized = useSettingsStore((s) => s._initialized);
  const { load: loadSettings } = useSettings();
  const { load: loadHistory } = useHistory();
  const { load: loadAiReportHistory } = useAiReportHistory();

  // 라이선스 시스템 폐기에 따른 일회성 cleanup:
  // 구버전에서 localStorage 에 남은 'loglens-license' 키 제거
  useEffect(() => {
    try {
      if (localStorage.getItem('loglens-license') !== null) {
        localStorage.removeItem('loglens-license');
      }
    } catch {
      /* localStorage 접근 불가 환경은 무시 */
    }
  }, []);

  // 앱 초기화 시 settings.json -> history.json -> ai-report-history.json 순차 로드
  // loadHistory()가 maxHistoryCount를 참조하므로 loadSettings() 완료 후 실행해야 함
  // ai-report-history 는 settings/history 와 독립이므로 병렬 가능하나 순차로 단순 유지
  useEffect(() => {
    (async () => {
      if (!settingsInitialized) {
        await loadSettings();
      }
      await loadHistory();
      await loadAiReportHistory();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 테마 적용
  useEffect(() => {
    const root = document.documentElement;

    function applyTheme(resolved: 'dark' | 'light') {
      root.dataset.theme = resolved;
    }

    if (theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light');
      applyTheme(mql.matches ? 'dark' : 'light');
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    } else {
      applyTheme(theme);
    }
  }, [theme]);

  // 폰트 CSS 변수 적용 (로그 뷰어 영역 한정)
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--log-font-family', fontFamily);
    root.style.setProperty('--log-font-size', `${fontSize}px`);
  }, [fontFamily, fontSize]);

  // 실시간 감시 모드의 에러 패턴 갱신 (live + !liveLog)
  useLiveErrorAnalysis();

  const hasData = entriesLength > 0 || isParsing;
  const isWatchActive = watchMode === "watching" || watchMode === "starting";
  const showContent = hasData || isWatchActive || activeToolTab !== null;

  return (
    <MainLayout>
      {!showContent ? (
        <LogDropZone variant={appMode === "live" ? "live" : "file"} />
      ) : (
        <>
          {/* TabHeader: 데이터가 있고 도구 탭이 아닌 경우 표시 (파일: 분석 완료 후, 실시간: entries 있을 때) */}
          {/* AI 진단 화면이 열려 있으면 TabHeader 숨김 */}
          {(hasAnalysis || (appMode === "live" && entriesLength > 0)) &&
            activeToolTab === null &&
            !isDiagnosisViewOpen && <TabHeader />}

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {renderMainContent({
              isParsing,
              appMode,
              mainView,
              activeToolTab,
              isDiagnosisViewOpen,
            })}
          </div>
        </>
      )}

      {/* 설정 모달 */}
      <SettingsModal />
      {/* 전역 토스트 (sonner) — 1곳에만 마운트 */}
      <ErrorToastBridge />
    </MainLayout>
  );
}

// 메인 콘텐츠 렌더링 헬퍼.
function renderMainContent(ctx: RenderCtx) {
  const { isParsing, appMode, mainView, activeToolTab, isDiagnosisViewOpen } = ctx;

  // AI 진단 화면: isDiagnosisViewOpen이면 전체 main 영역을 대체
  if (isDiagnosisViewOpen) {
    return <DiagnosisView />;
  }

  // 분석 도구 탭별 라우팅
  if (activeToolTab === "history") return <HistoryView />;
  if (activeToolTab === "compare") return <ComparisonView />;
  if (activeToolTab === "export") return <ExportView />;
  if (activeToolTab === "ai") return <DiagnosisLanding />;

  // 2) 파일 모드에서 파싱 중이면 강제로 StackTraceView
  if (appMode === "file" && isParsing) {
    return <StackTraceView />;
  }

  // 3) 모드 → 뷰 2단 switch
  if (appMode === "file") {
    switch (mainView) {
      case "stacktrace":
        return <StackTraceView />;
      case "errorPattern":
        return <ErrorPatternView />;
      default:
        // file + liveLog 는 불변식 위반이므로 fallback
        return <StackTraceView />;
    }
  }

  // appMode === 'live'
  switch (mainView) {
    case "liveLog":
      return <LiveLogView />;
    case "stacktrace":
      return <StackTraceView />;
    case "errorPattern":
      return <ErrorPatternView />;
    default:
      return <LiveLogView />;
  }
}

// 파일 모드 전용 탭 헤더
function TabHeader() {
  const mainView = useUiStore((s) => s.mainView);
  const appMode = useUiStore((s) => s.appMode);
  const requestModeChange = useUiStore((s) => s.requestModeChange);
  const fileName = useLogStore((s) => s.fileName);

  // 실시간 모드: 실시간 로그 탭 추가
  const tabs: { view: MainView; label: string }[] = [
    ...(appMode === "live" ? [{ view: "liveLog" as MainView, label: "실시간 로그" }] : []),
    { view: "stacktrace", label: "스택트레이스" },
    { view: "errorPattern", label: "에러 패턴" },
  ];

  return (
    <div className="flex flex-col bg-[var(--color-bg-surface)] flex-shrink-0">
      {/* 1행: 탭 + 파일명 (파일 분석과 동일 구조) */}
      <div className="flex items-center border-b border-[var(--color-border-default)]">
        <div className="flex">
          {tabs.map(({ view, label }) => (
            <button
              key={view}
              onClick={() => requestModeChange({ appMode, mainView: view })}
              className={`px-5 py-3 text-sm border-b-2 transition-colors ${
                mainView === view
                  ? "border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]"
                  : "border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {fileName && (
          <div className="ml-auto px-4 flex items-center gap-2">
            <span
              className="text-xs text-[var(--color-text-disabled)] truncate max-w-[200px]"
              title={fileName}
            >
              {fileName}
            </span>
          </div>
        )}
      </div>

      {/* 2행: 감시 상태 뱃지 (실시간 모드만) */}
      {appMode === "live" && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--color-border-default)]">
          <WatchStatusBadge />
        </div>
      )}
    </div>
  );
}

export default App;
