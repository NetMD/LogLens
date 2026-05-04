// 히스토리 목록 슬라이드-인 패널

import { X, History } from 'lucide-react';
import { useState } from 'react';
import type { DiagnosisHistory } from '../../types/diagnosis';
import { SeverityBadge } from './SeverityBadge';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { AI_PROVIDER_LABELS } from '../../types/settings';

interface Props {
  histories: DiagnosisHistory[];
  onView: (history: DiagnosisHistory) => void;
  onDelete: (id: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  onClose: () => void;
  isOpen: boolean;
}

export function DiagnosisHistoryPanel({
  histories,
  onView,
  onDelete,
  onClearAll,
  onClose,
  isOpen,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  if (!isOpen) return null;

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-150"
        onClick={onClose}
      />

      {/* 패널 */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-80 max-w-sm bg-[var(--color-bg-surface)] border-l border-[var(--color-border-default)] shadow-2xl flex flex-col"
        style={{
          animation: 'slideIn 200ms ease-out',
        }}
      >
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-default)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">진단 히스토리</h2>
          <div className="flex items-center gap-2">
            {histories.length > 0 && (
              <button
                onClick={() => setConfirmClearAll(true)}
                className="text-xs text-[var(--color-status-error-fg)] hover:text-[var(--color-status-error-fg)] transition-colors"
                aria-label="전체 삭제"
              >
                전체 삭제
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
              aria-label="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {histories.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <History className="w-8 h-8 text-[var(--color-text-disabled)]" />
              <p className="text-xs text-[var(--color-text-disabled)]">저장된 진단 기록이 없습니다</p>
            </div>
          ) : (
            histories.map((history) => {
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
                  className="bg-[var(--color-bg-elevated)] rounded-lg p-3 space-y-1.5"
                >
                  {/* 1행: 날짜 + 프로바이더 + 심각도 */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[var(--color-text-tertiary)]">{date}</span>
                    <span className="text-[var(--color-text-disabled)]">{providerLabel}</span>
                    {history.unidirectional?.severity && (
                      <SeverityBadge severity={history.unidirectional.severity} />
                    )}
                  </div>
                  {/* 2행: 예외 클래스 + 토큰/비용 */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-[var(--color-status-error-fg)] truncate">
                      {history.exceptionClass}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-disabled)] flex-shrink-0">
                      {history.tokensUsed.toLocaleString()} 토큰
                      {history.estimatedCost > 0 && ` ~$${history.estimatedCost.toFixed(4)}`}
                    </span>
                  </div>
                  {/* 3행: 소스 파일 + 액션 */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[var(--color-text-disabled)] truncate">
                      {history.sourceFile}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onView(history)}
                        className="text-xs text-[var(--color-accent-primary)] hover:underline"
                      >
                        보기
                      </button>
                      <button
                        onClick={() => setConfirmDelete(history.id)}
                        className="text-xs text-[var(--color-status-error-fg)] hover:underline"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
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
          if (confirmDelete) {
            await onDelete(confirmDelete);
          }
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
    </>
  );
}
