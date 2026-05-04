// 진단 히스토리 탭 (3번째 탭)

import { useState } from 'react';
import { History } from 'lucide-react';
import type { DiagnosisHistory } from '../../types/diagnosis';
import { SeverityBadge } from './SeverityBadge';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { AI_PROVIDER_LABELS } from '../../types/settings';

interface Props {
  histories: DiagnosisHistory[];
  onView: (history: DiagnosisHistory) => void;
  onDelete: (id: string) => Promise<void>;
  onClearAll: () => Promise<void>;
}

export function DiagnosisHistoryTab({ histories, onView, onDelete, onClearAll }: Props) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // 빈 상태
  if (histories.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
        <History className="w-10 h-10 text-[var(--color-text-disabled)]" />
        <p className="text-sm text-[var(--color-text-disabled)]">저장된 진단 기록이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 상단: 전체 삭제 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border-default)] flex-shrink-0">
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {histories.length}건의 진단 기록
        </span>
        <button
          onClick={() => setConfirmClearAll(true)}
          className="text-xs text-[var(--color-status-error-fg)] hover:text-[var(--color-status-error-fg)] transition-colors"
        >
          전체 삭제
        </button>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {histories.map((history) => {
          const providerLabel = AI_PROVIDER_LABELS[history.provider] ?? history.provider;
          const date = new Date(history.savedAt).toLocaleString('ko-KR', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });

          return (
            <div
              key={history.id}
              className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg p-4 space-y-2"
            >
              {/* 1행: 예외 클래스 + 날짜 */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono text-[var(--color-status-error-fg)] truncate">
                  {history.exceptionClass}
                </span>
                <span className="text-xs text-[var(--color-text-disabled)] flex-shrink-0 ml-2">
                  {date}
                </span>
              </div>

              {/* 2행: 프로바이더 + 소스파일 */}
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
                <span>{providerLabel}</span>
                <span className="text-[var(--color-text-disabled)]">·</span>
                <span className="truncate">{history.sourceFile}</span>
              </div>

              {/* 3행: 심각도 + 토큰/비용 + 액션 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {history.unidirectional?.severity && (
                    <SeverityBadge severity={history.unidirectional.severity} />
                  )}
                  <span className="text-[10px] text-[var(--color-text-disabled)]">
                    {history.tokensUsed.toLocaleString()} 토큰
                    {history.estimatedCost > 0 && ` · ~$${history.estimatedCost.toFixed(4)}`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onView(history)}
                    className="text-xs text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary)] hover:underline transition-colors"
                  >
                    보기
                  </button>
                  <button
                    onClick={() => setConfirmDelete(history.id)}
                    className="text-xs text-[var(--color-status-error-fg)] hover:text-[var(--color-status-error-fg)] hover:underline transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 개별 삭제 확인 */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title="진단 기록 삭제"
        description="이 진단 기록을 삭제하시겠습니까?"
        confirmLabel="삭제"
        cancelLabel="취소"
        destructive
        onConfirm={async () => {
          if (confirmDelete) await onDelete(confirmDelete);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* 전체 삭제 확인 */}
      <ConfirmDialog
        open={confirmClearAll}
        title="전체 진단 기록 삭제"
        description="모든 진단 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
        confirmLabel="전체 삭제"
        cancelLabel="취소"
        destructive
        onConfirm={async () => {
          await onClearAll();
          setConfirmClearAll(false);
        }}
        onCancel={() => setConfirmClearAll(false)}
      />
    </div>
  );
}
