// 설정 모달 -- 데이터 관리 섹션

import { useRef, useState } from 'react';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { ERROR_LABELS } from '../../constants/errorLabels';
import { MAX_HISTORY_COUNT_OPTIONS } from '../../types/history';
import type { MaxHistoryCount } from '../../types/history';

interface DataManagementSectionProps {
  maxHistoryCount: MaxHistoryCount;
  onMaxHistoryCountChange: (value: MaxHistoryCount) => void;
  historyCount: number;
  onClearHistory: () => void;
}

export function DataManagementSection({
  maxHistoryCount,
  onMaxHistoryCountChange,
  historyCount,
  onClearHistory,
}: DataManagementSectionProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const clearAllBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold text-[var(--color-text-primary)]">
        데이터 관리
      </legend>

      {/* 히스토리 최대 보관 */}
      <div>
        <label
          htmlFor="max-history-count"
          className="block text-xs text-[var(--color-text-secondary)] mb-1"
        >
          히스토리 최대 보관
        </label>
        <select
          id="max-history-count"
          value={maxHistoryCount}
          onChange={(e) =>
            onMaxHistoryCountChange(Number(e.target.value) as MaxHistoryCount)
          }
          className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
        >
          {MAX_HISTORY_COUNT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}건
            </option>
          ))}
        </select>
        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
          분석 히스토리를 최대 {maxHistoryCount}건까지 보관합니다
        </p>
      </div>

      {/* 히스토리 삭제 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[var(--color-text-secondary)]">
            분석 히스토리
          </p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
            {historyCount === 0
              ? '저장된 기록이 없습니다'
              : `현재 ${historyCount}건 저장됨`}
          </p>
        </div>
        <button
          ref={clearAllBtnRef}
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={historyCount === 0}
          className="text-xs text-[var(--color-status-error-fg)] hover:text-[var(--color-status-error-fg)] hover:bg-[var(--color-status-error-bg)] px-3 py-1.5 rounded-lg border border-[var(--color-status-error-border)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[var(--color-status-error-fg)]"
        >
          전체 삭제
        </button>
      </div>

      {/* 전체 삭제 확인 다이얼로그 */}
      <ConfirmDialog
        open={showConfirm}
        title="히스토리 전체 삭제"
        description={ERROR_LABELS.HISTORY_CLEAR_CONFIRM}
        confirmLabel="전체 삭제"
        destructive={true}
        onConfirm={() => {
          onClearHistory();
          setShowConfirm(false);
        }}
        onCancel={() => setShowConfirm(false)}
        returnFocusRef={clearAllBtnRef}
      />
    </fieldset>
  );
}
