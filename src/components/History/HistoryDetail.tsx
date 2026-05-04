// 히스토리 상세 조회 패널

import { ArrowLeft } from 'lucide-react';
import type { HistoryEntry } from '../../types/history';
import type { LogLevel } from '../../utils/logParser';

interface HistoryDetailProps {
  entry: HistoryEntry;
  onBack: () => void;
}

/** 파일 크기 포맷 */
function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** 상세 날짜 포맷: YYYY-MM-DD HH:mm */
function formatDetailDate(isoString: string): string {
  const date = new Date(isoString);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
}

// 레벨별 카드 색상 (SummaryCards.tsx와 동일 체계)
const LEVEL_CARDS: {
  level: 'TOTAL' | LogLevel;
  label: string;
  bg: string;
  border: string;
  text: string;
  countText: string;
}[] = [
  {
    level: 'TOTAL',
    label: '전체',
    bg: 'bg-[var(--color-bg-elevated)]',
    border: 'border-[var(--color-border-default)]',
    text: 'text-[var(--color-text-tertiary)]',
    countText: 'text-[var(--color-text-primary)]',
  },
  {
    level: 'ERROR',
    label: '에러',
    bg: 'bg-[var(--color-status-error-bg)] dark:bg-[var(--color-status-error-bg)]',
    border: 'border-[var(--color-status-error-border)] dark:border-[var(--color-status-error-border)]',
    text: 'text-[var(--color-status-error-fg)] dark:text-[var(--color-status-error-fg)]',
    countText: 'text-[var(--color-status-error-fg)] dark:text-[var(--color-status-error-fg)]',
  },
  {
    level: 'WARN',
    label: '경고',
    bg: 'bg-[var(--color-status-warn-bg)] bg-[var(--color-status-warn-bg)]',
    border: 'border-[var(--color-status-warn-border)] dark:border-[var(--color-status-warn-border)]',
    text: 'text-[var(--color-status-warn-fg)] dark:text-[var(--color-status-warn-fg)]',
    countText: 'text-[var(--color-status-warn-fg)] dark:text-[var(--color-status-warn-fg)]',
  },
  {
    level: 'INFO',
    label: '정보',
    bg: 'bg-[var(--color-accent-primary-subtle-bg)] dark:bg-[var(--color-accent-primary-subtle-bg)]/30',
    border: 'border-[var(--color-accent-primary)] dark:border-[var(--color-accent-primary)]',
    text: 'text-[var(--color-accent-primary)] dark:text-[var(--color-accent-primary)]',
    countText: 'text-[var(--color-accent-primary)] dark:text-[var(--color-accent-primary)]',
  },
  {
    level: 'DEBUG',
    label: '디버그',
    bg: 'bg-[var(--color-bg-elevated)]',
    border: 'border-[var(--color-border-default)]',
    text: 'text-[var(--color-text-tertiary)]',
    countText: 'text-[var(--color-text-tertiary)]',
  },
  {
    level: 'TRACE',
    label: '트레이스',
    bg: 'bg-[var(--color-bg-elevated)]',
    border: 'border-[var(--color-border-default)]',
    text: 'text-[var(--color-text-tertiary)]',
    countText: 'text-[var(--color-text-tertiary)]',
  },
];

export function HistoryDetail({ entry, onBack }: HistoryDetailProps) {
  const { summary } = entry;
  const { topErrors } = summary;
  const maxCount = topErrors.length > 0 ? topErrors[0].count : 0;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-3xl mx-auto">
        {/* 뒤로 버튼 + 제목 */}
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={onBack}
            className="p-1 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
            aria-label="히스토리 목록으로 돌아가기"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            {entry.fileName} 분석 결과
          </h2>
        </div>

        {/* 파일 정보 카드 */}
        <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg px-4 py-3 mb-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <div>
              <span className="text-xs text-[var(--color-text-tertiary)]">파일명</span>
              <p className="text-sm text-[var(--color-text-secondary)] font-mono truncate" title={entry.fileName}>
                {entry.fileName}
              </p>
            </div>
            <div>
              <span className="text-xs text-[var(--color-text-tertiary)]">분석일시</span>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {formatDetailDate(entry.analyzedAt)}
              </p>
            </div>
            <div>
              <span className="text-xs text-[var(--color-text-tertiary)]">파일 크기</span>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {formatFileSize(entry.fileSize)}
              </p>
            </div>
            {summary.parseFailCount > 0 && (
              <div>
                <span className="text-xs text-[var(--color-text-tertiary)]">파싱 실패</span>
                <p className="text-xs text-[var(--color-text-disabled)]">
                  {summary.parseFailCount.toLocaleString()}건
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 레벨별 카운트 카드 */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {LEVEL_CARDS.map(({ level, label, bg, border, text, countText }) => {
            const count = level === 'TOTAL'
              ? summary.totalEntries
              : (summary.levelCounts[level] ?? 0);
            return (
              <div key={level} className={`${bg} border ${border} rounded-lg px-4 py-3`}>
                <p className={`text-xs ${text}`}>{label}</p>
                <p className={`text-xl font-bold ${countText} mt-1`}>
                  {count.toLocaleString()}
                </p>
              </div>
            );
          })}
        </div>

        {/* Top 예외 목록 */}
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
            Top 예외
          </h3>
          {topErrors.length === 0 ? (
            <div className="text-sm text-[var(--color-text-disabled)] py-6 text-center">
              감지된 예외가 없습니다
            </div>
          ) : (
            <div className="space-y-2">
              {topErrors.map((err, i) => (
                <div
                  key={err.exceptionClass}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--color-bg-elevated)] cursor-default"
                >
                  {/* 순위 */}
                  <span className="flex-shrink-0 text-xs font-mono text-[var(--color-text-disabled)] w-5 text-right">
                    {i + 1}
                  </span>

                  {/* 예외 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono text-[var(--color-status-error-fg)] truncate">
                        {err.exceptionClass.split('.').pop()}
                      </span>
                      <span className="flex-shrink-0 text-xs text-[var(--color-text-tertiary)] font-medium">
                        {err.count.toLocaleString()}건
                      </span>
                    </div>
                    <div className="mt-1 h-1 bg-[var(--color-border-default)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--color-status-error-fg)] rounded-full"
                        style={{ width: `${maxCount > 0 ? (err.count / maxCount) * 100 : 0}%` }}
                      />
                    </div>
                    <span
                      className="text-[10px] text-[var(--color-text-disabled)] font-mono truncate block mt-1"
                      title={err.exceptionClass}
                    >
                      {err.exceptionClass}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
