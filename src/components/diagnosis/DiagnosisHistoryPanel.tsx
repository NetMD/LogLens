// 히스토리 목록 슬라이드-인 패널

import { X, History } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation();
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
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{t('aiDiagnosis.historyTitle')}</h2>
          <div className="flex items-center gap-2">
            {histories.length > 0 && (
              <button
                onClick={() => setConfirmClearAll(true)}
                className="text-xs text-[var(--color-status-error-fg)] hover:text-[var(--color-status-error-fg)] transition-colors"
                aria-label={t('aiDiagnosis.deleteAllAria')}
              >
                {t('aiDiagnosis.deleteAll')}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
              aria-label={t('aiDiagnosis.historyClose')}
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
              <p className="text-xs text-[var(--color-text-disabled)]">{t('aiDiagnosis.noHistoryShort')}</p>
            </div>
          ) : (
            histories.map((history) => {
              const providerLabel = AI_PROVIDER_LABELS[history.provider] ?? history.provider;
              const locale = i18n.language === 'en' ? 'en-US' : 'ko-KR';
              const date = new Date(history.savedAt).toLocaleString(locale, {
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
                      {t('aiDiagnosis.tokensUnit', { count: history.tokensUsed.toLocaleString() })}
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
                        {t('aiDiagnosis.view')}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(history.id)}
                        className="text-xs text-[var(--color-status-error-fg)] hover:underline"
                      >
                        {t('aiDiagnosis.delete')}
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
        title={t('aiDiagnosis.historyDeleteOneTitle')}
        description={t('aiDiagnosis.historyDeleteOneDesc')}
        confirmLabel={t('aiDiagnosis.delete')}
        cancelLabel={t('aiDiagnosis.cancel')}
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
        title={t('aiDiagnosis.historyDeleteAllTitle')}
        description={t('aiDiagnosis.historyDeleteAllDesc')}
        confirmLabel={t('aiDiagnosis.deleteAll')}
        cancelLabel={t('aiDiagnosis.cancel')}
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
