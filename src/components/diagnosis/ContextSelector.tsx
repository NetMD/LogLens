// 컨텍스트 범위 선택기 (라디오 + 용량 체크)

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../shared/ConfirmDialog';

interface Props {
  scope: 'selected' | 'full';
  onScopeChange: (scope: 'selected' | 'full') => void;
  payloadSize: number;
  estimatedCost: number;
  isPayloadTooLarge: boolean;
  isAnalyzing: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ContextSelector({
  scope,
  onScopeChange,
  payloadSize,
  estimatedCost,
  isPayloadTooLarge,
  isAnalyzing,
}: Props) {
  const { t } = useTranslation();
  const [showWarning, setShowWarning] = useState(false);
  const sizeMB = payloadSize / (1024 * 1024);

  // 전체 로그 선택 시 용량 체크
  const handleScopeChange = (newScope: 'selected' | 'full') => {
    if (newScope === 'full') {
      if (isPayloadTooLarge) {
        // 5MB+ : 자동 차단 -> selected로 복귀
        onScopeChange('selected');
        return;
      }
      if (sizeMB >= 1) {
        // 1~5MB: 경고 다이얼로그
        setShowWarning(true);
        return;
      }
    }
    onScopeChange(newScope);
  };

  return (
    <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg p-4">
      <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">
        {t('aiDiagnosis.contextRangeHeader')}
      </h3>

      <div className="space-y-2">
        {/* 선택한 에러만 */}
        <label
          className={`flex items-start gap-3 p-2 rounded-md cursor-pointer transition-colors ${
            scope === 'selected' ? 'bg-[var(--color-bg-hover)]' : 'hover:bg-[var(--color-bg-hover)]'
          } ${isAnalyzing ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          <input
            type="radio"
            name="diagnosisScope"
            checked={scope === 'selected'}
            onChange={() => handleScopeChange('selected')}
            disabled={isAnalyzing}
            className="mt-0.5 w-4 h-4 accent-blue-500"
          />
          <div>
            <span className="text-sm text-[var(--color-text-primary)]">{t('aiDiagnosis.selectedOnly')}</span>
            <span className="text-xs text-[var(--color-text-disabled)] ml-1">{t('aiDiagnosis.selectedOnlyBadge')}</span>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              {t('aiDiagnosis.selectedOnlyDesc')}
            </p>
          </div>
        </label>

        {/* 전체 로그 포함 */}
        <label
          className={`flex items-start gap-3 p-2 rounded-md cursor-pointer transition-colors ${
            scope === 'full' ? 'bg-[var(--color-bg-hover)]' : 'hover:bg-[var(--color-bg-hover)]'
          } ${isAnalyzing ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          <input
            type="radio"
            name="diagnosisScope"
            checked={scope === 'full'}
            onChange={() => handleScopeChange('full')}
            disabled={isAnalyzing}
            className="mt-0.5 w-4 h-4 accent-blue-500"
          />
          <div>
            <span className="text-sm text-[var(--color-text-primary)]">{t('aiDiagnosis.fullLog')}</span>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              {t('aiDiagnosis.fullLogDesc')}
            </p>
            {scope === 'full' && (
              <p className="text-xs text-[var(--color-text-disabled)] mt-1">
                {t('aiDiagnosis.contextEstSize')}: {formatSize(payloadSize)}
                {estimatedCost > 0 && ` | ${t('aiDiagnosis.contextEstCost')}: ~$${estimatedCost.toFixed(4)}`}
              </p>
            )}
            {isPayloadTooLarge && (
              <p className="text-xs text-[var(--color-status-error-fg)] mt-1">
                {t('aiDiagnosis.contextTooLarge', { size: formatSize(payloadSize) })}
              </p>
            )}
          </div>
        </label>
      </div>

      {/* 1~5MB 용량 경고 다이얼로그 */}
      <ConfirmDialog
        open={showWarning}
        title={t('aiDiagnosis.contextWarnTitle')}
        description={t('aiDiagnosis.contextWarnDesc', { size: formatSize(payloadSize), cost: estimatedCost.toFixed(4) })}
        confirmLabel={t('aiDiagnosis.proceed')}
        cancelLabel={t('aiDiagnosis.cancel')}
        onConfirm={() => {
          setShowWarning(false);
          onScopeChange('full');
        }}
        onCancel={() => setShowWarning(false)}
      />
    </div>
  );
}
