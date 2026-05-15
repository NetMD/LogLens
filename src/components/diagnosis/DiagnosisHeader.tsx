// AI 진단 화면 헤더 (프로바이더 드롭다운 + 모델 셀렉트 분리)

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Settings, ChevronDown, Check, RefreshCw } from 'lucide-react';
import type { DiagnosisInput } from '../../types/diagnosis';
import { useSettingsStore } from '../../store/settingsStore';
import { useUiStore } from '../../store/uiStore';
import { useSettings } from '../../hooks/useSettings';
import {
  AI_PROVIDER_LABELS,
  AI_PROVIDERS,
  AI_DEFAULT_MODELS,
  AI_MODEL_OPTIONS,
  type AiProvider,
} from '../../types/settings';
import { getAiProvider } from '../../services/ai/providers';
import { AiApiError } from '../../services/ai/types';

interface Props {
  input: DiagnosisInput;
  onBack: () => void;
}

export function DiagnosisHeader({ input, onBack }: Props) {
  const { t } = useTranslation();
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const aiModel = useSettingsStore((s) => s.aiModel);
  const aiApiKeys = useSettingsStore((s) => s.aiApiKeys);
  const localLlmModel = useSettingsStore((s) => s.localLlmModel);
  const localLlmEndpoint = useSettingsStore((s) => s.localLlmEndpoint);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const openSettingsModal = useUiStore((s) => s.openSettingsModal);
  const { save: saveSettings } = useSettings();

  // 프로바이더 드롭다운
  const [providerOpen, setProviderOpen] = useState(false);
  const providerRef = useRef<HTMLDivElement>(null);

  // 모델 새로고침
  const [dynamicModels, setDynamicModels] = useState<Partial<Record<AiProvider, string[]>>>({});
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [preferHardcodedList, setPreferHardcodedList] = useState(false);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    if (!providerOpen) return;
    const handler = (e: MouseEvent) => {
      if (providerRef.current && !providerRef.current.contains(e.target as Node)) {
        setProviderOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [providerOpen]);

  const exceptionClass = input.type === 'exception'
    ? input.exceptionClass
    : (input.logEntry.exceptionClass?.split('.').pop() ?? t('aiDiagnosis.unknownClass'));

  const fullName = input.type === 'exception'
    ? input.fullName
    : (input.logEntry.exceptionClass ?? t('aiDiagnosis.unknownClass'));

  const count = input.type === 'exception' ? input.count : 1;

  const providerLabel = aiProvider ? AI_PROVIDER_LABELS[aiProvider] : t('aiDiagnosis.providerNotSet');
  const isLocal = aiProvider === 'local';

  // 프로바이더 키 유무 확인
  const hasKey = (p: AiProvider): boolean => {
    if (p === 'local') return localLlmEndpoint.trim() !== '';
    return (aiApiKeys[p] ?? '').trim() !== '';
  };

  // 모델 목록 계산
  const hasDynamicForCurrent = aiProvider !== null && dynamicModels[aiProvider] !== undefined;
  const isDynamicModelList = hasDynamicForCurrent && !preferHardcodedList;
  const modelOptions: string[] =
    aiProvider !== null && !isLocal
      ? isDynamicModelList
        ? (dynamicModels[aiProvider] as string[])
        : AI_MODEL_OPTIONS[aiProvider]
      : [];

  // 영구 저장 헬퍼
  const persistSettings = async (partial: Record<string, unknown>) => {
    setSettings(partial);
    const { _initialized, setSettings: _s, resetToDefaults: _r, ...current } = useSettingsStore.getState();
    await saveSettings({ ...current, ...partial }).catch(() => {});
  };

  // 프로바이더 선택
  const selectProvider = async (p: AiProvider) => {
    if (!hasKey(p)) return;
    const model = p === 'local' ? '' : AI_DEFAULT_MODELS[p];
    setProviderOpen(false);
    setPreferHardcodedList(false);
    await persistSettings({ aiProvider: p, aiModel: model });
  };

  // 모델 선택
  const handleModelChange = async (model: string) => {
    await persistSettings({ aiModel: model });
  };

  // 모델 새로고침
  const handleRefreshModels = async () => {
    if (aiProvider === null || isLocal) return;
    const key = aiApiKeys[aiProvider]?.trim();
    if (!key) return;
    setRefreshingModels(true);
    try {
      const provider = getAiProvider(aiProvider);
      const models = await provider.listModels(key);
      if (models.length > 0) {
        setDynamicModels((prev) => ({ ...prev, [aiProvider]: models }));
        setPreferHardcodedList(false);
        if (!models.includes(aiModel)) {
          await persistSettings({ aiModel: models[0] });
        }
      }
    } catch (e) {
      // 조용히 실패 — 기본 목록 유지
      console.warn('[DiagnosisHeader] listModels failed:', e instanceof AiApiError ? e.message : e);
    } finally {
      setRefreshingModels(false);
    }
  };

  // 실시간/기본 토글
  const handleToggleModelList = async () => {
    if (aiProvider === null || !hasDynamicForCurrent) return;
    const next = !preferHardcodedList;
    const nextList = next
      ? AI_MODEL_OPTIONS[aiProvider]
      : (dynamicModels[aiProvider] as string[]);
    setPreferHardcodedList(next);
    if (!nextList.includes(aiModel) && nextList.length > 0) {
      await persistSettings({ aiModel: nextList[0] });
    }
  };

  return (
    <div className="flex flex-col border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)] flex-shrink-0">
      {/* 1행: 뒤로가기 + 제목 */}
      <div className="flex items-center gap-4 px-4 py-2.5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
          aria-label={t('aiDiagnosis.backAria')}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('aiDiagnosis.back')}</span>
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
            {t('aiDiagnosis.headerTitle', { name: exceptionClass, count: count.toLocaleString() })}
          </h1>
          <p className="text-xs text-[var(--color-text-tertiary)] font-mono truncate" title={fullName}>
            {fullName}
          </p>
        </div>
      </div>

      {/* 2행: 프로바이더 선택 + 모델 선택 */}
      <div className="flex items-center gap-2 px-4 py-2 border-t border-[var(--color-border-default)]/50">
        {/* 프로바이더 드롭다운 */}
        <div className="relative" ref={providerRef}>
          <button
            onClick={() => setProviderOpen(!providerOpen)}
            className="flex items-center gap-1.5 bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)] rounded-lg px-3 py-1.5 transition-colors border border-[var(--color-border-default)] text-xs"
          >
            <span className="font-medium text-[var(--color-text-primary)]">{providerLabel}</span>
            <ChevronDown className={`w-3 h-3 text-[var(--color-text-tertiary)] transition-transform ${providerOpen ? 'rotate-180' : ''}`} />
          </button>

          {providerOpen && (
            <div className="absolute left-0 top-full mt-1 w-60 bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg shadow-xl z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-[var(--color-border-default)]">
                <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{t('aiDiagnosis.providerSelect')}</span>
              </div>
              <div className="py-1">
                {AI_PROVIDERS.map((p) => {
                  const isActive = aiProvider === p;
                  const hasApiKey = hasKey(p);
                  const label = AI_PROVIDER_LABELS[p];
                  return (
                    <button
                      key={p}
                      onClick={() => selectProvider(p)}
                      disabled={!hasApiKey}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                        isActive
                          ? 'bg-[var(--color-accent-primary-subtle-bg)]'
                          : hasApiKey
                            ? 'hover:bg-[var(--color-bg-hover)]'
                            : 'opacity-40 cursor-not-allowed'
                      }`}
                    >
                      <div className="w-4 flex-shrink-0">
                        {isActive && <Check className="w-4 h-4 text-[var(--color-accent-primary)]" />}
                      </div>
                      <span className={`text-xs font-medium ${isActive ? 'text-[var(--color-accent-primary)]' : hasApiKey ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'}`}>
                        {label}
                      </span>
                      {!hasApiKey && (
                        <span className="text-[10px] text-[var(--color-status-warn-fg)]/70 ml-auto">{t('aiDiagnosis.providerKeyMissing')}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-[var(--color-border-default)]">
                <button
                  onClick={() => {
                    setProviderOpen(false);
                    openSettingsModal('ai');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
                  {t('aiDiagnosis.apiKeyManage')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 모델 선택 (클라우드 프로바이더만) */}
        {aiProvider !== null && !isLocal && (
          <>
            <select
              value={aiModel}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={refreshingModels}
              className="flex-1 min-w-0 bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg px-3 py-1.5 text-xs text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none disabled:opacity-50 max-w-[240px]"
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
              {aiModel && !modelOptions.includes(aiModel) && (
                <option key={aiModel} value={aiModel}>{aiModel}</option>
              )}
            </select>

            {/* 새로고침 버튼 */}
            <button
              onClick={handleRefreshModels}
              disabled={refreshingModels}
              title={t('aiDiagnosis.providerRefreshTooltip')}
              className="flex items-center gap-1 text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] border border-[var(--color-border-default)] rounded-lg px-2 py-1.5 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${refreshingModels ? 'animate-spin' : ''}`} />
            </button>

            {/* 실시간/기본 토글 */}
            {hasDynamicForCurrent && (
              <button
                onClick={handleToggleModelList}
                disabled={refreshingModels}
                className="text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] border border-[var(--color-border-default)] rounded-lg px-2 py-1.5 transition-colors disabled:opacity-40"
              >
                {preferHardcodedList ? t('aiDiagnosis.live') : t('aiDiagnosis.default')}
              </button>
            )}
          </>
        )}

        {/* 로컬 LLM 모델 표시 */}
        {isLocal && (
          <span className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg px-3 py-1.5">
            {localLlmModel || t('aiDiagnosis.modelNotSet')}
          </span>
        )}
      </div>
    </div>
  );
}
