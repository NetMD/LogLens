import { useEffect, useState } from "react";
import i18n from "./i18n";
import { isSupportedLanguage } from "./i18n/languages";
import { useLogStore } from "./store/logStore";
import { useUiStore, useAppMode, useMainView, useActiveDiagnosisViewOpen } from "./store/uiStore";
import type { AppMode, MainView, ToolTab } from "./store/uiStore";
import { useActiveFileIsParsing } from "./store/activeFileSelectors";
import { useSettingsStore } from "./store/settingsStore";
import { useSettings } from "./hooks/useSettings";
import { useGlobalFileDrop } from "./hooks/useGlobalFileDrop";
import { MainLayout } from "./components/Layout/MainLayout";
import { FileTabBar } from "./components/Layout/FileTabBar";
import { LogDropZone } from "./components/LogDropZone";
import { StackTraceView } from "./components/StackTrace";
import { ErrorPatternView } from "./components/ErrorPattern";
import { RawView } from "./components/RawView";
import { SettingsModal } from "./components/SettingsModal";
import { HistoryView } from "./components/History/HistoryView";
import { useHistory } from "./hooks/useHistory";
import { useAiReportHistory } from "./hooks/useAiReportHistory";
import { ComparisonView } from "./components/Comparison/ComparisonView";
import { ExportView } from "./components/Export";
import { LiveLogView } from "./components/Watch/LiveLogView";
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
  // R13: 전역 단일 드롭 리스너 (App에서 1회만 등록, onDragDropEvent Webview당 1개 — G-6)
  useGlobalFileDrop();

  const tabCount = useLogStore((s) => s.fileOrder.length);
  const isParsing = useActiveFileIsParsing();
  const appMode = useAppMode();
  const mainView = useMainView();
  const activeToolTab = useUiStore((s) => s.activeToolTab);
  // 활성 탭의 진단 화면 열림 여부
  const isDiagnosisViewOpen = useActiveDiagnosisViewOpen();

  // 설정 로드 + 테마/폰트 적용
  const theme = useSettingsStore((s) => s.theme);
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const language = useSettingsStore((s) => s.language);
  const settingsInitialized = useSettingsStore((s) => s._initialized);
  const { load: loadSettings } = useSettings();

  const [i18nReady, setI18nReady] = useState<boolean>(i18n.isInitialized);
  useEffect(() => {
    if (i18n.isInitialized) {
      setI18nReady(true);
      return;
    }
    const onInit = () => setI18nReady(true);
    i18n.on("initialized", onInit);
    return () => {
      i18n.off("initialized", onInit);
    };
  }, []);
  const { load: loadHistory } = useHistory();
  const { load: loadAiReportHistory } = useAiReportHistory();

  // 라이선스 시스템 폐기에 따른 일회성 cleanup
  useEffect(() => {
    try {
      if (localStorage.getItem("loglens-license") !== null) {
        localStorage.removeItem("loglens-license");
      }
    } catch {
      /* localStorage 접근 불가 환경은 무시 */
    }
  }, []);

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
    function applyTheme(resolved: "dark" | "light") {
      root.dataset.theme = resolved;
    }
    if (theme === "system") {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? "dark" : "light");
      applyTheme(mql.matches ? "dark" : "light");
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    } else {
      applyTheme(theme);
    }
  }, [theme]);

  // 폰트 CSS 변수 적용
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--log-font-family", fontFamily);
    root.style.setProperty("--log-font-size", `${fontSize}px`);
  }, [fontFamily, fontSize]);

  useEffect(() => {
    if (!settingsInitialized) return;
    if (!isSupportedLanguage(language)) return;
    if (i18n.language === language) return;
    void i18n.changeLanguage(language);
  }, [language, settingsInitialized]);

  useEffect(() => {
    if (isSupportedLanguage(language)) {
      document.documentElement.lang = language;
    }
  }, [language]);

  // 실시간 감시 모드의 에러 패턴 갱신
  useLiveErrorAnalysis();

  // 탭 0개 & 도구 없음 → LogDropZone (BL-09). 전역 드롭은 항상 살아있음.
  const showContent = tabCount > 0 || activeToolTab !== null;

  void i18nReady;

  return (
    <MainLayout>
      {!showContent ? (
        <LogDropZone variant={appMode === "live" ? "live" : "file"} />
      ) : (
        <>
          {/* FileTabBar: 탭이 있고 도구 탭/진단뷰가 아닌 경우 표시 */}
          {tabCount > 0 && activeToolTab === null && !isDiagnosisViewOpen && (
            <FileTabBar />
          )}

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

  // AI 진단 화면: 전체 main 영역 대체
  if (isDiagnosisViewOpen) {
    return <DiagnosisView />;
  }

  // 분석 도구 탭별 라우팅 (compare/history 앱레벨 + export/ai 활성탭 종속)
  if (activeToolTab === "history") return <HistoryView />;
  if (activeToolTab === "compare") return <ComparisonView />;
  if (activeToolTab === "export") return <ExportView />;
  if (activeToolTab === "ai") return <DiagnosisLanding />;

  // 파일 모드 + 파싱 중이면 강제로 StackTraceView (raw 제외)
  if (appMode === "file" && isParsing && mainView !== "raw") {
    return <StackTraceView />;
  }

  switch (mainView) {
    case "stacktrace":
      return <StackTraceView />;
    case "errorPattern":
      return <ErrorPatternView />;
    case "raw":
      return <RawView />;
    case "liveLog":
      return appMode === "live" ? <LiveLogView /> : <StackTraceView />;
    default:
      return appMode === "live" ? <LiveLogView /> : <StackTraceView />;
  }
}

export default App;
