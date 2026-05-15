// 히스토리 테이블 행 컴포넌트 (forwardRef)
// 체크박스 + A/B 배지 + 비교 선택 지원

import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { FileDown, Trash2 } from "lucide-react";
import type { HistoryEntry } from "../../types/history";

interface HistoryRowProps {
  entry: HistoryEntry;
  onSelect: () => void;
  onDelete: () => void;
  onExportPdf: () => void;
  // 비교 선택 관련
  selectionOrder: "A" | "B" | null;
  canCheck: boolean;
  onToggleCheck: () => void;
  isMaxSelected: boolean; // 2개 선택된 상태
}

/** 날짜 포맷: 같은 해 MM/DD HH:mm, 다른 해 YYYY/MM/DD HH:mm */
function formatHistoryDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  if (sameYear) return `${month}/${day} ${hours}:${minutes}`;
  return `${date.getFullYear()}/${month}/${day} ${hours}:${minutes}`;
}

const BADGE_STYLES = {
  A: "bg-[var(--color-button-primary-bg)]/20 text-[var(--color-accent-primary)] border-[var(--color-accent-primary)]/30",
  B: "bg-[var(--color-status-success-fg)]/20 text-[var(--color-status-success-fg)] border-[var(--color-status-success-border)]/30",
} as const;

export const HistoryRow = forwardRef<HTMLTableRowElement, HistoryRowProps>(
  function HistoryRow(
    { entry, onSelect, onDelete, onExportPdf, selectionOrder, canCheck, onToggleCheck, isMaxSelected },
    ref
  ) {
    const { t } = useTranslation();
    const errorCount = entry.summary.levelCounts.ERROR ?? 0;
    const warnCount = entry.summary.levelCounts.WARN ?? 0;
    const isChecked = selectionOrder !== null;
    const isDimmed = isMaxSelected && !isChecked;

    function handleKeyDown(e: React.KeyboardEvent) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect();
      }
    }

    function handleDelete(e: React.MouseEvent) {
      e.stopPropagation();
      onDelete();
    }

    function handleDeleteKeyDown(e: React.KeyboardEvent) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onDelete();
      }
    }

    function handleExportPdf(e: React.MouseEvent) {
      e.stopPropagation();
      onExportPdf();
    }

    function handleExportPdfKeyDown(e: React.KeyboardEvent) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onExportPdf();
      }
    }

    function handleCheckboxClick(e: React.MouseEvent) {
      e.stopPropagation();
      if (canCheck) onToggleCheck();
    }

    function handleCheckboxKeyDown(e: React.KeyboardEvent) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        if (canCheck) onToggleCheck();
      }
    }

    return (
      <tr
        ref={ref}
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={handleKeyDown}
        className={`group cursor-pointer hover:bg-[var(--color-bg-hover)] active:bg-[var(--color-bg-active)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]/50 focus-visible:ring-inset focus-visible:outline-none border-b border-[var(--color-border-default)] last:border-b-0 transition-all ${
          isDimmed ? "opacity-40" : ""
        }`}
      >
        {/* 체크박스 + A/B 배지 */}
        <td className="pl-3 pr-1 py-2.5 w-16">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              role="checkbox"
              aria-checked={isChecked}
              aria-label={t('history.compareSelectAria', { name: entry.fileName })}
              onClick={handleCheckboxClick}
              onKeyDown={handleCheckboxKeyDown}
              disabled={!canCheck}
              className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none ${
                isChecked
                  ? selectionOrder === "A"
                    ? "bg-[var(--color-button-primary-bg)] border-[var(--color-accent-primary)]"
                    : "bg-[var(--color-status-success-fg)] border-[var(--color-status-success-border)]"
                  : canCheck
                    ? "border-[var(--color-border-default)] hover:border-[var(--color-text-tertiary)]"
                    : "border-[var(--color-border-default)] opacity-30 cursor-not-allowed"
              }`}
            >
              {isChecked && (
                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            {selectionOrder && (
              <span
                className={`text-[10px] font-bold rounded px-1 py-0.5 border ${BADGE_STYLES[selectionOrder]}`}
              >
                {selectionOrder}
              </span>
            )}
          </div>
        </td>

        {/* 날짜 */}
        <td
          className="px-4 py-2.5 text-xs text-[var(--color-text-tertiary)] whitespace-nowrap"
          title={entry.analyzedAt}
        >
          {formatHistoryDate(entry.analyzedAt)}
        </td>

        {/* 파일명 */}
        <td
          className="px-4 py-2.5 text-xs font-mono text-[var(--color-text-secondary)] truncate max-w-[200px]"
          title={entry.fileName}
        >
          {entry.fileName}
        </td>

        {/* ERROR */}
        <td className="px-4 py-2.5 text-right">
          <span
            className={
              errorCount === 0
                ? "text-xs text-[var(--color-text-disabled)]"
                : "text-xs text-[var(--color-status-error-fg)] font-semibold"
            }
          >
            {errorCount.toLocaleString()}
          </span>
        </td>

        {/* WARN */}
        <td className="px-4 py-2.5 text-right">
          <span
            className={
              warnCount === 0
                ? "text-xs text-[var(--color-text-disabled)]"
                : "text-xs text-[var(--color-status-warn-fg)] font-semibold"
            }
          >
            {warnCount.toLocaleString()}
          </span>
        </td>

        {/* PDF 내보내기 + 삭제 */}
        <td className="px-2 py-2.5 w-20">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              aria-label={t('history.exportPdfAria', { name: entry.fileName })}
              title={t('history.exportPdfTitle')}
              onClick={handleExportPdf}
              onKeyDown={handleExportPdfKeyDown}
              className="p-1 rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[var(--color-text-disabled)] hover:text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary-subtle-bg)]/30 focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none transition-opacity transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label={t('history.deleteAria', { name: entry.fileName })}
              onClick={handleDelete}
              onKeyDown={handleDeleteKeyDown}
              className="p-1 rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[var(--color-text-disabled)] hover:text-[var(--color-status-error-fg)] hover:bg-[var(--color-status-error-bg)] focus-visible:ring-2 focus-visible:ring-[var(--color-status-error-border)] focus-visible:outline-none transition-opacity transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }
);
