// 멀티 AI 비교 — 개별 결과 카드 (Step 5)
// 상태 별 UI: pending/calling-ai → 스피너, done → 마크다운 미리보기, error → 에러 메시지

import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertCircle, Trash2, Eye, Download } from 'lucide-react';
import { AI_PROVIDER_LABELS } from '../../types/settings';
import type { ComparisonEntry } from '../../services/ai/multiReportGenerator';

interface Props {
  entry: ComparisonEntry;
  onViewDetail: () => void;
  onDownload: () => void;
  onRemove: () => void;
}

export function ComparisonCard({ entry, onViewDetail, onDownload, onRemove }: Props) {
  const { t } = useTranslation();
  const label = AI_PROVIDER_LABELS[entry.provider];
  const isLoading = entry.status === 'pending' || entry.status === 'preparing' || entry.status === 'calling-ai';
  const isDone = entry.status === 'done';
  const isError = entry.status === 'error';

  // 경과 시간
  const elapsed =
    entry.startedAt !== null
      ? ((entry.completedAt ?? Date.now()) - entry.startedAt) / 1000
      : null;

  return (
    <div
      className={`bg-[var(--color-bg-elevated)] border rounded-xl overflow-hidden transition-colors ${
        isDone
          ? 'border-[var(--color-status-success-border)]'
          : isError
            ? 'border-[var(--color-status-error-border)]'
            : 'border-[var(--color-border-default)]'
      }`}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border-default)]">
        <div className="flex items-center gap-2 min-w-0">
          {isDone && <CheckCircle className="w-4 h-4 text-[var(--color-status-success-fg)] flex-shrink-0" />}
          {isError && <AlertCircle className="w-4 h-4 text-[var(--color-status-error-fg)] flex-shrink-0" />}
          {isLoading && (
            <div className="w-4 h-4 border-2 border-[var(--color-accent-primary)] border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}
          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
            {label}
          </span>
          <span className="text-[10px] text-[var(--color-text-tertiary)] truncate">
            {entry.model}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          title={t('pdf.deleteEntry')}
          className="p-1 rounded text-[var(--color-text-disabled)] hover:text-[var(--color-status-error-fg)] hover:bg-[var(--color-status-error-bg)] transition-colors flex-shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 바디 */}
      <div className="px-4 py-3">
        {/* 로딩 */}
        {isLoading && (
          <div className="text-center py-6">
            <p className="text-xs text-[var(--color-text-secondary)]">
              {entry.status === 'calling-ai' ? t('pdf.aiAnalyzing') : t('pdf.preparing')}
            </p>
            {elapsed !== null && (
              <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">
                {t('pdf.elapsedSec', { sec: elapsed.toFixed(0) })}
              </p>
            )}
          </div>
        )}

        {/* 에러 */}
        {isError && (
          <div className="py-4">
            <p className="text-xs text-[var(--color-status-error-fg)] break-all">{entry.error}</p>
          </div>
        )}

        {/* 완료 — 마크다운 미리보기 */}
        {isDone && entry.markdown && (
          <>
            {/* 메타 라인 */}
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-text-primary)] mb-2">
              {typeof entry.tokensUsed === 'number' && (
                <span>{t('pdf.tokensShort', { count: entry.tokensUsed.toLocaleString() })}</span>
              )}
              {typeof entry.estimatedCostUsd === 'number' && (
                <>
                  <span className="text-[var(--color-text-disabled)]">·</span>
                  <span>~${entry.estimatedCostUsd.toFixed(4)}</span>
                </>
              )}
              {elapsed !== null && (
                <>
                  <span className="text-[var(--color-text-disabled)]">·</span>
                  <span>{t('pdf.elapsedSecExact', { sec: elapsed.toFixed(1) })}</span>
                </>
              )}
            </div>

            {/* 마크다운 미리보기 (줄임) */}
            <button
              type="button"
              onClick={onViewDetail}
              className="w-full text-left group focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none rounded-lg"
            >
              <div className="relative max-h-36 overflow-hidden rounded-lg bg-[var(--color-bg-base)] border border-[var(--color-border-default)] px-3 py-2">
                <div className="text-xs text-[var(--color-text-primary)] whitespace-pre-wrap break-words leading-relaxed markdown-mini-preview">
                  {truncateMarkdown(entry.markdown, 400)}
                </div>
                {/* 하단 페이드아웃 그라데이션 */}
                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[var(--color-bg-base)] to-transparent pointer-events-none" />
              </div>
              <p className="mt-1.5 text-[11px] text-[var(--color-accent-primary)] group-hover:text-[var(--color-accent-primary)] inline-flex items-center gap-1 transition-colors">
                <Eye className="w-3 h-3" />
                {t('pdf.viewDetail')}
              </p>
            </button>

            {/* 다운로드 버튼 */}
            <button
              type="button"
              onClick={onDownload}
              className="mt-2 w-full py-1.5 text-xs font-medium text-[var(--color-text-secondary)] border border-[var(--color-border-default)] rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <Download className="w-3 h-3" />
              {t('pdf.downloadPdfShort')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** 마크다운 텍스트를 maxLen 문자로 잘라 미리보기용 plain text 에 가깝게 정리 */
function truncateMarkdown(md: string, maxLen: number): string {
  // # 헤딩 마커, ** bold **, * italic * 제거
  const cleaned = md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + '…' : cleaned;
}
