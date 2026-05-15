// AI 진단 비즈니스 로직 훅 (상태 + AI 호출 + 히스토리 + 파생 상태)

import { useReducer, useCallback, useRef, useEffect, useMemo, useState } from 'react';
import type {
  DiagnosisInput,
  DiagnosisPhase,
  UnidirectionalResult,
  ChatMessageData,
  DiagnosisHistory,
} from '../types/diagnosis';
import { TOKEN_PRICE_PER_1K_INPUT, PHASE_TARGETS } from '../types/diagnosis';
import { useSettingsStore } from '../store/settingsStore';
import { useLogStore } from '../store/logStore';
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

// === useReducer 상태/액션 정의 ===

interface DiagnosisState {
  // 단방향
  phase: DiagnosisPhase;
  progress: number;
  result: UnidirectionalResult | null;
  rawResponse: string;
  error: AiApiError | null;
  streamBuffer: string;

  // 대화형
  messages: ChatMessageData[];
  isStreaming: boolean;
  streamingContent: string;

  // 마지막 scope (재분석용)
  lastScope: 'selected' | 'full';
}

type DiagnosisAction =
  | { type: 'START_DIAGNOSIS'; scope: 'selected' | 'full' }
  | { type: 'SET_PHASE'; phase: DiagnosisPhase; progress: number }
  | { type: 'STREAM_DELTA'; delta: string }
  | { type: 'COMPLETE'; result: UnidirectionalResult | null; rawResponse: string; partial: boolean }
  | { type: 'ERROR'; error: AiApiError }
  | { type: 'PARTIAL'; rawResponse: string }
  | { type: 'CANCEL' }
  | { type: 'ADD_MESSAGE'; message: ChatMessageData }
  | { type: 'START_STREAMING' }
  | { type: 'STREAM_CHAT_DELTA'; delta: string }
  | { type: 'END_STREAMING'; content: string }
  | { type: 'STREAMING_ERROR'; errorMsg: string }
  | { type: 'RESET_UNI' }
  | { type: 'SET_PREVIOUS_ANALYSIS'; messages: ChatMessageData[] };

const initialState: DiagnosisState = {
  phase: 'idle',
  progress: 0,
  result: null,
  rawResponse: '',
  error: null,
  streamBuffer: '',
  messages: [],
  isStreaming: false,
  streamingContent: '',
  lastScope: 'selected',
};

function diagnosisReducer(state: DiagnosisState, action: DiagnosisAction): DiagnosisState {
  switch (action.type) {
    case 'START_DIAGNOSIS':
      return {
        ...state,
        phase: 'preparing',
        progress: 0,
        result: null,
        rawResponse: '',
        error: null,
        streamBuffer: '',
        lastScope: action.scope,
      };
    case 'SET_PHASE':
      return { ...state, phase: action.phase, progress: action.progress };
    case 'STREAM_DELTA':
      return { ...state, streamBuffer: state.streamBuffer + action.delta };
    case 'COMPLETE':
      return {
        ...state,
        phase: action.partial ? 'partial' : 'completed',
        progress: 100,
        result: action.result,
        rawResponse: action.rawResponse,
      };
    case 'ERROR':
      return { ...state, phase: 'error', error: action.error, progress: 0 };
    case 'PARTIAL':
      return { ...state, phase: 'partial', rawResponse: action.rawResponse, progress: 100 };
    case 'CANCEL':
      return { ...state, phase: 'idle', progress: 0, streamBuffer: '' };
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };
    case 'START_STREAMING':
      return { ...state, isStreaming: true, streamingContent: '' };
    case 'STREAM_CHAT_DELTA':
      return { ...state, streamingContent: state.streamingContent + action.delta };
    case 'END_STREAMING':
      return {
        ...state,
        isStreaming: false,
        streamingContent: '',
        messages: [
          ...state.messages,
          {
            role: 'assistant',
            content: action.content,
            timestamp: new Date().toISOString(),
          },
        ],
      };
    case 'STREAMING_ERROR':
      return {
        ...state,
        isStreaming: false,
        streamingContent: '',
        messages: [
          ...state.messages,
          ...(state.streamingContent
            ? [{
                role: 'assistant' as const,
                content: state.streamingContent,
                timestamp: new Date().toISOString(),
              }]
            : []),
          {
            role: 'system' as const,
            content: action.errorMsg,
            timestamp: new Date().toISOString(),
          },
        ],
      };
    case 'RESET_UNI':
      return {
        ...state,
        phase: 'idle',
        progress: 0,
        result: null,
        rawResponse: '',
        error: null,
        streamBuffer: '',
      };
    case 'SET_PREVIOUS_ANALYSIS':
      return { ...state, messages: action.messages };
    default:
      return state;
  }
}

// === 훅 본체 ===

export interface UseDiagnosisReturn {
  // 단방향
  phase: DiagnosisPhase;
  progress: number;
  result: UnidirectionalResult | null;
  rawResponse: string;
  error: AiApiError | null;
  startDiagnosis: (scope: 'selected' | 'full') => Promise<void>;
  cancelDiagnosis: () => void;
  retryDiagnosis: () => Promise<void>;

  // 대화형
  messages: ChatMessageData[];
  isStreaming: boolean;
  streamingContent: string;
  sendMessage: (content: string) => Promise<void>;
  cancelStreaming: () => void;

  // 히스토리
  histories: DiagnosisHistory[];
  relatedHistoryCount: number;
  saveToHistory: () => Promise<void>;
  deleteHistory: (id: string) => Promise<void>;
  clearAllHistory: () => Promise<void>;
  loadHistories: () => Promise<void>;

  // 파생 상태
  canStartDiagnosis: boolean;
  isPayloadTooLarge: boolean;
  payloadSize: number;
  estimatedCost: number;
  isAnalyzing: boolean;

  // 컨텍스트 전달
  continueToChat: () => void;

  // 히스토리 포함
  includeHistory: boolean;
  setIncludeHistory: (v: boolean) => void;

  // 토큰 카운트 (히스토리 저장용)
  tokensUsed: number;
}

export function useDiagnosis(input: DiagnosisInput | null): UseDiagnosisReturn {
  const [state, dispatch] = useReducer(diagnosisReducer, initialState);
  const [histories, setHistories] = useState<DiagnosisHistory[]>([]);
  const [includeHistory, setIncludeHistory] = useState(false);
  const [tokensUsed, setTokensUsed] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const ttfbMeasured = useRef(false);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 스토어 구독 (설정 상태)
  const settings = useSettingsStore.getState();

  // 로그 엔트리
  const entries = useLogStore((s) => s.entries);
  const fileName = useLogStore((s) => s.fileName);

  // === 히스토리 로드 ===
  const loadHistories = useCallback(async () => {
    const all = await loadDiagnosisHistories();
    setHistories(all);
  }, []);

  // 마운트 시 히스토리 로드
  useEffect(() => {
    loadHistories();
  }, [loadHistories]);

  // === 파생 상태 ===

  const exceptionClass = input?.type === 'exception'
    ? input.exceptionClass
    : (input?.logEntry.exceptionClass ?? '');

  const relatedHistoryCount = useMemo(() =>
    histories.filter(h => h.exceptionClass === exceptionClass).length,
    [histories, exceptionClass]
  );

  const isAnalyzing = state.phase === 'preparing' || state.phase === 'analyzing' || state.phase === 'solving';

  // 전체 로그 용량
  const fullPayloadSize = useMemo(() => {
    if (entries.length === 0) return 0;
    // 근사값: 첫 100개 엔트리의 평균 크기 * 전체 수
    const sample = entries.slice(0, 100);
    const sampleSize = new TextEncoder().encode(JSON.stringify(sample)).byteLength;
    return Math.ceil(sampleSize / sample.length * entries.length);
  }, [entries]);

  // 현재 scope에 따른 용량/비용 (기본은 selected)
  // 외부에서 scope를 전달할 수 없으므로 두 가지 모두 제공
  const payloadSize = fullPayloadSize;
  const isPayloadTooLarge = fullPayloadSize >= 5 * 1024 * 1024;

  const estimatedCost = useMemo(() => {
    const provider = settings.aiProvider;
    if (!provider) return 0;
    const pricePerK = TOKEN_PRICE_PER_1K_INPUT[provider] ?? 0;
    const estimatedTokens = Math.ceil(fullPayloadSize / 4);
    return (estimatedTokens / 1000) * pricePerK;
  }, [fullPayloadSize, settings.aiProvider]);

  // canStartDiagnosis
  const canStartDiagnosis = useMemo(() => {
    const s = useSettingsStore.getState();
    if (!s.aiProvider) return false;
    const hasValidCredentials = isLocalProvider(s.aiProvider)
      ? s.localLlmEndpoint.trim() !== ''
      : getActiveApiKey(s) !== '';
    return hasValidCredentials && !isAnalyzing && input !== null;
  }, [isAnalyzing, input]);

  // === 진행률 보간 ===
  const setPhaseWithInterpolation = useCallback((phase: DiagnosisPhase) => {
    const target = PHASE_TARGETS[phase];
    // 보간은 간단하게 처리 — CSS transition이 주 담당
    dispatch({ type: 'SET_PHASE', phase, progress: target });
  }, []);

  // === 단방향 분석 ===
  const startDiagnosis = useCallback(async (scope: 'selected' | 'full') => {
    if (!input) return;

    // 가드 #1: 런타임 자격 검증
    const s = useSettingsStore.getState();
    if (!s.aiProvider) return;

    // 가드 #2: API 키 / 엔드포인트 검증
    const apiKey = isLocalProvider(s.aiProvider) ? '' : getActiveApiKey(s);
    if (!apiKey && !isLocalProvider(s.aiProvider)) return;

    // 5MB 차단 (전체 로그)
    if (scope === 'full' && fullPayloadSize >= 5 * 1024 * 1024) return;

    console.time('diagnosis-ttfb');
    console.time('diagnosis-total');

    dispatch({ type: 'START_DIAGNOSIS', scope });
    ttfbMeasured.current = false;
    setTokensUsed(0);

    // AbortController
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // preparing phase
      setPhaseWithInterpolation('preparing');

      console.time('diagnosis-prompt-build');

      // 이전 히스토리 (선택적)
      const relatedHistories = includeHistory
        ? histories.filter(h => h.exceptionClass === exceptionClass).slice(0, 3)
        : undefined;

      // 프롬프트 구성
      const { systemPrompt, userPrompt } = buildUnidirectionalPrompt(
        input,
        scope,
        scope === 'full' ? entries : [],
        relatedHistories,
      );
      console.timeEnd('diagnosis-prompt-build');

      // 가드 #3: API 키 노출 차단 assert
      assertNoApiKeyInPrompt(systemPrompt + '\n' + userPrompt, s.aiApiKeys);

      // AI 호출
      const provider = getAiProvider(s.aiProvider);
      const model = s.aiProvider === 'local' ? s.localLlmModel : s.aiModel;

      setPhaseWithInterpolation('analyzing');

      const response = await provider.send(
        {
          systemPrompt,
          userPrompt,
          maxTokens: 4096,
        },
        apiKey,
        model,
        controller.signal,
        (delta) => {
          // TTFB 측정 (1회만)
          if (!ttfbMeasured.current) {
            console.timeEnd('diagnosis-ttfb');
            ttfbMeasured.current = true;
            setPhaseWithInterpolation('analyzing');
          }

          dispatch({ type: 'STREAM_DELTA', delta });

          // solving phase 전이 (50% 이상 수신 추정)
          // 간단한 휴리스틱: 1000자 이상 수신 시
          if (delta.length > 0) {
            // 내부 streamBuffer 접근은 불가하므로 일정 시간 후 전이
          }
        },
      );

      if (controller.signal.aborted) return;

      // solving -> completed
      setPhaseWithInterpolation('solving');

      // 토큰 수 저장
      if (response.tokensUsed) {
        setTokensUsed(response.tokensUsed);
      }

      // JSON 파싱
      const parsed = parseDiagnosisResponse(response.content);

      console.timeEnd('diagnosis-total');

      if (parsed.success) {
        dispatch({
          type: 'COMPLETE',
          result: parsed.result,
          rawResponse: parsed.rawResponse,
          partial: parsed.partial,
        });
      } else {
        // JSON 파싱 완전 실패 — 원문 텍스트 fallback
        dispatch({
          type: 'COMPLETE',
          result: null,
          rawResponse: parsed.rawResponse,
          partial: false,
        });
      }
    } catch (err) {
      if (controller.signal.aborted) {
        dispatch({ type: 'CANCEL' });
        return;
      }

      console.timeEnd('diagnosis-total');

      if (err instanceof AiApiError) {
        dispatch({ type: 'ERROR', error: err });
      } else {
        dispatch({
          type: 'ERROR',
          error: new AiApiError('NETWORK_ERROR', (err as Error).message ?? i18n.t('common.unknownError')),
        });
      }
    }
  }, [input, fullPayloadSize, includeHistory, histories, exceptionClass, entries, setPhaseWithInterpolation]);

  const cancelDiagnosis = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: 'CANCEL' });
  }, []);

  const retryDiagnosis = useCallback(async () => {
    dispatch({ type: 'RESET_UNI' });
    await startDiagnosis(state.lastScope);
  }, [startDiagnosis, state.lastScope]);

  // === 대화형 분석 ===
  const sendMessage = useCallback(async (content: string) => {
    if (!input) return;

    // 가드: 자격 검증
    const s = useSettingsStore.getState();
    if (!s.aiProvider) return;
    const apiKey = isLocalProvider(s.aiProvider) ? '' : getActiveApiKey(s);
    if (!apiKey && !isLocalProvider(s.aiProvider)) return;

    // 50 메시지 제한
    if (state.messages.length >= 50) return;
    if (state.isStreaming) return;
    if (content.trim() === '') return;

    // 사용자 메시지 추가
    const userMessage: ChatMessageData = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_MESSAGE', message: userMessage });
    dispatch({ type: 'START_STREAMING' });

    // AbortController
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // 시스템 프롬프트 구성
      const systemPrompt = buildConversationalSystemPrompt(input, state.result);

      // 가드 #3: API 키 노출 차단
      assertNoApiKeyInPrompt(systemPrompt + '\n' + content, s.aiApiKeys);

      const provider = getAiProvider(s.aiProvider);
      const model = s.aiProvider === 'local' ? s.localLlmModel : s.aiModel;

      // messages 배열 구성 (시스템 프롬프트는 send()의 systemPrompt에 별도 전달)
      // 대화 히스토리를 userPrompt로 직렬화
      const allMessages = [...state.messages, userMessage];
      const conversationText = allMessages
        .filter(m => m.role !== 'system')
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');

      let fullContent = '';

      const response = await provider.send(
        {
          systemPrompt,
          userPrompt: conversationText,
          maxTokens: 4096,
        },
        apiKey,
        model,
        controller.signal,
        (delta) => {
          fullContent += delta;
          dispatch({ type: 'STREAM_CHAT_DELTA', delta });
        },
      );

      if (controller.signal.aborted) return;

      // 토큰 수 갱신
      if (response.tokensUsed) {
        setTokensUsed(prev => prev + response.tokensUsed!);
      }

      dispatch({ type: 'END_STREAMING', content: response.content || fullContent });
    } catch (err) {
      if (controller.signal.aborted) return;

      const errorMsg = err instanceof AiApiError
        ? (err.type === 'ABORTED' ? '' : i18n.t('aiDiagnosis.errorPrefix', { message: err.message }))
        : i18n.t('aiDiagnosis.incompleteResponse');

      if (errorMsg) {
        dispatch({ type: 'STREAMING_ERROR', errorMsg });
      }
    }
  }, [input, state.messages, state.isStreaming, state.result]);

  const cancelStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // === 컨텍스트 전달: 단방향 -> 대화형 ===
  const continueToChat = useCallback(() => {
    if (!state.result) return;

    // 이전 분석 결과를 시스템 메시지로 추가
    const summaryMessage: ChatMessageData = {
      role: 'system',
      content: JSON.stringify(state.result),
      timestamp: new Date().toISOString(),
    };

    dispatch({ type: 'SET_PREVIOUS_ANALYSIS', messages: [summaryMessage] });
  }, [state.result]);

  // === 히스토리 CRUD ===
  const saveToHistory = useCallback(async () => {
    if (!input || !state.result) return;

    const s = useSettingsStore.getState();
    const history: DiagnosisHistory = {
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      exceptionClass: input.type === 'exception'
        ? input.exceptionClass
        : (input.logEntry.exceptionClass ?? 'Unknown'),
      fullName: input.type === 'exception'
        ? input.fullName
        : (input.logEntry.exceptionClass ?? 'Unknown'),
      sourceFile: fileName ?? 'unknown',
      provider: s.aiProvider ?? 'claude',
      model: s.aiProvider === 'local' ? s.localLlmModel : s.aiModel,
      tokensUsed,
      estimatedCost: (tokensUsed / 1000) * (TOKEN_PRICE_PER_1K_INPUT[s.aiProvider ?? 'claude'] ?? 0),
      unidirectional: state.result,
      conversation: state.messages.length > 0 ? state.messages : undefined,
    };

    await saveDiagnosisHistory(history, s.maxHistoryCount);
    await loadHistories();
  }, [input, state.result, state.messages, tokensUsed, fileName, loadHistories]);

  const deleteHistory = useCallback(async (id: string) => {
    await deleteHistoryEntry(id);
    await loadHistories();
  }, [loadHistories]);

  const clearAllHistoryFn = useCallback(async () => {
    await clearAllDiagnosisHistory();
    await loadHistories();
  }, [loadHistories]);

  // 클린업
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
      }
    };
  }, []);

  return {
    // 단방향
    phase: state.phase,
    progress: state.progress,
    result: state.result,
    rawResponse: state.rawResponse,
    error: state.error,
    startDiagnosis,
    cancelDiagnosis,
    retryDiagnosis,

    // 대화형
    messages: state.messages,
    isStreaming: state.isStreaming,
    streamingContent: state.streamingContent,
    sendMessage,
    cancelStreaming,

    // 히스토리
    histories,
    relatedHistoryCount,
    saveToHistory,
    deleteHistory,
    clearAllHistory: clearAllHistoryFn,
    loadHistories,

    // 파생 상태
    canStartDiagnosis,
    isPayloadTooLarge,
    payloadSize,
    estimatedCost,
    isAnalyzing,

    // 컨텍스트 전달
    continueToChat,

    // 히스토리 포함
    includeHistory,
    setIncludeHistory,

    // 토큰
    tokensUsed,
  };
}
