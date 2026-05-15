// 단방향 분석 탭 (컨텍스트 선택 + 진행 + 결과)

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, AlertTriangle } from 'lucide-react';
import type { DiagnosisPhase, UnidirectionalResult } from '../../types/diagnosis';
import type { AiApiError } from '../../services/ai/types';
import { AI_ERROR_MESSAGES } from '../../services/ai/types';
import { ContextSelector } from './ContextSelector';
import { DiagnosisResult } from './DiagnosisResult';
import { LoadingSpinner } from '../shared/LoadingSpinner';

interface Props {
  phase: DiagnosisPhase;
  progress: number;
  result: UnidirectionalResult | null;
  rawResponse: string;
  error: AiApiError | null;
  isAnalyzing: boolean;
  canStartDiagnosis: boolean;
  payloadSize: number;
  estimatedCost: number;
  isPayloadTooLarge: boolean;

  // 히스토리 참조
  relatedHistoryCount: number;
  includeHistory: boolean;
  onToggleHistory: (v: boolean) => void;

  // 액션
  onStartDiagnosis: (scope: 'selected' | 'full') => Promise<void>;
  onCancelDiagnosis: () => void;
  onRetryDiagnosis: () => Promise<void>;
  onContinueChat: () => void;
  onSave: () => Promise<void>;
}

export function UnidirectionalTab({
  phase,
  progress,
  result,
  rawResponse,
  error,
  isAnalyzing,
  canStartDiagnosis,
  payloadSize,
  estimatedCost,
  isPayloadTooLarge,
  relatedHistoryCount,
  includeHistory,
  onToggleHistory,
  onStartDiagnosis,
  onCancelDiagnosis,
  onRetryDiagnosis,
  onContinueChat,
  onSave,
}: Props) {
  const { t, i18n } = useTranslation();
  const [scope, setScope] = useState<'selected' | 'full'>('selected');

  // phase별 i18n 메시지 (UI 언어 따라감)
  const phaseMessages: Record<string, string> = {
    preparing: t('aiDiagnosis.phasePreparingMessage'),
    analyzing: t('aiDiagnosis.phaseAnalyzingMessage'),
    solving: t('aiDiagnosis.phaseSolvingMessage'),
  };

  // === idle 상태: 컨텍스트 선택 + AI 진단 시작 버튼 ===
  if (phase === 'idle') {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl mx-auto space-y-4">
          {/* 컨텍스트 범위 선택 */}
          <ContextSelector
            scope={scope}
            onScopeChange={setScope}
            payloadSize={payloadSize}
            estimatedCost={estimatedCost}
            isPayloadTooLarge={isPayloadTooLarge}
            isAnalyzing={isAnalyzing}
          />

          {/* 이전 진단 참조 */}
          {relatedHistoryCount > 0 && (
            <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg p-4">
              <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
                {t('aiDiagnosis.previousRefHeader')}
              </h3>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {t('aiDiagnosis.previousRefCount', { count: relatedHistoryCount })}
                </span>
                <button
                  onClick={() => onToggleHistory(!includeHistory)}
                  disabled={isAnalyzing}
                  className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ backgroundColor: includeHistory ? 'rgb(59 130 246)' : 'var(--color-border-default)' }}
                  role="switch"
                  aria-checked={includeHistory}
                  aria-label={t('aiDiagnosis.previousRefAria')}
                >
                  <span
                    className="inline-block h-3 w-3 transform rounded-full bg-white transition-transform"
                    style={{ transform: includeHistory ? 'translateX(16px)' : 'translateX(2px)' }}
                  />
                </button>
              </div>
              <p className="text-[10px] text-[var(--color-text-disabled)] mt-1">
                {t('aiDiagnosis.previousRefDesc')}
              </p>
            </div>
          )}

          {/* AI 진단 시작 버튼 */}
          <div className="flex justify-center pt-2">
            <button
              onClick={() => onStartDiagnosis(scope)}
              disabled={!canStartDiagnosis || (scope === 'full' && isPayloadTooLarge)}
              className="flex items-center gap-2 bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)] text-white rounded-lg px-6 py-2.5 text-sm transition-colors shadow-lg shadow-purple-900/30 disabled:bg-[var(--color-accent-primary-subtle-bg)] disabled:text-[var(--color-accent-primary)]/50 disabled:cursor-not-allowed disabled:shadow-none"
              aria-label={t('aiDiagnosis.startDiagnosis')}
            >
              <Sparkles className="w-4 h-4" />
              {t('aiDiagnosis.startDiagnosis')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === 분석 중 (preparing/analyzing/solving) ===
  if (phase === 'preparing' || phase === 'analyzing' || phase === 'solving') {
    const message = phaseMessages[phase] ?? t('aiDiagnosis.diagnosing');

    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-sm mx-auto text-center space-y-4 p-6">
          <LoadingSpinner size="lg" className="mx-auto" />
          <p className="text-sm text-[var(--color-text-secondary)] transition-opacity duration-150">
            {message}
          </p>
          {/* 진행률 바 — transform: scaleX 로 GPU 가속, layout 트리거 회피 */}
          <div
            className="w-full h-1.5 bg-[var(--color-border-default)] rounded-full overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div
              className="h-full w-full bg-[var(--color-accent-primary)] origin-left motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out"
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </div>
          <span className="text-xs text-[var(--color-text-tertiary)]">{progress}%</span>
          <div>
            <button
              onClick={onCancelDiagnosis}
              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-status-error-fg)] underline transition-colors"
              aria-label={t('aiDiagnosis.cancelAria')}
            >
              {t('aiDiagnosis.cancel')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === 에러 상태 ===
  if (phase === 'error' && error) {
    // AI_ERROR_MESSAGES 는 ko/en 2-key 구조 — 현재 UI 언어로 분기
    const lang = i18n.language === 'en' ? 'en' : 'ko';
    const errorMessage = AI_ERROR_MESSAGES[error.type]?.[lang] ?? error.message;

    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-sm mx-auto text-center space-y-4 p-6">
          <div className="w-12 h-12 rounded-full bg-[var(--color-status-error-bg)] flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6 text-[var(--color-status-error-fg)]" />
          </div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">
            {t('aiDiagnosis.analysisFailed')}
          </p>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {errorMessage}
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => onRetryDiagnosis()}
              disabled={!canStartDiagnosis}
              className="px-4 py-2 text-xs bg-[var(--color-button-primary-bg)] hover:bg-[var(--color-button-primary-bg-hover)] text-white rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label={t('aiDiagnosis.retry')}
            >
              {t('aiDiagnosis.retry')}
            </button>
            <button
              onClick={onCancelDiagnosis}
              className="px-4 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] rounded-lg transition-colors"
              aria-label={t('aiDiagnosis.errorClose')}
            >
              {t('aiDiagnosis.errorClose')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === 결과 표시 (completed / partial) ===
  if (phase === 'completed' || phase === 'partial') {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        {phase === 'partial' && (
          <div className="max-w-3xl mx-auto mb-4 bg-[var(--color-status-warn-bg)] border border-[var(--color-status-warn-border)] rounded-lg px-3 py-2">
            <p className="text-xs text-[var(--color-status-warn-fg)]">
              {t('aiDiagnosis.incompleteResponse')}
            </p>
          </div>
        )}
        <DiagnosisResult
          result={result}
          rawResponse={rawResponse}
          onContinueChat={onContinueChat}
          onSave={onSave}
          onRetry={() => onRetryDiagnosis()}
          canStartDiagnosis={canStartDiagnosis}
          isAnalyzing={isAnalyzing}
        />
      </div>
    );
  }

  return null;
}
