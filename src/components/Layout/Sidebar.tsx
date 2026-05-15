import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  BarChart3,
  ChevronDown,
  FileSearch,
  FileDown,
  GitCompare,
  History,
  Settings,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import logoUrl from "../../assets/logo.svg";
import { useLogStore } from "../../store/logStore";
import {
  useUiStore,
  type AppMode,
  type MainView,
  type ToolTab,
} from "../../store/uiStore";
import { useCloseFile } from "../../hooks/useCloseFile";
import { useModeSwitch } from "../../hooks/useModeSwitch";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { Tooltip } from "../shared/Tooltip";
import { GroupHeader } from "./GroupHeader";

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// 그룹 컨텍스트 — 비활성 사유 판정용
interface GroupContext {
  appMode: AppMode;
  hasFileData: boolean;
  hasLiveSession: boolean;
}

// NavItem 의 label / disabledReason 은 i18n 키 문자열 (렌더 시점에 t() 적용).
// 모듈 레벨 상수에서 t() 호출 불가능 — 컴포넌트 안에서 문자열을 변환한다.
interface NavItem {
  view: MainView;
  labelKey: string;
  Icon: LucideIcon;
  /** 비활성 사유 i18n 키 (null = 활성). 'fileModeOnly' | 'loadFileFirst' | 'liveModeOnly' | 'startWatchFirst' 중 하나. */
  disabledKey: (ctx: GroupContext) => string | null;
}

const FILE_ITEMS: NavItem[] = [
  {
    view: "stacktrace",
    labelKey: "sidebar.stackTrace",
    Icon: FileSearch,
    disabledKey: (c) =>
      c.appMode !== "file" ? "sidebar.fileModeOnly" : c.hasFileData ? null : "sidebar.loadFileFirst",
  },
  {
    view: "errorPattern",
    labelKey: "sidebar.errorPattern",
    Icon: BarChart3,
    disabledKey: (c) =>
      c.appMode !== "file" ? "sidebar.fileModeOnly" : c.hasFileData ? null : "sidebar.loadFileFirst",
  },
];

const LIVE_ITEMS: NavItem[] = [
  {
    view: "liveLog",
    labelKey: "sidebar.realtimeLog",
    Icon: Activity,
    disabledKey: (c) =>
      c.appMode !== "live" ? "sidebar.liveModeOnly" : c.hasLiveSession ? null : "sidebar.startWatchFirst",
  },
  {
    view: "stacktrace",
    labelKey: "sidebar.stackTrace",
    Icon: FileSearch,
    disabledKey: (c) =>
      c.appMode !== "live" ? "sidebar.liveModeOnly" : c.hasLiveSession ? null : "sidebar.startWatchFirst",
  },
  {
    view: "errorPattern",
    labelKey: "sidebar.errorPattern",
    Icon: BarChart3,
    disabledKey: (c) =>
      c.appMode !== "live" ? "sidebar.liveModeOnly" : c.hasLiveSession ? null : "sidebar.startWatchFirst",
  },
];

// 분석 도구 메뉴 (라이선스/Pro 폐기 후 모든 사용자에게 동일하게 노출)
interface ToolNavItem {
  tab: ToolTab;
  labelKey: string;
  Icon: LucideIcon;
}

const TOOL_NAV_ITEMS: ToolNavItem[] = [
  { tab: "history", labelKey: "sidebar.history", Icon: History },
  { tab: "compare", labelKey: "sidebar.logComparison", Icon: GitCompare },
  { tab: "export", labelKey: "sidebar.pdfExport", Icon: FileDown },
  { tab: "ai", labelKey: "sidebar.aiDiagnosis", Icon: Sparkles },
];

export function Sidebar() {
  const { t } = useTranslation();
  const fileName = useLogStore((s) => s.fileName);
  const fileSize = useLogStore((s) => s.fileSize);
  const analysis = useLogStore((s) => s.analysis);
  const isParsing = useLogStore((s) => s.isParsing);
  const progress = useLogStore((s) => s.progress);
  const watchMode = useLogStore((s) => s.watchMode);
  const entriesLength = useLogStore((s) => s.entries.length);

  const appMode = useUiStore((s) => s.appMode);
  const mainView = useUiStore((s) => s.mainView);
  const requestModeChange = useUiStore((s) => s.requestModeChange);
  const activeToolTab = useUiStore((s) => s.activeToolTab);
  const isDiagnosisViewOpen = useUiStore((s) => s.isDiagnosisViewOpen);
  const setActiveToolTab = useUiStore((s) => s.setActiveToolTab);
  const fileCollapsed = useUiStore((s) => s.sidebarFileGroupCollapsed);
  const liveCollapsed = useUiStore((s) => s.sidebarLiveGroupCollapsed);
  const toolsCollapsed = useUiStore((s) => s.sidebarToolsGroupCollapsed);
  const toggleFileGroup = useUiStore((s) => s.toggleSidebarFileGroup);
  const toggleLiveGroup = useUiStore((s) => s.toggleSidebarLiveGroup);
  const toggleToolsGroup = useUiStore((s) => s.toggleSidebarToolsGroup);

  // 파일 해제 훅 — ConfirmDialog 와 연결
  const closeFile = useCloseFile();
  // 모드 전환 훅 — 그룹 라벨 클릭 시 사용
  const modeSwitch = useModeSwitch();

  // 사이드바 그룹 a11y: nav 요소의 aria-labelledby / aria-controls 대상 id
  const fileLabelId = useId();
  const liveLabelId = useId();
  const toolsLabelId = useId();
  const toolsListId = useId();

  // 파일/실시간 데이터 유무 — 라이선스/데모 분기 폐기 후 단순화
  const hasFileData = entriesLength > 0 || isParsing;
  const hasLiveSession = watchMode === "watching" || watchMode === "starting";

  const ctx: GroupContext = { appMode, hasFileData, hasLiveSession };

  const closeDiagnosis = useUiStore((s) => s.closeDiagnosis);

  // 분석 도구 메뉴 클릭: 진단 화면 열려있으면 닫고 탭 전환
  const handleToolNavClick = (tab: ToolTab) => {
    if (isDiagnosisViewOpen) closeDiagnosis();
    setActiveToolTab(tab);
  };

  const handleNavClick = (group: AppMode, item: NavItem) => {
    // AI 진단 화면이 열려있으면 닫기
    if (isDiagnosisViewOpen) {
      closeDiagnosis();
    }

    const reasonKey = item.disabledKey(ctx);

    if (reasonKey) {
      // 비활성 항목 클릭 → 해당 모드의 파일 선택 화면으로 이동
      if (group !== appMode) {
        // 다른 모드 → 확인창 필요
        modeSwitch.requestSwitch(group);
      } else {
        const defaultView: MainView = group === "live" ? "liveLog" : "stacktrace";
        requestModeChange({ appMode: group, mainView: defaultView });
      }
      return;
    }

    if (group !== appMode) {
      // 다른 모드의 활성 항목 → 확인창 필요 (데이터 있으면)
      modeSwitch.requestSwitch(group);
    } else {
      requestModeChange({ appMode: group, mainView: item.view });
    }
  };

  const renderNavItems = (group: AppMode, items: NavItem[]) =>
    items.map((item) => {
      const reasonKey = item.disabledKey(ctx);
      const isDisabled = reasonKey !== null;
      const isActive =
        appMode === group && mainView === item.view && activeToolTab === null && !isDiagnosisViewOpen;
      const { Icon, labelKey, view } = item;
      const label = t(labelKey);

      const button = (
        <button
          type="button"
          onClick={() => handleNavClick(group, item)}
          aria-disabled={isDisabled || undefined}
          className={`relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] motion-safe:transition-colors ${
            isActive
              ? "bg-[var(--color-button-primary-bg)]/20 text-[var(--color-accent-primary)]"
              : isDisabled
                ? "text-[var(--color-text-tertiary)] opacity-50"
                : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
          }`}
          title={label}
        >
          {isActive && (
            <span
              aria-hidden="true"
              className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-[var(--color-accent-primary)] rounded-r"
            />
          )}
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      );

      return (
        <div key={`${group}-${view}`}>
          {isDisabled ? (
            <Tooltip content={t(reasonKey as string)}>{button}</Tooltip>
          ) : (
            button
          )}
        </div>
      );
    });

  // 분석 도구 메뉴 렌더 — Pro 뱃지/자물쇠 아이콘 폐기, 모든 사용자에게 동일 노출
  const renderToolNavItems = (items: ToolNavItem[]) =>
    items.map(({ tab, labelKey, Icon }) => {
      const isActive = activeToolTab === tab || (tab === 'ai' && isDiagnosisViewOpen);
      const label = t(labelKey);
      return (
        <button
          key={tab}
          type="button"
          onClick={() => handleToolNavClick(tab)}
          title={label}
          className={`relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] motion-safe:transition-colors ${
            isActive
              ? "bg-[var(--color-button-primary-bg)]/20 text-[var(--color-accent-primary)]"
              : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
          }`}
        >
          {isActive && (
            <span
              aria-hidden="true"
              className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-[var(--color-accent-primary)] rounded-r"
            />
          )}
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 text-left truncate">{label}</span>
        </button>
      );
    });

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col bg-[var(--color-bg-surface)] border-r border-[var(--color-border-default)]">
      {/* 로고 */}
      <div className="px-4 py-4 border-b border-[var(--color-border-default)]">
        <div className="flex items-center gap-2">
          <img
            src={logoUrl}
            alt={t('sidebar.appName')}
            className="w-8 h-8 rounded-lg flex-shrink-0"
            draggable={false}
          />
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">{t('sidebar.appName')}</span>
        </div>
      </div>

      {/* 파일 정보 (X 버튼 포함) */}
      {(fileName || isParsing) && (
        <div className="relative px-4 py-3 border-b border-[var(--color-border-default)]">
          <button
            type="button"
            onClick={closeFile.close}
            aria-label={t('sidebar.closeFile')}
            className="absolute top-2 right-2 p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
          >
            <X className="w-4 h-4" />
          </button>
          <p className="text-xs text-[var(--color-text-tertiary)] mb-1">{t('sidebar.currentFileLabel')}</p>
          <p
            className="text-xs text-[var(--color-text-secondary)] truncate font-medium pr-6"
            title={fileName ?? ""}
          >
            {fileName ?? t('sidebar.parsingInProgress')}
          </p>
          {fileSize > 0 && (
            <p className="text-xs text-[var(--color-text-disabled)] mt-0.5">
              {formatFileSize(fileSize)}
            </p>
          )}
          {isParsing && (
            <div className="mt-2">
              <div className="h-1 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--color-accent-primary)] rounded-full motion-safe:transition-all motion-safe:duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[10px] text-[var(--color-text-disabled)] mt-1">
                {t('sidebar.parsingProgress', { progress: Math.round(progress) })}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 요약 통계 */}
      {analysis && (
        <div className="px-4 py-3 border-b border-[var(--color-border-default)] space-y-1.5">
          <p className="text-xs text-[var(--color-text-tertiary)]">{t('sidebar.summary')}</p>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-[var(--color-bg-elevated)] rounded px-2 py-1.5">
              <p className="text-[10px] text-[var(--color-text-tertiary)]">{t('sidebar.summaryAll')}</p>
              <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
                {analysis.totalEntries.toLocaleString()}
              </p>
            </div>
            <div className="bg-[var(--color-status-error-bg)] dark:bg-[var(--color-status-error-bg)] border border-[var(--color-status-error-border)] dark:border-[var(--color-status-error-border)] rounded px-2 py-1.5">
              <p className="text-[10px] text-[var(--color-status-error-fg)]">{t('sidebar.summaryError')}</p>
              <p className="text-sm font-semibold text-[var(--color-status-error-fg)] dark:text-[var(--color-status-error-fg)]">
                {(
                  analysis.levelCounts.ERROR + analysis.levelCounts.FATAL
                ).toLocaleString()}
              </p>
            </div>
            <div className="bg-[var(--color-status-warn-bg)] bg-[var(--color-status-warn-bg)] border border-[var(--color-status-warn-border)] dark:border-[var(--color-status-warn-border)] rounded px-2 py-1.5">
              <p className="text-[10px] text-[var(--color-status-warn-fg)]">{t('sidebar.summaryWarn')}</p>
              <p className="text-sm font-semibold text-[var(--color-status-warn-fg)] dark:text-[var(--color-status-warn-fg)]">
                {analysis.levelCounts.WARN.toLocaleString()}
              </p>
            </div>
            <div className="bg-[var(--color-bg-elevated)] rounded px-2 py-1.5">
              <p className="text-[10px] text-[var(--color-text-tertiary)]">{t('sidebar.summaryExceptions')}</p>
              <p className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                {t('sidebar.exceptionKindCount', { count: analysis.topErrors.length })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 파일 분석 그룹 */}
      <nav
        className="pt-3 pb-1"
        role="group"
        aria-labelledby={fileLabelId}
      >
        <GroupHeader
          label={t('sidebar.fileAnalysis')}
          collapsed={fileCollapsed}
          accent="file"
          onLabelClick={() => modeSwitch.requestSwitch("file")}
          onToggle={toggleFileGroup}
          labelAriaLabel={t('sidebar.switchToFile')}
          labelId={fileLabelId}
          isActive={appMode === "file"}
        />
        {!fileCollapsed && (
          <div className="px-2 space-y-0.5">{renderNavItems("file", FILE_ITEMS)}</div>
        )}
      </nav>

      {/* 실시간 감시 그룹 */}
      <nav
        className="pt-3 pb-1"
        role="group"
        aria-labelledby={liveLabelId}
      >
        <GroupHeader
          label={t('sidebar.realtime')}
          collapsed={liveCollapsed}
          accent="live"
          onLabelClick={() => modeSwitch.requestSwitch("live")}
          onToggle={toggleLiveGroup}
          labelAriaLabel={t('sidebar.switchToLive')}
          labelId={liveLabelId}
          isActive={appMode === "live"}
        />
        {!liveCollapsed && (
          <div className="px-2 space-y-0.5">{renderNavItems("live", LIVE_ITEMS)}</div>
        )}
      </nav>

      {/* 분석 도구 그룹 */}
      <nav className="pt-3 pb-1" role="group" aria-labelledby={toolsLabelId}>
        <div className="flex items-center justify-between px-3 py-1.5">
          <h3
            id={toolsLabelId}
            className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]"
          >
            {t('sidebar.groupTools')}
          </h3>
          <button
            type="button"
            onClick={toggleToolsGroup}
            aria-expanded={!toolsCollapsed}
            aria-controls={toolsListId}
            aria-label={toolsCollapsed ? t('sidebar.toolsExpand') : t('sidebar.toolsCollapse')}
            className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 motion-safe:transition-transform ${toolsCollapsed ? "-rotate-90" : ""}`}
            />
          </button>
        </div>
        {!toolsCollapsed && (
          <div id={toolsListId} className="px-2 space-y-0.5">
            {renderToolNavItems(TOOL_NAV_ITEMS)}
          </div>
        )}
      </nav>

      {/* 사이드바 여백 채움 */}
      <div className="flex-1 min-h-0" />

      {/* 하단 상태바: LogLens 정보 + 설정 아이콘 */}
      <div className="px-4 py-2 mb-1 border-t border-[var(--color-border-default)] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => useUiStore.getState().openSettingsModal('about')}
          aria-label={t('sidebar.viewLogLensInfo')}
          className="flex items-center gap-1.5 text-xs text-[var(--color-text-disabled)] hover:text-[var(--color-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none rounded px-1 py-0.5 motion-safe:transition-colors"
        >
          <span aria-hidden="true">●</span>
          <span>{t('sidebar.appName')}</span>
        </button>
        <Tooltip content={t('sidebar.openSettings')}>
          <button
            type="button"
            onClick={() => useUiStore.getState().openSettingsModal()}
            aria-label={t('sidebar.openSettings')}
            className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
          >
            <Settings className="w-4 h-4" />
          </button>
        </Tooltip>
      </div>

      {/* 모드 전환 확인 다이얼로그 */}
      <ConfirmDialog
        open={modeSwitch.confirmOpen}
        title={
          modeSwitch.pendingTarget === "live"
            ? t('sidebar.switchToRealtimeQ')
            : t('sidebar.switchToFileQ')
        }
        description={
          modeSwitch.pendingTarget === "live"
            ? t('sidebar.switchToLiveDesc')
            : t('sidebar.switchToFileDesc')
        }
        confirmLabel={t('sidebar.switchConfirm')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={modeSwitch.confirmSwitch}
        onCancel={modeSwitch.cancelSwitch}
        extraAction={{
          label: t('sidebar.switchKeep'),
          onClick: modeSwitch.keepDataSwitch,
        }}
        isBusy={modeSwitch.isSwitching}
      />

      {/* 파일 해제 확인 다이얼로그 */}
      <ConfirmDialog
        open={closeFile.confirmOpen}
        title={t('sidebar.closeFileQ')}
        description={
          hasLiveSession
            ? t('sidebar.closeFileLiveDesc')
            : t('sidebar.closeFileFileDesc')
        }
        confirmLabel={t('common.close')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={closeFile.confirmClose}
        onCancel={closeFile.cancelClose}
        returnFocusRef={closeFile.triggerRef}
        isBusy={closeFile.isClosing}
      />
    </aside>
  );
}
