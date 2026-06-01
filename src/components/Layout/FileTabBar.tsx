// FileTabBar — 2단 탭바 (파일 탭 + mainView 탭) — R13 §3 / UX §3-1
// [EXT-002(loglens) 적용 — VARIANT_CONFIG] kind 아이콘은 선언 테이블로 매핑.
// [EXT-003(loglens) 검토] 탭 전환 상태 보존: 본 구현은 store-레벨(FileLogState)에 탭별 상태를
//   보존하므로(스크롤/검색/진단 store 승격), 메인 뷰 DOM 동시 마운트는 불필요(데이터가 store에 보존).
//   조건부 마운트로도 상태 손실 0 — 동시 마운트는 메모리 예산(회수) 정책과 충돌하므로 채택 안 함.
// roving tabindex: 활성 탭만 tabIndex=0, 나머지 -1. 좌/우/Home/End/Delete 키보드.

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { FileSearch, Radio, X, type LucideIcon } from "lucide-react";
import { useLogStore } from "../../store/logStore";
import {
  useMainView,
  useAppMode,
  setActiveMainView,
  type MainView,
  type AppMode,
} from "../../store/uiStore";
import { useExportStore } from "../../store/exportStore";
import {
  hasActiveTab,
  canShowRaw,
} from "../../store/activeFileSelectors";
import type { FileKind } from "../../store/logStore";
import { useCloseFile } from "../../hooks/useCloseFile";
import { activateLiveTab } from "../../hooks/useLogWatch";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { Tooltip } from "../shared/Tooltip";

// kind 아이콘 선언 테이블 (EXT-002 VARIANT_CONFIG 정신)
const KIND_CONFIG: Record<FileKind, { Icon: LucideIcon; ariaKey: string }> = {
  file: { Icon: FileSearch, ariaKey: "tabs.fileTabAria" },
  live: { Icon: Radio, ariaKey: "tabs.liveTabAria" },
};

function onTabClickPerf(fileId: string) {
  // §8 성능 측정 골격 — 탭 전환
  performance.mark("tab-switch-start");
  const { setActiveFileId, files } = useLogStore.getState();
  setActiveFileId(fileId);
  useExportStore.getState().setCurrentFileId(fileId);
  const f = files[fileId];
  if (f?.kind === "live") {
    void activateLiveTab(fileId);
  }
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      performance.mark("tab-switch-end");
      try {
        performance.measure("tab-switch", "tab-switch-start", "tab-switch-end");
        if (import.meta.env.DEV) {
          const entries = performance.getEntriesByName("tab-switch");
          const m = entries[entries.length - 1];
          console.debug("[perf] tab-switch", m?.duration);
        }
      } catch {
        /* mark 부재 무시 */
      }
    }),
  );
}

export function FileTabBar() {
  const { t } = useTranslation();
  const fileOrder = useLogStore((s) => s.fileOrder);
  const files = useLogStore((s) => s.files);
  const activeFileId = useLogStore((s) => s.activeFileId);
  const mainView = useMainView();
  const appMode = useAppMode();
  const closeFile = useCloseFile();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const focusTab = (fileId: string) => {
    tabRefs.current[fileId]?.focus();
  };

  const handleTabKeyDown = (
    e: React.KeyboardEvent,
    fileId: string,
    idx: number,
  ) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = fileOrder[(idx + 1) % fileOrder.length];
      focusTab(next);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = fileOrder[(idx - 1 + fileOrder.length) % fileOrder.length];
      focusTab(prev);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusTab(fileOrder[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      focusTab(fileOrder[fileOrder.length - 1]);
    } else if (e.key === "Delete" || (e.ctrlKey && e.key.toLowerCase() === "w")) {
      e.preventDefault();
      closeFile.close(fileId);
    }
  };

  // mainView 탭 목록 (활성 탭 kind 파생)
  const mainViewTabs: { view: MainView; labelKey: string; disabled: boolean }[] = (() => {
    const base: { view: MainView; labelKey: string; disabled: boolean }[] = [];
    if (appMode === "live") {
      base.push({ view: "liveLog", labelKey: "sidebar.realtimeLog", disabled: !hasActiveTab(useLogStore.getState()) });
    }
    base.push({ view: "stacktrace", labelKey: "sidebar.stackTrace", disabled: !hasActiveTab(useLogStore.getState()) });
    base.push({ view: "errorPattern", labelKey: "sidebar.errorPattern", disabled: !hasActiveTab(useLogStore.getState()) });
    base.push({ view: "raw", labelKey: "mainView.raw", disabled: !canShowRaw(activeFileId, files) });
    return base;
  })();

  if (fileOrder.length === 0) return null;

  return (
    <div className="flex flex-col bg-[var(--color-bg-surface)] flex-shrink-0">
      {/* 1단: 파일 탭 행 */}
      <div
        role="tablist"
        aria-label={t("tabs.tablistAria")}
        className="flex items-center border-b border-[var(--color-border-subtle)] overflow-x-auto"
      >
        {fileOrder.map((fileId, idx) => {
          const f = files[fileId];
          if (!f) return null;
          const isActive = fileId === activeFileId;
          const kindCfg = KIND_CONFIG[f.kind];
          const Icon = kindCfg.Icon;
          const isParsingTab = f.isParsing;
          const isError = f.parseError !== null || f.watchMode === "error";
          const isReclaimed = f.reclaimed === true;

          return (
            <button
              key={fileId}
              ref={(el) => {
                tabRefs.current[fileId] = el;
              }}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? "true" : undefined}
              tabIndex={isActive ? 0 : -1}
              onClick={() => {
                if (!isActive) onTabClickPerf(fileId);
              }}
              onKeyDown={(e) => handleTabKeyDown(e, fileId, idx)}
              className={`relative flex items-center gap-1.5 px-2.5 h-8 text-xs border-b-2 flex-shrink-0 focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none motion-safe:transition-colors ${
                isActive
                  ? "border-[var(--color-accent-primary)] bg-[var(--color-bg-base)] text-[var(--color-text-primary)]"
                  : "border-transparent text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
              } ${isReclaimed ? "opacity-60" : ""}`}
              title={f.filePath ?? f.fileName}
            >
              <Icon
                className={`w-3.5 h-3.5 flex-shrink-0 ${
                  f.kind === "live" && f.watchMode === "watching"
                    ? "motion-safe:animate-pulse"
                    : ""
                }`}
                aria-label={t(kindCfg.ariaKey, { name: f.fileName })}
              />
              <span className="truncate max-w-[160px]">{f.fileName}</span>

              {/* 상태점 */}
              {isParsingTab ? (
                <Tooltip content={t("tabs.statusParsing", { progress: Math.round(f.progress) })}>
                  <span
                    aria-hidden="true"
                    className="w-[7px] h-[7px] rounded-full bg-[var(--color-accent-primary)] flex-shrink-0"
                  />
                </Tooltip>
              ) : isError ? (
                <Tooltip content={t("tabs.statusError")}>
                  <span
                    aria-hidden="true"
                    className="w-[7px] h-[7px] rounded-full bg-[var(--color-status-error-fg)] flex-shrink-0"
                  />
                </Tooltip>
              ) : isReclaimed ? (
                <Tooltip content={t("tabs.statusReclaimed")}>
                  <span
                    aria-hidden="true"
                    className="w-[7px] h-[7px] rounded-full bg-[var(--color-text-disabled)] flex-shrink-0"
                  />
                </Tooltip>
              ) : null}

              {/* 닫기 버튼 */}
              <span
                role="button"
                tabIndex={-1}
                aria-label={t("tabs.closeTabAria", { name: f.fileName })}
                onClick={(e) => {
                  e.stopPropagation();
                  closeFile.close(fileId);
                }}
                className="p-0.5 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] flex-shrink-0"
              >
                <X className="w-3 h-3" />
              </span>

              {/* 진행률 라인 (파싱중만, scaleX) */}
              {isParsingTab && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 w-full h-px bg-[var(--color-accent-primary)] origin-left"
                  style={{ transform: `scaleX(${f.progress / 100})` }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* 2단: mainView 탭 행 */}
      <div
        role="tablist"
        aria-label={t("mainView.tablistAria")}
        className="flex items-center border-b border-[var(--color-border-default)]"
      >
        {mainViewTabs.map(({ view, labelKey, disabled }) => {
          const isActive = mainView === view;
          return (
            <button
              key={view}
              role="tab"
              aria-selected={isActive}
              disabled={disabled}
              onClick={() => setActiveMainView(view)}
              className={`px-5 py-3 text-sm border-b-2 transition-colors ${
                isActive
                  ? "border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]"
                  : "border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {t(labelKey)}
            </button>
          );
        })}
      </div>

      {/* 닫기 확인 다이얼로그 */}
      <ConfirmDialog
        open={closeFile.confirmOpen}
        title={
          closeFile.pendingFileId &&
          useLogStore.getState().files[closeFile.pendingFileId]?.isParsing
            ? t("tabs.closeWhileParsingQ")
            : t("tabs.closeWhileBusyQ")
        }
        description={t("tabs.closeConfirmDesc")}
        confirmLabel={t("tabs.closeConfirm")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={closeFile.confirmClose}
        onCancel={closeFile.cancelClose}
        returnFocusRef={closeFile.triggerRef}
        isBusy={closeFile.isClosing}
      />
    </div>
  );
}

// appMode 타입 재export (사용처 편의)
export type { AppMode };
