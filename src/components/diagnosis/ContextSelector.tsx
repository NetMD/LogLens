// 컨텍스트 범위 선택기 (라디오 + 용량 체크)

import { useState } from 'react';
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
        컨텍스트 범위
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
            <span className="text-sm text-[var(--color-text-primary)]">선택한 에러만</span>
            <span className="text-xs text-[var(--color-text-disabled)] ml-1">(권장)</span>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              해당 예외 스택트레이스 + 전후 로그
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
            <span className="text-sm text-[var(--color-text-primary)]">전체 로그 포함</span>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              전체 로그 파일 컨텍스트
            </p>
            {scope === 'full' && (
              <p className="text-xs text-[var(--color-text-disabled)] mt-1">
                예상 크기: {formatSize(payloadSize)}
                {estimatedCost > 0 && ` | 예상 비용: ~$${estimatedCost.toFixed(4)}`}
              </p>
            )}
            {isPayloadTooLarge && (
              <p className="text-xs text-[var(--color-status-error-fg)] mt-1">
                전체 로그가 {formatSize(payloadSize)}로 너무 큽니다. 선택한 에러만 분석할 수 있습니다.
              </p>
            )}
          </div>
        </label>
      </div>

      {/* 1~5MB 용량 경고 다이얼로그 */}
      <ConfirmDialog
        open={showWarning}
        title="전체 로그 포함 경고"
        description={`전체 로그가 ${formatSize(payloadSize)}입니다. 토큰이 많이 사용될 수 있습니다. 예상 비용: ~$${estimatedCost.toFixed(4)}`}
        confirmLabel="진행"
        cancelLabel="취소"
        onConfirm={() => {
          setShowWarning(false);
          onScopeChange('full');
        }}
        onCancel={() => setShowWarning(false)}
      />
    </div>
  );
}
