// 히스토리 메인 컨테이너: 목록 / 상세 / 빈 상태를 selectedId 기반으로 전환
// 비교 선택 기능: 2개 항목 선택 → 비교 화면 이동

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { GitCompare, X } from "lucide-react";
import { useHistoryStore } from "../../store/historyStore";
import { useUiStore } from "../../store/uiStore";
import { useComparisonStore } from "../../store/comparisonStore";
import { useLogStore } from "../../store/logStore";
import { useExportStore } from "../../store/exportStore";
import { useHistory } from "../../hooks/useHistory";
import { useHistorySelection } from "../../hooks/useHistorySelection";
import { useComparisonFile } from "../../hooks/useComparisonFile";
import { useLogFile } from "../../hooks/useLogFile";
import type { HistoryEntry } from "../../types/history";
import { HistoryRow } from "./HistoryRow";
import { HistoryDetail } from "./HistoryDetail";
import { HistoryEmpty } from "./HistoryEmpty";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { ERROR_LABELS } from "../../constants/errorLabels";

export function HistoryView() {
  const { t } = useTranslation();
  const entries = useHistoryStore((s) => s.entries);
  const selectedId = useHistoryStore((s) => s.selectedId);
  const isLoaded = useHistoryStore((s) => s.isLoaded);
  const setSelectedId = useHistoryStore((s) => s.setSelectedId);
  const { remove, clear } = useHistory();
  const { startComparison } = useComparisonFile();
  const { loadFileAsTab } = useLogFile();

  // 비교 선택 상태
  const selection = useHistorySelection();

  // 행 ref Map (포커스 복귀용)
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const prevSelectedIdRef = useRef<string | null>(null);
  const clearAllBtnRef = useRef<HTMLButtonElement>(null);

  // 전체 삭제 ConfirmDialog 상태
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // 상세 -> 목록 복귀 시 포커스 복원
  useEffect(() => {
    if (selectedId === null && prevSelectedIdRef.current !== null) {
      const prevRow = rowRefs.current.get(prevSelectedIdRef.current);
      if (prevRow) {
        prevRow.focus();
      } else {
        const firstRow = rowRefs.current.values().next().value;
        if (firstRow) {
          (firstRow as HTMLTableRowElement).focus();
        } else {
          clearAllBtnRef.current?.focus();
        }
      }
    }
    prevSelectedIdRef.current = selectedId;
  }, [selectedId]);

  // PDF 내보내기 버튼 클릭: 파일 존재 여부에 따라 새 탭 재파싱 or 요약 fallback 탭 (BL-14)
  const handleExportPdf = async (entry: HistoryEntry) => {
    // 파일 존재 확인
    let fileExists = false;
    try {
      await invoke('get_file_metadata', { path: entry.filePath });
      fileExists = true;
    } catch {
      fileExists = false;
    }

    if (fileExists) {
      // 원본 파일 존재 -> 새 탭 생성 + 재파싱 + ExportView 전환 (BL-14)
      useUiStore.getState().setActiveToolTab('export');
      try {
        await loadFileAsTab(entry.filePath);
        const fid = useLogStore.getState().activeFileId;
        if (fid) {
          useExportStore.getState().ensureFileState(fid);
          useExportStore.getState().setCurrentFileId(fid);
          useExportStore.getState().setStateForFile(fid, { isFromHistory: false });
        }
      } catch (e) {
        toast.error(t('history.openFailed'), { description: String(e) });
      }
      return;
    }

    // 원본 파일 없음 -> 요약 fallback 새 탭 (BL-14)
    const fileId = crypto.randomUUID();
    useLogStore.getState().addFileTab({
      fileId,
      kind: 'file',
      fileName: entry.fileName,
      filePath: entry.filePath,
      fileSize: entry.fileSize,
    });
    useLogStore.getState().setActiveFileId(fileId);
    useLogStore.getState().setAnalysis(fileId, {
      totalEntries: entry.summary.totalEntries,
      levelCounts: entry.summary.levelCounts,
      topErrors: entry.summary.topErrors,
      parseFailCount: entry.summary.parseFailCount,
      timeline: [],
    });

    // export store 초기화 + fallback 플래그 설정 (스택트레이스/타임라인 제외)
    useExportStore.getState().ensureFileState(fileId);
    useExportStore.getState().setCurrentFileId(fileId);
    useExportStore.getState().setStateForFile(fileId, {
      title: '',
      saveFileName: '',
      isFromHistory: true,
      includeSections: {
        info: true,
        summaryCards: true,
        timeline: false,
        topErrors: true,
        stacktrace: false,
      },
    });

    useUiStore.getState().setActiveToolTab('export');
  };

  // 비교하기 버튼 클릭
  const handleCompare = async () => {
    if (!selection.canCompare || isNavigating) return;

    const entryA = entries.find((e) => e.id === selection.selectedIds[0]);
    const entryB = entries.find((e) => e.id === selection.selectedIds[1]);
    if (!entryA || !entryB) return;

    setIsNavigating(true);

    // 파일 존재 여부 확인
    const checks = await Promise.allSettled([
      invoke("get_file_metadata", { path: entryA.filePath }),
      invoke("get_file_metadata", { path: entryB.filePath }),
    ]);

    const aExists = checks[0].status === "fulfilled";
    const bExists = checks[1].status === "fulfilled";

    if (!aExists && !bExists) {
      toast.error(t('history.filesNotFound'), {
        description: t('history.filesNotFoundDesc'),
      });
      setIsNavigating(false);
      return;
    }

    if (!aExists) {
      toast.error(t('history.fileNotFoundOne', { name: entryA.fileName }), {
        description: t('history.filesNotFoundDesc'),
      });
      setIsNavigating(false);
      return;
    }

    if (!bExists) {
      toast.error(t('history.fileNotFoundOne', { name: entryB.fileName }), {
        description: t('history.filesNotFoundDesc'),
      });
      setIsNavigating(false);
      return;
    }

    // 비교 화면으로 이동 + 자동 파싱
    useComparisonStore.getState().reset();
    useUiStore.getState().setActiveToolTab("compare");
    selection.clear();
    setIsNavigating(false);

    // 비동기로 파싱 시작 (화면 전환 후)
    void startComparison(entryA.filePath, entryB.filePath);
  };

  // 로딩 중
  if (!isLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // 상세 모드
  if (selectedId !== null) {
    const entry = entries.find((e) => e.id === selectedId);
    if (!entry) {
      setSelectedId(null);
      return null;
    }
    return <HistoryDetail entry={entry} onBack={() => setSelectedId(null)} />;
  }

  // 빈 상태
  if (entries.length === 0) {
    return <HistoryEmpty />;
  }

  // 목록
  return (
    <div className="flex-1 overflow-auto p-6">
      <div>
        {/* 헤더: 제목 + 비교하기 + 전체 삭제 */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-base font-semibold text-[var(--color-text-primary)]">
              {t('history.title')}
            </h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              {t('history.desc')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 비교하기 버튼: 1개 이상 선택 시 표시 */}
            {selection.selectedIds.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleCompare}
                  disabled={!selection.canCompare || isNavigating}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none ${
                    selection.canCompare
                      ? "border-[var(--color-accent-primary)] bg-[var(--color-button-primary-bg)]/20 text-[var(--color-accent-primary)] hover:bg-[var(--color-button-primary-bg)]/30"
                      : "border-[var(--color-border-default)] text-[var(--color-text-disabled)] cursor-not-allowed"
                  }`}
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  {t('history.compareWithCount', { current: selection.selectedIds.length, max: 2 })}
                </button>
                <button
                  type="button"
                  onClick={() => selection.clear()}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-[var(--color-border-default)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
                >
                  <X className="w-3.5 h-3.5" />
                  {t('history.clearSelection')}
                </button>
              </>
            )}
            {entries.length >= 1 && (
              <button
                ref={clearAllBtnRef}
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-status-error-fg)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none rounded px-1 py-0.5"
              >
                {t('history.deleteAll')}
              </button>
            )}
          </div>
        </div>

        {/* 테이블 */}
        <div className="rounded-xl border border-[var(--color-border-default)] shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-bg-elevated)]">
                <th scope="col" className="w-16">
                  <span className="sr-only">{t('history.select')}</span>
                </th>
                <th
                  scope="col"
                  className="text-left px-4 py-2.5 text-xs text-[var(--color-text-tertiary)] font-medium"
                >
                  {t('history.date')}
                </th>
                <th
                  scope="col"
                  className="text-left px-4 py-2.5 text-xs text-[var(--color-text-tertiary)] font-medium"
                >
                  {t('history.fileName')}
                </th>
                <th
                  scope="col"
                  className="text-right px-4 py-2.5 text-xs text-[var(--color-text-tertiary)] font-medium"
                >
                  {t('history.errorHeader')}
                </th>
                <th
                  scope="col"
                  className="text-right px-4 py-2.5 text-xs text-[var(--color-text-tertiary)] font-medium"
                >
                  {t('history.warnHeader')}
                </th>
                <th scope="col" className="w-20">
                  <span className="sr-only">{t('history.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <HistoryRow
                  key={entry.id}
                  entry={entry}
                  ref={(el) => {
                    if (el) rowRefs.current.set(entry.id, el);
                    else rowRefs.current.delete(entry.id);
                  }}
                  onSelect={() => setSelectedId(entry.id)}
                  onDelete={() => remove(entry.id)}
                  onExportPdf={() => handleExportPdf(entry)}
                  selectionOrder={selection.getOrder(entry.id)}
                  canCheck={selection.canSelect(entry.id)}
                  onToggleCheck={() => selection.toggle(entry.id)}
                  isMaxSelected={selection.selectedIds.length >= 2}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 전체 삭제 확인 다이얼로그 */}
      <ConfirmDialog
        open={showClearConfirm}
        title={t('history.deleteConfirmTitle')}
        description={ERROR_LABELS.HISTORY_CLEAR_CONFIRM}
        confirmLabel={t('history.deleteAll')}
        destructive={true}
        onConfirm={() => {
          clear();
          selection.clear();
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
        returnFocusRef={clearAllBtnRef}
      />
    </div>
  );
}
