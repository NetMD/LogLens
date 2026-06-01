// AI 진단 비즈니스 로직 훅 (R13 fileId 스코프)
// reducer 상태(phase/messages/result/isStreaming)를 uiStore.diagnoses[fileId] 로 승격하여
// 탭 전환 시(컴포넌트 언마운트) 상태 손실 방지 (AC-08-1/3).
// AbortController 는 fileId-keyed Map 단일 위임 (NFR-I, AC-08-2, EXT-008).

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DiagnosisInput,
  DiagnosisPhase,
  ChatMessageData,
  DiagnosisHistory,
  UnidirectionalResult,
} from '../types/diagnosis';
import { TOKEN_PRICE_PER_1K_INPUT, PHASE_TARGETS } from '../types/diagnosis';
import { useSettingsStore } from '../store/settingsStore';
import { useLogStore } from '../store/logStore';
import { useUiStore, makeInitialDiagnosisTabState } from '../store/uiStore';
import type { DiagnosisTabState } from '../store/uiStore';
import { getActiveApiKey, isLocalProvider } from '../types/settings';
import { getAiProvider } from '../services/ai/providers/index';
import { AiApiError } from '../services/ai/types';
import i18n from '../i18n';
import { buildUnidirectionalPrompt, buildConversationalSystemPrompt } from '../services/diagnosis/promptBuilder';
import { parseDiagnosisResponse } from '../services/diagnosis/jsonParser';
import { assertNoApiKeyInPrompt } from '../services/diagnosis/sanitize';
import {
  loadDiagnosisHistories,
  saveDiagnosisHistory,
  deleteDiagnosisHistory as deleteHistoryEntry,
  clearAllDiagnosisHistory,
} from './useDiagnosisHistory';

// ─────────────────────────────────────────────────────────────────────
// AbortController fileId-keyed Map (NFR-I, AC-08-2, EXT-008 단일 위임)
// ─────────────────────────────────────────────────────────────────────
const diagnosisAbortByFile = new Map<string, AbortController>();

/** 진단 시작 단일 위임 진입점 */
export function beginDiagnosisAbort(fileId: string): AbortController {
  diagnosisAbortByFile.get(fileId)?.abort(); // allow: 같은 탭 재시작 시 이전 것 취소
  const c = new AbortController(); // allow: 진단 시작 단일 위임
  diagnosisAbortByFile.set(fileId, c);
  return c;
}

/** 취소/탭닫기 단일 위임 */
export function abortDiagnosis(fileId: string): void {
  diagnosisAbortByFile.get(fileId)?.abort(); // allow: 취소/탭닫기 단일 위임
  diagnosisAbortByFile.delete(fileId);
}

// === 진단 store 헬퍼 (uiStore.diagnoses[fileId]) ===
function readDiag(fileId: string | null): DiagnosisTabState {
  if (!fileId) return makeInitialDiagnosisTabState();
  return useUiStore.getState().diagnoses[fileId] ?? makeInitialDiagnosisTabState();
}

function patchDiag(fileId: string, patch: Partial<DiagnosisTabState>): void {
  useUiStore.getState().patchDiagnosis(fileId, patch);
}

export interface UseDiagnosisReturn {
  phase: DiagnosisPhase;
  progress: number;
  result: UnidirectionalResult | null;
  rawResponse: string;
  error: AiApiError | null;
  startDiagnosis: (scope: 'selected' | 'full') => Promise<void>;
  cancelDiagnosis: () => void;
  retryDiagnosis: () => Promise<void>;

  messages: ChatMessageData[];
  isStreaming: boolean;
  streamingContent: string;
  sendMessage: (content: string) => Promise<void>;
  cancelStreaming: () => void;

  histories: DiagnosisHistory[];
  relatedHistoryCount: number;
  saveToHistory: () => Promise<void>;
  deleteHistory: (id: string) => Promise<void>;
  clearAllHistory: () => Promise<void>;
  loadHistories: () => Promise<void>;

  canStartDiagnosis: boolean;
  isPayloadTooLarge: boolean;
  payloadSize: number;
  estimatedCost: number;
  isAnalyzing: boolean;

  continueToChat: () => void;

  includeHistory: boolean;
  setIncludeHistory: (v: boolean) => void;

  tokensUsed: number;
}

export function useDiagnosis(input: DiagnosisInput | null): UseDiagnosisReturn {
  // 진단 상태는 활성 탭 fileId 스코프에서 구독 (탭 전환 시 store 보존)
  const activeFileId = useLogStore((s) => s.activeFileId);
  const diagState = useUiStore((s) =>
    activeFileId ? s.diagnoses[activeFileId] : undefined,
  );
  const state = diagState ?? makeInitialDiagnosisTabState();

  const [histories, setHistories] = useState<DiagnosisHistory[]>([]);
  const [includeHistory, setIncludeHistory] = useState(false);
  const [tokensUsed, setTokensUsed] = useState(0);

  const settings = useSettingsStore.getState();

  // 활성 탭 entries/fileName (fileId 인자 — store 직접 조회)
  const entries = useLogStore((s) =>
    s.activeFileId ? s.files[s.activeFileId]?.entries ?? [] : [],
  );
  const fileName = useLogStore((s) =>
    s.activeFileId ? s.files[s.activeFileId]?.fileName ?? null : null,
  );

  // 진단 상태 보장
  useEffect(() => {
    if (activeFileId) useUiStore.getState().ensureDiagnosisState(activeFileId);
  }, [activeFileId]);

  const loadHistories = useCallback(async () => {
    const all = await loadDiagnosisHistories();
    setHistories(all);
  }, []);

  useEffect(() => {
    loadHistories();
  }, [loadHistories]);

  const exceptionClass = input?.type === 'exception'
    ? input.exceptionClass
    : (input?.logEntry.exceptionClass ?? '');

  const relatedHistoryCount = useMemo(
    () => histories.filter((h) => h.exceptionClass === exceptionClass).length,
    [histories, exceptionClass],
  );

  const isAnalyzing =
    state.phase === 'preparing' ||
    state.phase === 'analyzing' ||
    state.phase === 'solving';

  const fullPayloadSize = useMemo(() => {
    if (entries.length === 0) return 0;
    const sample = entries.slice(0, 100);
    const sampleSize = new TextEncoder().encode(JSON.stringify(sample)).byteLength;
    return Math.ceil((sampleSize / sample.length) * entries.length);
  }, [entries]);

  const payloadSize = fullPayloadSize;
  const isPayloadTooLarge = fullPayloadSize >= 5 * 1024 * 1024;

  const estimatedCost = useMemo(() => {
    const provider = settings.aiProvider;
    if (!provider) return 0;
    const pricePerK = TOKEN_PRICE_PER_1K_INPUT[provider] ?? 0;
    const estimatedTokens = Math.ceil(fullPayloadSize / 4);
    return (estimatedTokens / 1000) * pricePerK;
  }, [fullPayloadSize, settings.aiProvider]);

  const canStartDiagnosis = useMemo(() => {
    const s = useSettingsStore.getState();
    if (!s.aiProvider) return false;
    const hasValidCredentials = isLocalProvider(s.aiProvider)
      ? s.localLlmEndpoint.trim() !== ''
      : getActiveApiKey(s) !== '';
    return hasValidCredentials && !isAnalyzing && input !== null;
  }, [isAnalyzing, input]);

  const setPhaseWithInterpolation = useCallback(
    (fileId: string, phase: DiagnosisPhase) => {
      const target = PHASE_TARGETS[phase];
      patchDiag(fileId, { phase, progress: target });
    },
    [],
  );

  // === 단방향 분석 ===
  const startDiagnosis = useCallback(
    async (scope: 'selected' | 'full') => {
      if (!input) return;
      const fileId = useLogStore.getState().activeFileId;
      if (!fileId) return;

      const s = useSettingsStore.getState();
      if (!s.aiProvider) return;
      const apiKey = isLocalProvider(s.aiProvider) ? '' : getActiveApiKey(s);
      if (!apiKey && !isLocalProvider(s.aiProvider)) return;
      if (scope === 'full' && fullPayloadSize >= 5 * 1024 * 1024) return;

      patchDiag(fileId, {
        phase: 'preparing',
        progress: 0,
        result: null,
        rawResponse: '',
        error: null,
        streamBuffer: '',
        lastScope: scope,
      });
      setTokensUsed(0);

      const controller = beginDiagnosisAbort(fileId);

      try {
        setPhaseWithInterpolation(fileId, 'preparing');

        const relatedHistories = includeHistory
          ? histories.filter((h) => h.exceptionClass === exceptionClass).slice(0, 3)
          : undefined;

        const { systemPrompt, userPrompt } = buildUnidirectionalPrompt(
          input,
          scope,
          scope === 'full' ? entries : [],
          relatedHistories,
        );

        assertNoApiKeyInPrompt(systemPrompt + '\n' + userPrompt, s.aiApiKeys);

        const provider = getAiProvider(s.aiProvider);
        const model = s.aiProvider === 'local' ? s.localLlmModel : s.aiModel;

        setPhaseWithInterpolation(fileId, 'analyzing');

        const response = await provider.send(
          { systemPrompt, userPrompt, maxTokens: 4096 },
          apiKey,
          model,
          controller.signal,
          () => {
            setPhaseWithInterpolation(fileId, 'analyzing');
          },
        );

        if (controller.signal.aborted) return;

        setPhaseWithInterpolation(fileId, 'solving');

        if (response.tokensUsed) setTokensUsed(response.tokensUsed);

        const parsed = parseDiagnosisResponse(response.content);

        if (parsed.success) {
          patchDiag(fileId, {
            phase: parsed.partial ? 'partial' : 'completed',
            progress: 100,
            result: parsed.result,
            rawResponse: parsed.rawResponse,
          });
        } else {
          patchDiag(fileId, {
            phase: 'completed',
            progress: 100,
            result: null,
            rawResponse: parsed.rawResponse,
          });
        }
      } catch (err) {
        if (controller.signal.aborted) {
          patchDiag(fileId, { phase: 'idle', progress: 0, streamBuffer: '' });
          return;
        }
        if (err instanceof AiApiError) {
          patchDiag(fileId, { phase: 'error', error: err, progress: 0 });
        } else {
          patchDiag(fileId, {
            phase: 'error',
            error: new AiApiError(
              'NETWORK_ERROR',
              (err as Error).message ?? i18n.t('common.unknownError'),
            ),
            progress: 0,
          });
        }
      }
    },
    [input, fullPayloadSize, includeHistory, histories, exceptionClass, entries, setPhaseWithInterpolation],
  );

  const cancelDiagnosis = useCallback(() => {
    const fileId = useLogStore.getState().activeFileId;
    if (!fileId) return;
    abortDiagnosis(fileId);
    patchDiag(fileId, { phase: 'idle', progress: 0, streamBuffer: '' });
  }, []);

  const retryDiagnosis = useCallback(async () => {
    const fileId = useLogStore.getState().activeFileId;
    if (!fileId) return;
    const last = readDiag(fileId).lastScope;
    patchDiag(fileId, {
      phase: 'idle',
      progress: 0,
      result: null,
      rawResponse: '',
      error: null,
      streamBuffer: '',
    });
    await startDiagnosis(last);
  }, [startDiagnosis]);

  // === 대화형 분석 ===
  const sendMessage = useCallback(
    async (content: string) => {
      if (!input) return;
      const fileId = useLogStore.getState().activeFileId;
      if (!fileId) return;

      const s = useSettingsStore.getState();
      if (!s.aiProvider) return;
      const apiKey = isLocalProvider(s.aiProvider) ? '' : getActiveApiKey(s);
      if (!apiKey && !isLocalProvider(s.aiProvider)) return;

      const cur = readDiag(fileId);
      if (cur.messages.length >= 50) return;
      if (cur.isStreaming) return;
      if (content.trim() === '') return;

      const userMessage: ChatMessageData = {
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };
      const withUser = [...cur.messages, userMessage];
      patchDiag(fileId, {
        messages: withUser,
        isStreaming: true,
        streamingContent: '',
      });

      const controller = beginDiagnosisAbort(fileId);

      try {
        const systemPrompt = buildConversationalSystemPrompt(input, cur.result);
        assertNoApiKeyInPrompt(systemPrompt + '\n' + content, s.aiApiKeys);

        const provider = getAiProvider(s.aiProvider);
        const model = s.aiProvider === 'local' ? s.localLlmModel : s.aiModel;

        const conversationText = withUser
          .filter((m) => m.role !== 'system')
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n\n');

        let fullContent = '';

        const response = await provider.send(
          { systemPrompt, userPrompt: conversationText, maxTokens: 4096 },
          apiKey,
          model,
          controller.signal,
          (delta) => {
            fullContent += delta;
            const latest = readDiag(fileId);
            patchDiag(fileId, {
              streamingContent: latest.streamingContent + delta,
            });
          },
        );

        if (controller.signal.aborted) return;

        if (response.tokensUsed) setTokensUsed((prev) => prev + response.tokensUsed!);

        const finalContent = response.content || fullContent;
        const after = readDiag(fileId);
        patchDiag(fileId, {
          isStreaming: false,
          streamingContent: '',
          messages: [
            ...after.messages,
            {
              role: 'assistant',
              content: finalContent,
              timestamp: new Date().toISOString(),
            },
          ],
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        const errorMsg =
          err instanceof AiApiError
            ? err.type === 'ABORTED'
              ? ''
              : i18n.t('aiDiagnosis.errorPrefix', { message: err.message })
            : i18n.t('aiDiagnosis.incompleteResponse');
        const after = readDiag(fileId);
        if (errorMsg) {
          patchDiag(fileId, {
            isStreaming: false,
            streamingContent: '',
            messages: [
              ...after.messages,
              ...(after.streamingContent
                ? [
                    {
                      role: 'assistant' as const,
                      content: after.streamingContent,
                      timestamp: new Date().toISOString(),
                    },
                  ]
                : []),
              {
                role: 'system' as const,
                content: errorMsg,
                timestamp: new Date().toISOString(),
              },
            ],
          });
        }
      }
    },
    [input],
  );

  const cancelStreaming = useCallback(() => {
    const fileId = useLogStore.getState().activeFileId;
    if (fileId) abortDiagnosis(fileId);
  }, []);

  const continueToChat = useCallback(() => {
    const fileId = useLogStore.getState().activeFileId;
    if (!fileId) return;
    const cur = readDiag(fileId);
    if (!cur.result) return;
    const summaryMessage: ChatMessageData = {
      role: 'system',
      content: JSON.stringify(cur.result),
      timestamp: new Date().toISOString(),
    };
    patchDiag(fileId, { messages: [summaryMessage] });
  }, []);

  // === 히스토리 CRUD ===
  const saveToHistory = useCallback(async () => {
    const fileId = useLogStore.getState().activeFileId;
    if (!input || !fileId) return;
    const cur = readDiag(fileId);
    if (!cur.result) return;

    const s = useSettingsStore.getState();
    const history: DiagnosisHistory = {
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      exceptionClass:
        input.type === 'exception'
          ? input.exceptionClass
          : input.logEntry.exceptionClass ?? 'Unknown',
      fullName:
        input.type === 'exception'
          ? input.fullName
          : input.logEntry.exceptionClass ?? 'Unknown',
      sourceFile: fileName ?? 'unknown',
      provider: s.aiProvider ?? 'claude',
      model: s.aiProvider === 'local' ? s.localLlmModel : s.aiModel,
      tokensUsed,
      estimatedCost:
        (tokensUsed / 1000) * (TOKEN_PRICE_PER_1K_INPUT[s.aiProvider ?? 'claude'] ?? 0),
      unidirectional: cur.result,
      conversation: cur.messages.length > 0 ? cur.messages : undefined,
    };

    await saveDiagnosisHistory(history, s.maxHistoryCount);
    await loadHistories();
  }, [input, tokensUsed, fileName, loadHistories]);

  const deleteHistory = useCallback(
    async (id: string) => {
      await deleteHistoryEntry(id);
      await loadHistories();
    },
    [loadHistories],
  );

  const clearAllHistoryFn = useCallback(async () => {
    await clearAllDiagnosisHistory();
    await loadHistories();
  }, [loadHistories]);

  return {
    phase: state.phase,
    progress: state.progress,
    result: state.result,
    rawResponse: state.rawResponse,
    error: state.error,
    startDiagnosis,
    cancelDiagnosis,
    retryDiagnosis,

    messages: state.messages,
    isStreaming: state.isStreaming,
    streamingContent: state.streamingContent,
    sendMessage,
    cancelStreaming,

    histories,
    relatedHistoryCount,
    saveToHistory,
    deleteHistory,
    clearAllHistory: clearAllHistoryFn,
    loadHistories,

    canStartDiagnosis,
    isPayloadTooLarge,
    payloadSize,
    estimatedCost,
    isAnalyzing,

    continueToChat,

    includeHistory,
    setIncludeHistory,

    tokensUsed,
  };
}
