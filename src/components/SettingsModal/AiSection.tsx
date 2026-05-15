// 설정 모달 > AI 설정 섹션 (프로바이더 / API 키 / 모델 선택 / 로컬 LLM / 테스트 모드)

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Eye,
  EyeOff,
  CheckCircle2,

  Plug,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { AiProvider, AiApiKeys } from '../../types/settings';
import {
  AI_PROVIDER_LABELS,
  AI_PROVIDERS,
  AI_MODEL_OPTIONS,
  AI_DEFAULT_MODELS,
  CLOUD_PROVIDERS,
  isLocalProvider,
} from '../../types/settings';

import { testLocalConnection } from '../../services/ai/providers/local';
import { getAiProvider } from '../../services/ai/providers';
import { AiApiError } from '../../services/ai/types';

interface Props {
  aiProvider: AiProvider | null;
  aiApiKeys: AiApiKeys;
  aiModel: string;
  localLlmEndpoint: string;
  localLlmModel: string;
  onProviderChange: (p: AiProvider | null) => void;
  onApiKeyChange: (provider: AiProvider, key: string) => void;
  onModelChange: (model: string) => void;
  onLocalLlmEndpointChange: (v: string) => void;
  onLocalLlmModelChange: (v: string) => void;
}

export function AiSection({
  aiProvider,
  aiApiKeys,
  aiModel,
  localLlmEndpoint,
  localLlmModel,
  onProviderChange,
  onApiKeyChange,
  onModelChange,
  onLocalLlmEndpointChange,
  onLocalLlmModelChange,
}: Props) {
  const { t } = useTranslation();
  const [showApiKey, setShowApiKey] = useState(false);

  // 연결 테스트 상태
  const [connectionTestStatus, setConnectionTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
  const [connectionTestMessage, setConnectionTestMessage] = useState('');

  // 모델 새로고침 상태
  const [dynamicModels, setDynamicModels] = useState<Partial<Record<AiProvider, string[]>>>({});
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [preferHardcodedList, setPreferHardcodedList] = useState(false);

  const isLocal = isLocalProvider(aiProvider);

  // 프로바이더 미선택 시 하위 필드 비활성
  const isDisabled = aiProvider === null;

  // 현재 프로바이더의 저장된 키 (프로바이더 전환 시 자동 갱신)
  const currentKey = aiProvider !== null ? aiApiKeys[aiProvider] : '';

  // 모델 목록: 동적(API) vs 기본(하드코딩) 선택
  const hasDynamicForCurrent = aiProvider !== null && dynamicModels[aiProvider] !== undefined;
  const isDynamicModelList = hasDynamicForCurrent && !preferHardcodedList;
  const modelOptions: string[] =
    aiProvider !== null && !isLocal
      ? isDynamicModelList
        ? (dynamicModels[aiProvider] as string[])
        : AI_MODEL_OPTIONS[aiProvider]
      : [];

  function handleProviderChange(value: string) {
    if (value === '') {
      onProviderChange(null);
    } else {
      const p = value as AiProvider;
      onProviderChange(p);
      // 프로바이더 전환 시 해당 프로바이더의 기본 모델로 리셋
      onModelChange(AI_DEFAULT_MODELS[p]);
    }
    setShowApiKey(false);
    setPreferHardcodedList(false);
    // 프로바이더 변경 시 연결 테스트/모델 에러 초기화
    setConnectionTestStatus('idle');
    setConnectionTestMessage('');
    setModelsError(null);
  }

  /** ListModels API로 실시간 모델 목록 가져오기 */
  async function handleRefreshModels(): Promise<void> {
    if (aiProvider === null || isLocal) return;
    const key = aiApiKeys[aiProvider]?.trim();
    if (!key) {
      setModelsError(t('settings.apiKeyRequired'));
      return;
    }
    setRefreshingModels(true);
    setModelsError(null);
    try {
      const provider = getAiProvider(aiProvider);
      const models = await provider.listModels(key);
      if (models.length === 0) {
        setModelsError(t('settings.modelsErrorEmpty'));
        return;
      }
      setDynamicModels((prev) => ({ ...prev, [aiProvider]: models }));
      setPreferHardcodedList(false);
      // 현재 선택 모델이 새 목록에 없으면 첫 번째로 전환
      if (!models.includes(aiModel)) {
        onModelChange(models[0]);
      }
    } catch (e) {
      if (e instanceof AiApiError) {
        setModelsError(t('settings.modelsErrorWithMessage', { message: e.message }));
      } else {
        setModelsError(t('settings.modelsError'));
      }
    } finally {
      setRefreshingModels(false);
    }
  }

  /** 실시간 ↔ 기본 모델 목록 토글 */
  function handleToggleModelListSource(): void {
    if (aiProvider === null || !hasDynamicForCurrent) return;
    const next = !preferHardcodedList;
    const nextList = next
      ? AI_MODEL_OPTIONS[aiProvider]
      : (dynamicModels[aiProvider] as string[]);
    setPreferHardcodedList(next);
    if (!nextList.includes(aiModel) && nextList.length > 0) {
      onModelChange(nextList[0]);
    }
  }

  async function handleConnectionTest(): Promise<void> {
    setConnectionTestStatus('testing');
    setConnectionTestMessage('');
    const result = await testLocalConnection(localLlmEndpoint);
    if (result.ok) {
      setConnectionTestStatus('success');
      setConnectionTestMessage(t('settings.connected', { info: result.modelInfo }));
    } else {
      setConnectionTestStatus('error');
      setConnectionTestMessage(result.error);
    }
  }

  return (
    <div className="space-y-4">
      {/* 섹션 제목 */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
          {t('settings.aiSection')}
        </h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-status-success-bg)] text-[var(--color-status-success-fg)] font-medium">
          {t('common.pro')}
        </span>
      </div>

      {/* 프로바이더 선택 */}
      <div>
        <label className="block text-xs text-[var(--color-text-tertiary)] mb-1.5">
          {t('settings.aiProvider')}
        </label>
        <select
          value={aiProvider ?? ''}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
        >
          <option value="">{t('settings.providerNone')}</option>
          {AI_PROVIDERS.map((p) => {
            const hasKey = isLocalProvider(p) ? false : aiApiKeys[p] !== '';
            return (
              <option key={p} value={p}>
                {AI_PROVIDER_LABELS[p]}
                {hasKey ? ` • ${t('settings.keyRegistered')}` : ''}
              </option>
            );
          })}
        </select>
        {/* 프로바이더별 키 등록 상태 미니 뱃지 (클라우드 + 로컬 LLM) */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {CLOUD_PROVIDERS.map((p) => {
            const hasKey = aiApiKeys[p] !== '';
            return (
              <span
                key={p}
                className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${
                  hasKey
                    ? 'border-[var(--color-status-success-border)] bg-[var(--color-status-success-bg)] text-[var(--color-status-success-fg)]'
                    : 'border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] text-[var(--color-text-disabled)]'
                }`}
                title={hasKey ? t('settings.providerKeyRegistered', { provider: AI_PROVIDER_LABELS[p] }) : t('settings.providerKeyNotRegistered', { provider: AI_PROVIDER_LABELS[p] })}
              >
                {hasKey && <CheckCircle2 className="w-2.5 h-2.5" />}
                {AI_PROVIDER_LABELS[p]}
              </span>
            );
          })}
          {/* 로컬 LLM 뱃지 */}
          {(() => {
            const hasLocal = localLlmEndpoint.trim() !== '' && localLlmModel.trim() !== '';
            return (
              <span
                className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${
                  hasLocal
                    ? 'border-[var(--color-status-success-border)] bg-[var(--color-status-success-bg)] text-[var(--color-status-success-fg)]'
                    : 'border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] text-[var(--color-text-disabled)]'
                }`}
                title={hasLocal ? t('settings.localLlmRegistered') : t('settings.localLlmNotRegistered')}
              >
                {hasLocal && <CheckCircle2 className="w-2.5 h-2.5" />}
                Local LLM
              </span>
            );
          })()}
        </div>
      </div>

      {/* 클라우드 프로바이더: API 키 입력 */}
      {!isLocal && (
        <div className={isDisabled ? 'opacity-50 pointer-events-none' : ''}>
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-1.5">
            {t('settings.apiKey')}
            {aiProvider !== null && (
              <span className="text-[var(--color-text-disabled)] ml-1">
                ({AI_PROVIDER_LABELS[aiProvider]})
              </span>
            )}
          </label>
          <div className="relative">
            <input
              key={aiProvider ?? 'none'}
              type={showApiKey ? 'text' : 'password'}
              value={currentKey}
              onChange={(e) => {
                if (aiProvider !== null) onApiKeyChange(aiProvider, e.target.value);
              }}
              placeholder={
                aiProvider !== null
                  ? t('settings.apiKeyPlaceholder', { provider: AI_PROVIDER_LABELS[aiProvider] })
                  : t('settings.apiKeyPlaceholderGeneric')
              }
              disabled={isDisabled}
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 pr-10 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((v) => !v)}
              disabled={isDisabled}
              aria-label={showApiKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-[var(--color-bg-hover)] text-[var(--color-text-tertiary)] transition-colors"
            >
              {showApiKey ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-[11px] text-[var(--color-text-disabled)] mt-1.5">
            {t('settings.savedPerProvider')}
          </p>

          {/* 모델 선택 드롭다운 + 새로고침 + 실시간/기본 토글 */}
          {aiProvider !== null && (AI_MODEL_OPTIONS[aiProvider].length > 0 || isDynamicModelList) && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-[var(--color-text-tertiary)]">
                  {t('settings.model')}
                  <span className="text-[var(--color-text-disabled)] ml-1">
                    ({AI_PROVIDER_LABELS[aiProvider]})
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  {/* 실시간/기본 토글 (동적 목록이 있을 때만) */}
                  {hasDynamicForCurrent && (
                    <button
                      type="button"
                      onClick={handleToggleModelListSource}
                      disabled={refreshingModels}
                      title={preferHardcodedList ? t('settings.showLiveTooltip') : t('settings.showDefaultTooltip')}
                      className="text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors disabled:opacity-40 rounded px-1.5 py-0.5 border border-[var(--color-border-default)]"
                    >
                      {preferHardcodedList ? t('settings.showLive') : t('settings.showDefault')}
                    </button>
                  )}
                  {/* 새로고침 버튼 */}
                  <button
                    type="button"
                    onClick={handleRefreshModels}
                    disabled={refreshingModels}
                    title={t('settings.refreshTooltip')}
                    className="inline-flex items-center gap-1 text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors disabled:opacity-40 rounded px-1.5 py-0.5 border border-[var(--color-border-default)]"
                  >
                    <RefreshCw className={`w-3 h-3 ${refreshingModels ? 'animate-spin' : ''}`} />
                    {t('settings.refresh')}
                  </button>
                </div>
              </div>
              <select
                value={aiModel}
                onChange={(e) => onModelChange(e.target.value)}
                disabled={refreshingModels}
                className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none disabled:opacity-50"
              >
                {modelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
                {/* 저장값이 옵션에 없으면 한시적으로 직접 표시 */}
                {aiModel && !modelOptions.includes(aiModel) && (
                  <option key={aiModel} value={aiModel}>
                    {aiModel}
                  </option>
                )}
              </select>
              {/* 모델 에러 메시지 */}
              {modelsError && (
                <p className="text-[11px] text-[var(--color-status-error-fg)] mt-1">{modelsError}</p>
              )}
              {/* 현재 표시 중인 목록 소스 표시 */}
              <p className="text-[10px] text-[var(--color-text-disabled)] mt-1">
                {isDynamicModelList
                  ? t('settings.liveList', { count: modelOptions.length })
                  : t('settings.defaultList', { count: modelOptions.length })}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 로컬 LLM 전용 설정 */}
      {isLocal && (
        <div className="space-y-3">
          {/* 엔드포인트 */}
          <div>
            <label className="block text-xs text-[var(--color-text-tertiary)] mb-1.5">
              {t('settings.localEndpoint')}
            </label>
            <input
              type="text"
              value={localLlmEndpoint}
              onChange={(e) => {
                onLocalLlmEndpointChange(e.target.value);
                setConnectionTestStatus('idle');
              }}
              placeholder={t('settings.localEndpointPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
            />
            <p className="text-[11px] text-[var(--color-text-disabled)] mt-1">
              {t('settings.localEndpointHint')}
            </p>
          </div>

          {/* 모델명 */}
          <div>
            <label className="block text-xs text-[var(--color-text-tertiary)] mb-1.5">
              {t('settings.localModel')}
            </label>
            <input
              type="text"
              value={localLlmModel}
              onChange={(e) => onLocalLlmModelChange(e.target.value)}
              placeholder={t('settings.localModelPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
            />
          </div>

          {/* 연결 테스트 버튼 */}
          <button
            type="button"
            onClick={handleConnectionTest}
            disabled={connectionTestStatus === 'testing'}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connectionTestStatus === 'testing' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plug className="w-4 h-4" />
            )}
            {connectionTestStatus === 'testing' ? t('settings.testing') : t('settings.testConnection')}
          </button>

          {/* 연결 테스트 결과 */}
          {connectionTestStatus === 'success' && (
            <div className="flex items-start gap-2 bg-[var(--color-status-success-bg)] dark:bg-[var(--color-status-success-bg)] border border-[var(--color-status-success-border)] dark:border-[var(--color-status-success-border)] text-[var(--color-status-success-fg)] dark:text-[var(--color-status-success-fg)] text-xs rounded-lg px-3 py-2">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{connectionTestMessage}</span>
            </div>
          )}
          {connectionTestStatus === 'error' && (
            <div className="flex items-start gap-2 bg-[var(--color-status-error-bg)] dark:bg-[var(--color-status-error-bg)] border border-[var(--color-status-error-border)] dark:border-[var(--color-status-error-border)] text-[var(--color-status-error-fg)] dark:text-[var(--color-status-error-fg)] text-xs rounded-lg px-3 py-2">
              <span className="flex-shrink-0 mt-0.5">❌</span>
              <span>{connectionTestMessage}</span>
            </div>
          )}

          {/* 안내 문구 */}
          <p className="text-[11px] text-[var(--color-text-disabled)] leading-relaxed">
            {t('settings.localHint1')}
            <br />
            {t('settings.localHint2')}
          </p>
        </div>
      )}

    </div>
  );
}
