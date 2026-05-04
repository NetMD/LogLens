// AI 리포트 탭 -- 프리셋 선택 + 생성 흐름 + 상태 전환
// 8차: 출력 언어, 프로젝트 루트, 파일 크기 경고, 스트리밍 프리뷰, PrintableAiReport 통합

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  Settings,
  AlertTriangle,

  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  History,
  Trash2,
} from 'lucide-react';
import { useExportStore, isGenerating } from '../../store/exportStore';
import type { PresetType } from '../../store/exportStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUiStore } from '../../store/uiStore';
import { useLogStore } from '../../store/logStore';
import { useAiReportHistoryStore } from '../../store/aiReportHistoryStore';
import { useAiReportHistory } from '../../hooks/useAiReportHistory';
import { AiGenerationStatus } from './AiGenerationStatus';
import {
  FileSizeWarningDialog,
  decideWarningVariant,
  type WarningVariant,
} from './FileSizeWarningDialog';
import { ProjectRootPicker } from './ProjectRootPicker';
import { PrintableAiReport } from './PrintableAiReport';
import { generateAiReport, markdownToDocx } from '../../services/ai/reportGenerator';
import { AiApiError, AI_ERROR_MESSAGES } from '../../services/ai/types';
import { getAiProvider } from '../../services/ai/providers';
import { estimateOutputCostUsd } from '../../services/ai/pricing';
import type { AiProvider } from '../../types/settings';
import type { AiReportHistoryEntry } from '../../types/aiReportHistory';
import { isSingleEntry } from '../../types/aiReportHistory';
import { MultiAiComparison } from './MultiAiComparison';
import { SourceFileConfirmDialog } from './SourceFileConfirmDialog';
import {
  AI_PROVIDERS,
  AI_PROVIDER_LABELS,
  AI_DEFAULT_MODELS,
  AI_MODEL_OPTIONS,
  CLOUD_PROVIDERS,
  isLocalProvider,
} from '../../types/settings';

// 프리셋 정의
const PRESETS: { type: PresetType; label: string; description: string }[] = [
  {
    type: 'incident',
    label: '장애 보고서',
    description: '시간대, 영향범위, 근본원인, 조치사항',
  },
  {
    type: 'daily',
    label: '일일 점검 보고서',
    description: '로그 분포, 안정성 평가, 조치 항목',
  },
  {
    type: 'devSummary',
    label: '개발팀 공유 요약',
    description: '핵심 이슈, 코드 분석, 수정 우선순위',
  },
];

/**
 * 프리셋별 파일명 베이스 (공백 제거). 저장 시 여기에 날짜(YYYY-MM-DD)를 붙여 최종 파일명 생성.
 * Word 업로드 모드에서는 업로드한 파일명을 베이스로 사용.
 */
const PRESET_FILE_NAMES: Record<PresetType, { ko: string; en: string }> = {
  incident: { ko: '장애보고서', en: 'incident-report' },
  daily: { ko: '일일점검보고서', en: 'daily-health-check' },
  devSummary: { ko: '개발팀공유요약', en: 'dev-team-summary' },
};

/** OS 저장 대화상자 호환을 위해 파일명에서 금지 문자 제거 */
function sanitizeFileName(name: string): string {
  // Windows/macOS 금지 문자 + 제어문자 제거, 공백 2개 이상은 1개로 축소
  return name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim();
}

/** YYYY-MM-DD 형식의 오늘 날짜 문자열 */
function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * AI 리포트 저장 파일명 생성 (확장자 제외).
 * - 프리셋 모드: `{프리셋 이름} - {YYYY-MM-DD} ({provider})`
 *   예: `장애보고서 - 2026-04-12 (claude)`
 * - 업로드 모드: `{업로드 파일명(확장자 제외)} - {YYYY-MM-DD} ({provider})`
 *   예: `incident-template - 2026-04-12 (gemini)`
 * - provider 가 null 이면 접미사 생략.
 */
function buildAiReportFileName(params: {
  inputMode: 'preset' | 'upload';
  presetType: PresetType;
  uploadedFileName: string | null;
  language: 'ko' | 'en';
  provider: AiProvider | null;
}): string {
  const date = todayYmd();
  let base: string;
  if (params.inputMode === 'upload' && params.uploadedFileName) {
    // 업로드 파일명에서 확장자 제거
    const dot = params.uploadedFileName.lastIndexOf('.');
    base = dot > 0 ? params.uploadedFileName.slice(0, dot) : params.uploadedFileName;
  } else {
    base = PRESET_FILE_NAMES[params.presetType][params.language];
  }
  const providerSuffix = params.provider ? ` (${params.provider})` : '';
  return sanitizeFileName(`${base} - ${date}${providerSuffix}`);
}

export function AiReportTab() {
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const aiApiKeys = useSettingsStore((s) => s.aiApiKeys);
  const aiModel = useSettingsStore((s) => s.aiModel);
  const localLlmEndpoint = useSettingsStore((s) => s.localLlmEndpoint);
  const localLlmModel = useSettingsStore((s) => s.localLlmModel);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const openSettingsModal = useUiStore((s) => s.openSettingsModal);

  // 현재 활성 프로바이더의 키 (생성 버튼 활성화 판단용)
  const activeApiKey = aiProvider !== null ? (aiApiKeys[aiProvider] ?? '') : '';

  const generationStatus = useExportStore((s) => s.generationStatus);
  const generationError = useExportStore((s) => s.generationError);
  const outputFormat = useExportStore((s) => s.outputFormat);
  const presetType = useExportStore((s) => s.presetType);
  const inputMode = useExportStore((s) => s.inputMode);
  const uploadedFile = useExportStore((s) => s.uploadedFile);
  const setPresetType = useExportStore((s) => s.setPresetType);
  // 8차 신규 구독
  const outputLanguage = useExportStore((s) => s.outputLanguage);
  const projectRoot = useExportStore((s) => s.projectRoot);
  const setOutputLanguage = useExportStore((s) => s.setOutputLanguage);
  const setProjectRoot = useExportStore((s) => s.setProjectRoot);
  const generatedContent = useExportStore((s) => s.generatedContent);
  // AI 리포트는 저장 파일명과 PDF 내부 제목을 프리셋+날짜로 일관 생성하므로
  // exportStore.title (기본 PDF 전용) 은 구독하지 않음.
  // QA 재작업: 히스토리 복원 모드 여부 (소스코드 분석 비활성화 용)
  const isFromHistory = useExportStore((s) => s.isFromHistory);

  const fileName = useLogStore((s) => s.fileName);
  const fileSize = useLogStore((s) => s.fileSize);

  // Step 4: AI 리포트 히스토리
  const aiReportHistoryEntries = useAiReportHistoryStore((s) => s.entries);
  const { add: addAiReportHistory, remove: removeAiReportHistory, clear: clearAiReportHistory } =
    useAiReportHistory();
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  // Step 5: 단일 생성 / 비교 생성 모드
  type GenerationMode = 'single' | 'comparison';
  const [generationMode, setGenerationMode] = useState<GenerationMode>('single');

  const abortRef = useRef<AbortController | null>(null);
  const [pendingWarning, setPendingWarning] = useState<WarningVariant | null>(null);
  const [showPrintable, setShowPrintable] = useState(false);

  // 소스 코드 전송 확인 모달
  const [sourceConfirmOpen, setSourceConfirmOpen] = useState(false);
  const [sourceConfirmFiles, setSourceConfirmFiles] = useState<string[]>([]);
  const [sourceConfirmLoading, setSourceConfirmLoading] = useState(false);

  // --- 모델 선택 + ListModels (설정 모달에서 이관) ---
  // 동적 모델 목록 state (ListModels API 결과, 프로바이더별, 세션 단위)
  const [dynamicModels, setDynamicModels] = useState<Partial<Record<AiProvider, string[]>>>({});
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [showFullModelList, setShowFullModelList] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<'idle' | 'copied' | 'failed'>('idle');

  // 마지막 생성 메타 (토큰 사용량 / 예상 비용 / 사용 프로바이더 / 사용 모델)
  // 생성 도중 사용자가 프로바이더/모델을 바꾸더라도 완료 화면이 "실제 생성에 쓰인 값"을 보여주도록
  // 호출 시점의 값을 캡처해 둔다.
  const [lastTokensUsed, setLastTokensUsed] = useState<number | null>(null);
  const [lastEstimatedCostUsd, setLastEstimatedCostUsd] = useState<number | null>(null);
  const [lastProvider, setLastProvider] = useState<AiProvider | null>(null);
  const [lastModel, setLastModel] = useState<string | null>(null);
  // 완료 화면이 "방금 생성(fresh)" 인지 "히스토리에서 복원(restored)" 인지.
  // AiGenerationStatus 에 전달되어 제목/안내 문구/비용 힌트가 분기된다.
  const [lastSource, setLastSource] = useState<'fresh' | 'restored'>('fresh');

  // 모델 목록 표시 모드: dynamic 이 한 번이라도 fetch 되었더라도 사용자가 토글로 hardcoded 를 볼 수 있게 함
  const [preferHardcodedList, setPreferHardcodedList] = useState(false);

  // 프로바이더 변경 시 모델 관련 상태 초기화
  useEffect(() => {
    setModelsError(null);
    setRefreshingModels(false);
    setShowFullModelList(false);
    setCopyFeedback('idle');
    setPreferHardcodedList(false);
  }, [aiProvider]);

  // 컴포넌트 언마운트 시 진행 중인 AI 호출 취소
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // 활성 프로바이더 설정 완료 판정:
  // - 클라우드: API 키 등록됨
  // - 로컬 LLM: 모델명 입력됨
  const isAiConfigured =
    aiProvider !== null &&
    (isLocalProvider(aiProvider)
      ? localLlmModel.trim() !== ''
      : activeApiKey !== '');
  // 최소 1개 이상의 프로바이더가 사용 가능한지
  const hasAnyKey =
    CLOUD_PROVIDERS.some((p) => (aiApiKeys[p] ?? '') !== '') ||
    localLlmModel.trim() !== '';

  /** 프로바이더 선택 드롭다운 핸들러 — 즉시 settingsStore 반영 (파일 저장은 안 함) */
  function handleProviderSelect(next: AiProvider) {
    if (isLocalProvider(next)) {
      // 로컬 LLM: 모델은 설정에서 직접 입력하므로 aiModel 을 localLlmModel 로 설정
      const s = useSettingsStore.getState();
      setSettings({
        aiProvider: next,
        aiModel: s.localLlmModel || '',
      });
    } else {
      setSettings({
        aiProvider: next,
        aiModel: AI_DEFAULT_MODELS[next],
      });
    }
  }

  /** 모델 선택 핸들러 — 즉시 settingsStore 에 반영 */
  function handleModelSelect(next: string) {
    setSettings({ aiModel: next });
  }

  /** 현재 프로바이더의 모델 목록
   *  - dynamic 이 fetch 되어 있고 토글이 hardcoded 를 선호하지 않으면 dynamic
   *  - 그 외(또는 토글로 hardcoded 선호 시)는 하드코딩 fallback */
  const hasDynamicForCurrent =
    aiProvider !== null && dynamicModels[aiProvider] !== undefined;
  const isDynamicModelList = hasDynamicForCurrent && !preferHardcodedList;
  const modelOptions: string[] =
    aiProvider !== null
      ? isDynamicModelList
        ? (dynamicModels[aiProvider] as string[])
        : AI_MODEL_OPTIONS[aiProvider]
      : [];

  /** 모델 목록 표시 모드 토글 (실시간 ↔ 기본). dynamic 이 fetch 된 상태에서만 의미 있음.
   *  토글 후 현재 선택 모델이 새 목록에 없으면 첫 번째 모델로 자동 전환한다. */
  function handleToggleModelListSource(): void {
    if (aiProvider === null || !hasDynamicForCurrent) return;
    const next = !preferHardcodedList;
    const nextList = next
      ? AI_MODEL_OPTIONS[aiProvider]
      : (dynamicModels[aiProvider] as string[]);
    setPreferHardcodedList(next);
    if (!nextList.includes(aiModel) && nextList.length > 0) {
      setSettings({ aiModel: nextList[0] });
    }
  }

  /** ListModels API 호출 — 현재 프로바이더의 사용 가능한 모델을 가져와 dynamicModels 에 저장 */
  async function handleRefreshModels(): Promise<void> {
    if (aiProvider === null || activeApiKey.trim() === '') {
      setModelsError('API 키를 먼저 설정에서 등록해 주세요.');
      return;
    }
    setRefreshingModels(true);
    setModelsError(null);
    try {
      const provider = getAiProvider(aiProvider);
      const models = await provider.listModels(activeApiKey.trim());
      if (models.length === 0) {
        setModelsError('사용 가능한 모델이 없습니다.');
        return;
      }
      setDynamicModels((prev) => ({ ...prev, [aiProvider]: models }));
      // 새로고침 직후에는 항상 실시간 목록 모드로 복귀 (사용자가 의도적으로 가져왔으므로)
      setPreferHardcodedList(false);
      // 현재 선택 모델이 새 목록에 없으면 첫 번째 모델로 자동 전환
      if (!models.includes(aiModel)) {
        setSettings({ aiModel: models[0] });
      }
    } catch (e) {
      if (e instanceof AiApiError) {
        const base =
          e.type === 'INVALID_API_KEY'
            ? 'API 키가 유효하지 않습니다'
            : e.type === 'RATE_LIMIT'
              ? '요청 한도를 초과했습니다'
              : e.type === 'NETWORK_ERROR'
                ? '네트워크 오류'
                : '모델 목록을 가져오지 못했습니다';
        const detail = e.message && !e.message.startsWith('Invalid') ? ` — ${e.message}` : '';
        setModelsError(`${base}${detail}`);
      } else {
        setModelsError('알 수 없는 오류가 발생했습니다');
      }
    } finally {
      setRefreshingModels(false);
    }
  }

  /** 모델 목록 전체 복사 (Tauri WebView + 웹 클립보드 fallback 2-layer) */
  async function copyTextToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fallback
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      ta.setAttribute('readonly', '');
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  async function handleCopyModelList(): Promise<void> {
    if (aiProvider === null || modelOptions.length === 0) return;
    const ok = await copyTextToClipboard(modelOptions.join('\n'));
    setCopyFeedback(ok ? 'copied' : 'failed');
    setTimeout(() => setCopyFeedback('idle'), 2000);
  }

  // --- 핸들러 ---

  /** 생성 버튼 클릭 -- 파일 크기 경고 → 소스 확인 → 생성 */
  async function handleGenerate(): Promise<void> {
    if (inputMode === 'upload' && !uploadedFile) return;

    const variant = decideWarningVariant(fileSize);
    if (variant !== null) {
      setPendingWarning(variant);
      return;
    }
    await proceedAfterWarning();
  }

  /** 파일 크기 경고 확인 후 → 소스 코드 확인 모달 or 즉시 생성 */
  async function proceedAfterWarning(): Promise<void> {
    setPendingWarning(null);

    // 프로젝트 루트가 설정된 경우 소스 파일 확인 모달 표시
    if (projectRoot) {
      setSourceConfirmLoading(true);
      setSourceConfirmFiles([]);
      setSourceConfirmOpen(true);
      try {
        const { previewSourceFiles } = await import('../../services/ai/sourceCodeResolver');
        // 스택트레이스 추출 (dataBuilder 와 동일 로직)
        const { entries } = useLogStore.getState();
        const errorEntries = entries
          .filter((e) => e.level === 'ERROR' || e.level === 'FATAL')
          .slice(0, 5);
        const traces = errorEntries
          .filter((e) => e.stacktrace.length > 0)
          .map((e) => ({
            level: e.level,
            timestamp: e.timestamp,
            logger: e.logger,
            message: e.message,
            exceptionClass: e.exceptionClass ?? '',
            frames: e.stacktrace.map(
              (f) => `at ${f.className}.${f.methodName}(${f.fileName}:${f.lineNumber})`,
            ),
          }));
        const files = await previewSourceFiles(traces, projectRoot);
        setSourceConfirmFiles(files);
      } catch {
        setSourceConfirmFiles([]);
      } finally {
        setSourceConfirmLoading(false);
      }
      return;
    }

    await runGeneration();
  }

  /** 실제 AI 리포트 생성 로직 (경고 확인 후 또는 경고 없을 때 호출) */
  async function runGeneration(): Promise<void> {
    setPendingWarning(null);
    abortRef.current = new AbortController();
    const store = useExportStore.getState();
    store.resetGeneration();
    // resetGeneration 내부에서 streamingBuffer도 초기화되지만 명시적으로 한 번 더 호출
    store.resetStreamingBuffer();
    // 생성 시작 시 이전 메타 리셋
    setLastTokensUsed(null);
    setLastEstimatedCostUsd(null);
    setLastProvider(null);
    setLastModel(null);
    setLastSource('fresh');

    // 호출 시점의 프로바이더/모델을 캡처 (완료 화면이 "실제 사용 값" 을 보장)
    const usedProvider = aiProvider;
    const usedModel = aiModel;

    try {
      const result = await generateAiReport(
        () => abortRef.current?.signal.aborted ?? false,
        abortRef.current.signal,
      );
      // 생성 완료 시 메타 기록 (done 상태 UI 에 표시됨)
      const estimatedCost = estimateOutputCostUsd(usedProvider, usedModel, result.tokensUsed);
      setLastTokensUsed(result.tokensUsed);
      setLastEstimatedCostUsd(estimatedCost);
      setLastProvider(usedProvider);
      setLastModel(usedModel);

      // Step 4: 히스토리 자동 저장 (fire-and-forget)
      // - usedProvider 가 null 이면 저장 의미 없음 → 스킵
      // - 히스토리 복원 모드(isFromHistory=true) 에서는 재저장 방지
      if (usedProvider !== null && !useExportStore.getState().isFromHistory) {
        const entry: AiReportHistoryEntry = {
          id: crypto.randomUUID(),
          generatedAt: new Date().toISOString(),
          sourceFileName: useLogStore.getState().fileName ?? '(unknown)',
          sourceFileSize: useLogStore.getState().fileSize ?? 0,
          presetType: useExportStore.getState().presetType,
          inputMode: useExportStore.getState().inputMode,
          uploadedFileName: useExportStore.getState().uploadedFile?.name ?? null,
          outputLanguage: useExportStore.getState().outputLanguage,
          outputFormat: useExportStore.getState().outputFormat,
          provider: usedProvider,
          model: usedModel,
          tokensUsed: result.tokensUsed,
          estimatedCostUsd: estimatedCost,
          markdown: result.content,
        };
        void addAiReportHistory(entry).catch((e) => {
          console.warn('[AiReportTab] 히스토리 자동 저장 실패:', e);
        });
      }
    } catch (e) {
      if (e instanceof AiApiError) {
        if (e.type === 'ABORTED') return; // 취소 시 조용히 복귀
        // AI_ERROR_MESSAGES는 ko/en 2차원이므로 언어 키로 접근
        const baseMsg = AI_ERROR_MESSAGES[e.type][outputLanguage];
        // provider 가 throw 한 원본 상세 메시지를 " — " 구분자로 첨부
        // AiGenerationStatus 가 이 구분자로 "기본 메시지" 와 "상세 정보" 를 분리해서 표시한다.
        const detail = e.message && e.message !== baseMsg ? ` — ${e.message}` : '';
        useExportStore.getState().setGenerationError(`${baseMsg}${detail}`);
        useExportStore.getState().setGenerationStatus('error');
      } else {
        const detail = e instanceof Error && e.message ? ` — ${e.message}` : '';
        useExportStore
          .getState()
          .setGenerationError(
            (outputLanguage === 'ko'
              ? '알 수 없는 오류가 발생했습니다.'
              : 'An unknown error has occurred.') + detail,
          );
        useExportStore.getState().setGenerationStatus('error');
      }
    }
  }

  function handleCancel(): void {
    abortRef.current?.abort();
    useExportStore.getState().resetGeneration();
  }

  function handleRetry(): void {
    useExportStore.getState().resetGeneration();
    void handleGenerate();
  }

  function handleReset(): void {
    useExportStore.getState().resetGeneration();
  }

  /** Step 4: 히스토리 항목 복원 — done 상태로 점프해서 재다운로드 가능하게 한다.
   *  - markdown 을 generatedContent 로 주입
   *  - outputFormat 이 docx 면 즉시 Blob 재생성 (fire-and-forget 가 아닌 비동기 대기)
   *  - 메타 라인(프로바이더/모델/토큰/비용) 복원
   *
   *  주의: isFromHistory 플래그는 "분석 로그 자체가 요약 fallback 모드" 를 뜻하며
   *  ExportView 상단 경고 배너와 연결되어 있다. AI 리포트 히스토리 복원과는 다른
   *  의미이므로 여기서는 건드리지 않는다. (재저장 방지는 runGeneration 경로를
   *  아예 거치지 않는 구조로 이미 보장되어 있음) */
  async function handleRestoreHistory(entry: AiReportHistoryEntry): Promise<void> {
    const store = useExportStore.getState();
    // 생성 옵션 복원 (파일명 빌드에 필요)
    store.setPresetType(entry.presetType);
    store.setInputMode(entry.inputMode);
    store.setOutputLanguage(entry.outputLanguage);
    store.setOutputFormat(entry.outputFormat);
    // 업로드 모드였다면 파일은 복원 불가(바이너리 없음) — 프리셋 모드로 취급
    if (entry.inputMode === 'upload') {
      store.setInputMode('preset');
    }
    store.setUploadedFile(null);

    // 콘텐츠 주입
    store.setGeneratedContent(entry.markdown);
    store.setGeneratedBlob(null);
    store.setGenerationError(null);

    // 메타 라인용 로컬 state — 복원 소스 마킹 포함
    setLastTokensUsed(entry.tokensUsed);
    setLastEstimatedCostUsd(entry.estimatedCostUsd);
    setLastProvider(entry.provider);
    setLastModel(entry.model);
    setLastSource('restored');

    // docx 였다면 즉시 Blob 재생성 — 사용자가 바로 다운로드 버튼을 눌렀을 때 대비
    if (entry.outputFormat === 'docx') {
      try {
        const blob = await markdownToDocx(entry.markdown, entry.sourceFileName);
        useExportStore.getState().setGeneratedBlob(blob);
      } catch (e) {
        console.warn('[AiReportTab] 히스토리 docx 재생성 실패:', e);
      }
    }

    // done 상태로 점프 (Blob 재생성이 먼저 완료되도록 마지막에 전이)
    useExportStore.getState().setGenerationStatus('done');
  }

  async function handleDeleteHistory(id: string): Promise<void> {
    try {
      await removeAiReportHistory(id);
    } catch (e) {
      console.warn('[AiReportTab] 히스토리 삭제 실패:', e);
    }
  }

  async function handleClearHistory(): Promise<void> {
    try {
      await clearAiReportHistory();
      setConfirmClearHistory(false);
    } catch (e) {
      console.warn('[AiReportTab] 히스토리 전체 삭제 실패:', e);
    }
  }

  /** "2분 전" 형태의 상대 시간 표시 */
  function formatRelativeTime(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return '방금';
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return '방금';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}시간 전`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}일 전`;
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  async function handleDownload(format: 'pdf' | 'docx'): Promise<void> {
    // 프리셋(또는 업로드 파일명) + 날짜 + 프로바이더 조합으로 저장 파일명 생성
    const fileNameBase = buildAiReportFileName({
      inputMode,
      presetType,
      uploadedFileName: uploadedFile?.name ?? null,
      language: outputLanguage,
      provider: aiProvider,
    });

    if (import.meta.env.DEV) {
      console.log('[AiReportTab] handleDownload', {
        format,
        contentLength: generatedContent?.length ?? 0,
        fileNameBase,
      });
    }
    if (format === 'pdf') {
      // PrintableAiReport를 Portal로 일시 마운트 후 window.print() 호출
      // Tauri WebKit 에서 rAF 만으로는 Portal DOM 반영 + layout 확정 전에 print() 가
      // snapshot 을 찍어서 빈 페이지가 나오는 사례가 있음.
      // → setTimeout(300) 으로 여유 확보 + afterprint 이벤트로 cleanup (일회성)
      setShowPrintable(true);

      // macOS: ProjectRootPicker 에서 변경된 OS 저장 다이얼로그 디렉토리를
      // 다운로드 폴더로 리셋 (print → "PDF로 저장" 시 다운로드 폴더에서 열리도록)
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('reset_save_directory');
      } catch { /* non-critical */ }

      // 브라우저/Chromium/WebKit 인쇄 다이얼로그는 document.title 을 기본 저장 파일명으로 사용
      // 따라서 print() 호출 직전에 document.title 을 프리셋+날짜 파일명으로 교체하고
      // afterprint 시 원복.
      const originalDocTitle = document.title;
      document.title = fileNameBase;

      // afterprint 이벤트로 언마운트 + 원본 타이틀 복원
      const handleAfterPrint = () => {
        setShowPrintable(false);
        document.title = originalDocTitle;
        window.removeEventListener('afterprint', handleAfterPrint);
      };
      window.addEventListener('afterprint', handleAfterPrint);

      // DOM 반영 + layout 확정까지 충분한 지연
      setTimeout(() => {
        if (import.meta.env.DEV) {
          // print 직전 DOM 상태 확인 (빈 페이지 원인 규명)
          const wrapper = document.querySelector('.printable-report-wrapper');
          console.log('[AiReportTab] about to print', {
            wrapperExists: wrapper !== null,
            wrapperHtmlLength: wrapper?.innerHTML.length ?? 0,
            wrapperTextPreview: wrapper?.textContent?.slice(0, 100) ?? '(none)',
            documentTitle: document.title,
          });
        }
        try {
          window.print();
        } catch (e) {
          console.warn('[AiReportTab] window.print() 호출 실패:', e);
          setShowPrintable(false);
          document.title = originalDocTitle;
          window.removeEventListener('afterprint', handleAfterPrint);
        }
      }, 300);
    } else {
      // Word 파일 저장 -- tauri-plugin-dialog + tauri-plugin-fs
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { writeFile } = await import('@tauri-apps/plugin-fs');
        const blob = useExportStore.getState().generatedBlob;

        const path = await save({
          defaultPath: `${fileNameBase}.docx`,
          filters: [{ name: 'Word', extensions: ['docx'] }],
        });

        if (path && blob) {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          await writeFile(path, bytes);
        }
      } catch (e) {
        console.warn('[AiReportTab] Word 파일 저장 실패:', e);
      }
    }
  }

  // --- 등록된 키 0개: 완전 미설정 상태 ---
  if (!hasAnyKey) {
    return (
      <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-xl p-6 text-center">
        <Sparkles className="w-8 h-8 text-[var(--color-text-disabled)] mx-auto mb-3" />
        <p className="text-sm font-medium text-[var(--color-text-secondary)]">
          AI 리포트를 사용하려면
          <br />
          API 키를 먼저 등록해 주세요
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
          설정 &gt; AI 설정에서 프로바이더와
          <br />
          API 키(또는 로컬 LLM)를 등록하면
          <br />
          AI 기반 보고서를 자동 생성할 수 있습니다.
        </p>
        <button
          onClick={() => openSettingsModal('ai')}
          className="mt-4 px-4 py-2 text-sm rounded-lg border border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] transition-colors inline-flex items-center gap-2"
        >
          <Settings className="w-4 h-4" />
          AI 설정
        </button>
      </div>
    );
  }

  // --- 생성 중 / 완료 / 에러 상태 ---
  if (generationStatus !== 'idle') {
    return (
      <>
        <AiGenerationStatus
          status={generationStatus}
          error={generationError}
          outputFormat={outputFormat}
          hasSourceAnalysis={projectRoot !== null}
          outputLanguage={outputLanguage}
          onRetry={handleRetry}
          onCancel={handleCancel}
          onDownload={handleDownload}
          onReset={handleReset}
          tokensUsed={lastTokensUsed}
          estimatedCostUsd={lastEstimatedCostUsd}
          providerLabel={lastProvider !== null ? AI_PROVIDER_LABELS[lastProvider] : null}
          modelName={lastModel}
          source={lastSource}
        />

        {/* PDF 다운로드 시 일시 마운트되는 인쇄 전용 Portal
            title: 프리셋 이름 + 날짜 + 프로바이더 조합 (문서 내부 표시용) — 저장 파일명과 일관 */}
        {showPrintable && generatedContent &&
          createPortal(
            <PrintableAiReport
              title={buildAiReportFileName({
                inputMode,
                presetType,
                uploadedFileName: uploadedFile?.name ?? null,
                language: outputLanguage,
                provider: aiProvider,
              })}
              markdown={generatedContent}
              fileName={fileName ?? ''}
              generatedAt={new Date().toISOString()}
            />,
            document.body,
          )}
      </>
    );
  }

  // --- idle 상태: 프리셋 선택 + 출력 형식 + 생성 버튼 ---
  return (
    <div className="space-y-5">
      {/* Step 5: 생성 모드 토글 (단일 / 비교) */}
      <div className="flex items-center gap-1 bg-[var(--color-bg-base)] border border-[var(--color-border-default)] rounded-lg p-0.5">
        <button
          type="button"
          onClick={() => setGenerationMode('single')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            generationMode === 'single'
              ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] shadow-sm'
              : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
          }`}
        >
          단일 생성
        </button>
        <button
          type="button"
          onClick={() => setGenerationMode('comparison')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            generationMode === 'comparison'
              ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] shadow-sm'
              : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
          }`}
        >
          비교 생성
        </button>
      </div>

      {/* 비교 모드: MultiAiComparison 으로 전환 — 나머지 idle UI 를 건너뜀 */}
      {generationMode === 'comparison' && (
        <MultiAiComparison />
      )}

      {/* 단일 모드: 기존 idle UI */}
      {generationMode === 'comparison' ? null : (
      <>

      {/* 프리셋 선택 (양식 업로드 제거 — 프리셋만 표시) */}
      <div>
        <label className="block text-xs text-[var(--color-text-tertiary)] mb-1.5">
          리포트 유형
        </label>
        <div className="space-y-2">
          {PRESETS.map((preset) => (
            <label
              key={preset.type}
              className={`block rounded-lg px-4 py-3 cursor-pointer border transition-colors ${
                presetType === preset.type
                  ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary-subtle-bg)]/20'
                  : 'border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)]'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="presetType"
                  value={preset.type}
                  checked={presetType === preset.type}
                  onChange={() => setPresetType(preset.type)}
                  className="accent-blue-500"
                />
                <span className="text-sm text-[var(--color-text-primary)]">{preset.label}</span>
              </div>
              <p className="text-xs text-[var(--color-text-disabled)] mt-0.5 pl-6">
                {preset.description}
              </p>
            </label>
          ))}
        </div>
      </div>

      {/* 출력 언어 라디오 (8차 신규) */}
      <div>
        <label className="block text-xs text-[var(--color-text-tertiary)] mb-1.5">
          출력 언어
        </label>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="outputLanguage"
              value="ko"
              checked={outputLanguage === 'ko'}
              onChange={() => setOutputLanguage('ko')}
              className="accent-blue-500"
            />
            <span className="text-sm text-[var(--color-text-secondary)]">한국어</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="outputLanguage"
              value="en"
              checked={outputLanguage === 'en'}
              onChange={() => setOutputLanguage('en')}
              className="accent-blue-500"
            />
            <span className="text-sm text-[var(--color-text-secondary)]">English</span>
          </label>
        </div>
      </div>

      {/* 출력 형식 — PDF 고정 */}
      <div>
        <label className="block text-xs text-[var(--color-text-tertiary)] mb-1.5">
          출력 형식
        </label>
        <span className="text-sm text-[var(--color-text-secondary)]">PDF</span>
      </div>

      {/* 프로젝트 루트 선택 (8차 신규)
          QA 재작업: isFromHistory=true일 때 disabled -- dataBuilder가 히스토리
          복원 모드에서는 sourceCode를 제외하므로 사용자 기대와 일치시킴 */}
      <div>
        <label className="block text-xs text-[var(--color-text-tertiary)] mb-1.5">
          프로젝트 루트 (선택)
        </label>
        <ProjectRootPicker
          projectRoot={projectRoot}
          onChange={setProjectRoot}
          disabled={isFromHistory}
        />
        {isFromHistory ? (
          <p className="text-xs text-[var(--color-status-warn-fg)] mt-1.5">
            히스토리 복원 모드에서는 소스 코드 분석이 지원되지 않습니다.
          </p>
        ) : (
          <p className="text-xs text-[var(--color-text-disabled)] mt-1.5">
            폴더를 선택하면 스택트레이스 관련 소스 코드를 AI에 함께 전달하여 분석 품질을 높입니다.
          </p>
        )}

        {/* 프로젝트 루트 보안 메시지 — 프로바이더 유형에 따라 동적 변경 */}
        {projectRoot && aiProvider !== null && !isLocalProvider(aiProvider) && (
          <div className="mt-2 flex items-start gap-2 text-xs rounded-lg px-3 py-2 bg-[var(--color-status-warn-bg)]">
            <span className="flex-shrink-0 mt-0.5">&#x26A0;&#xFE0F;</span>
            <span className="text-[var(--color-status-warn-fg)] leading-relaxed">
              선택한 폴더의 Java/Kotlin 소스 파일이 AI 서버로 전송됩니다.
              <br />
              민감 정보가 포함되지 않았는지 확인해 주세요.
            </span>
          </div>
        )}
        {projectRoot && isLocalProvider(aiProvider) && (
          <div className="mt-2 flex items-start gap-2 text-xs rounded-lg px-3 py-2 bg-[var(--color-status-success-bg)]">
            <span className="flex-shrink-0 mt-0.5">&#x2705;</span>
            <span className="text-[var(--color-status-success-fg)] leading-relaxed">
              로컬 LLM을 사용 중입니다.
              <br />
              소스코드가 외부로 전송되지 않으며 모든 분석이 이 기기에서만 처리됩니다.
            </span>
          </div>
        )}
      </div>

      {/* AI 프로바이더 선택 (idle 상태에서 즉시 전환 가능)
          키가 등록된 프로바이더만 정상 사용 가능 — 미등록 프로바이더를 선택하면 경고 배너 표시 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs text-[var(--color-text-tertiary)]">
            AI 프로바이더
          </label>
          <button
            type="button"
            onClick={() => openSettingsModal('ai')}
            className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] inline-flex items-center gap-1 transition-colors"
          >
            <Settings className="w-3 h-3" />
            설정에서 관리
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {AI_PROVIDERS.map((p) => {
            const isLocal = isLocalProvider(p);
            const hasKey = isLocal ? localLlmModel.trim() !== '' : (aiApiKeys[p] ?? '') !== '';
            const isSelected = aiProvider === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => handleProviderSelect(p)}
                className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors text-left ${
                  isSelected
                    ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary-subtle-bg)]/20 text-[var(--color-text-primary)]'
                    : 'border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                }`}
                aria-pressed={isSelected}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{isLocal ? '🖥 로컬' : AI_PROVIDER_LABELS[p]}</span>
                  {hasKey ? (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-status-success-bg)] text-[var(--color-status-success-fg)] font-semibold">
                      {isLocal ? 'ON' : 'KEY'}
                    </span>
                  ) : (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-bg-surface)] text-[var(--color-text-disabled)] font-semibold">
                      N/A
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* 로컬 LLM 선택 시 모델/엔드포인트 정보 표시 */}
        {isLocalProvider(aiProvider) && isAiConfigured && (
          <div className="mt-2 bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-secondary)]">
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-text-tertiary)]">모델명:</span>
              <span className="font-mono">{localLlmModel}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[var(--color-text-tertiary)]">엔드포인트:</span>
              <span className="font-mono text-[11px]">{localLlmEndpoint}</span>
            </div>
          </div>
        )}

        {/* 선택된 프로바이더가 미설정일 때 경고 */}
        {aiProvider !== null && !isAiConfigured && (
          <div className="mt-2 flex items-start gap-2 bg-[var(--color-status-warn-bg)] dark:bg-[var(--color-status-warn-bg)] border border-[var(--color-status-warn-border)] border-[var(--color-status-warn-border)] text-[var(--color-status-warn-fg)] text-xs rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              {isLocalProvider(aiProvider)
                ? '로컬 LLM 모델명이 설정되지 않았습니다. 설정에서 모델명을 입력하세요.'
                : `${AI_PROVIDER_LABELS[aiProvider]} API 키가 등록되지 않았습니다. 설정에서 키를 등록하거나 다른 프로바이더를 선택하세요.`}
            </span>
          </div>
        )}
      </div>

      {/* 모델 선택 + ListModels 새로고침 (설정 모달에서 이관) — 프로바이더 선택 바로 아래
          로컬 LLM 은 설정에서 모델명을 직접 입력하므로 드롭다운 생략 */}
      {aiProvider !== null && isAiConfigured && !isLocalProvider(aiProvider) && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs text-[var(--color-text-tertiary)]">
              모델
              {hasDynamicForCurrent && (
                <span
                  className={`ml-1.5 text-[10px] ${
                    isDynamicModelList ? 'text-[var(--color-status-success-fg)]' : 'text-[var(--color-text-tertiary)]'
                  }`}
                >
                  • {isDynamicModelList ? '실시간 목록' : '기본 목록'} ({modelOptions.length}개)
                </span>
              )}
            </label>
            <div className="flex items-center gap-2">
              {/* 실시간 ↔ 기본 토글: dynamic 이 한 번이라도 fetch 된 경우만 노출 */}
              {hasDynamicForCurrent && (
                <button
                  type="button"
                  onClick={handleToggleModelListSource}
                  disabled={refreshingModels}
                  title={
                    preferHardcodedList
                      ? 'API 로 가져온 실시간 모델 목록으로 전환'
                      : '하드코딩된 기본 모델 목록으로 전환'
                  }
                  className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none rounded px-1.5 py-0.5 border border-[var(--color-border-default)]"
                  aria-pressed={!preferHardcodedList}
                >
                  {preferHardcodedList ? '실시간 보기' : '기본 보기'}
                </button>
              )}
              <button
                type="button"
                onClick={handleRefreshModels}
                disabled={refreshingModels}
                title="해당 프로바이더의 실제 사용 가능한 모델 목록을 API 로 가져옵니다"
                className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none rounded px-1.5 py-0.5"
              >
                <RefreshCw className={`w-3 h-3 ${refreshingModels ? 'animate-spin' : ''}`} />
                {refreshingModels ? '불러오는 중...' : '모델 목록 새로고침'}
              </button>
            </div>
          </div>
          <select
            value={aiModel}
            onChange={(e) => handleModelSelect(e.target.value)}
            disabled={refreshingModels}
            className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
          >
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            {/* 저장값이 옵션에 없으면 한시적으로 직접 표시 */}
            {aiModel && !modelOptions.includes(aiModel) && (
              <option key={aiModel} value={aiModel}>
                {aiModel}
              </option>
            )}
          </select>

          {/* 새로고침 에러 메시지 */}
          {modelsError && (
            <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-[var(--color-status-error-fg)]">
              <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span className="break-all">{modelsError}</span>
            </div>
          )}
          {/* 안내 문구
              - dynamic 미페치: 새로고침 안내
              - dynamic 페치 후 hardcoded 모드: 토글 안내 */}
          {!modelsError && !hasDynamicForCurrent && (
            <p className="text-[11px] text-[var(--color-text-disabled)] mt-1.5">
              기본 목록을 표시 중입니다. 새로고침하면 API 키로 직접 조회한 실제 사용 가능한 모델 목록이 나타납니다.
            </p>
          )}
          {!modelsError && hasDynamicForCurrent && preferHardcodedList && (
            <p className="text-[11px] text-[var(--color-text-disabled)] mt-1.5">
              하드코딩된 기본 목록을 보고 있습니다. "실시간 보기" 로 전환하면 직전에 가져온 실시간 목록으로 돌아갑니다.
            </p>
          )}

          {/* 전체 목록 펼쳐보기 + 클립보드 복사 (dynamic 목록 있을 때만 표시) */}
          {isDynamicModelList && modelOptions.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowFullModelList((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none rounded px-1.5 py-0.5"
              >
                {showFullModelList ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    전체 목록 접기
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    전체 목록 펼쳐보기 ({modelOptions.length}개)
                  </>
                )}
              </button>

              {showFullModelList && (
                <div className="mt-1.5 bg-[var(--color-bg-base)] border border-[var(--color-border-default)] rounded-md p-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-[var(--color-text-disabled)] font-mono">
                      {AI_PROVIDER_LABELS[aiProvider]} · {modelOptions.length} models
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyModelList}
                      title="전체 목록을 클립보드로 복사"
                      className="inline-flex items-center gap-1 text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none rounded px-1.5 py-0.5"
                    >
                      {copyFeedback === 'copied' ? (
                        <>
                          <Check className="w-3 h-3 text-[var(--color-status-success-fg)]" />
                          복사됨
                        </>
                      ) : copyFeedback === 'failed' ? (
                        <>
                          <AlertCircle className="w-3 h-3 text-[var(--color-status-error-fg)]" />
                          복사 실패
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          복사
                        </>
                      )}
                    </button>
                  </div>
                  <pre
                    className="text-[11px] font-mono text-[var(--color-text-secondary)] whitespace-pre max-h-64 overflow-auto select-text"
                    style={{ userSelect: 'text' }}
                  >
                    {modelOptions.join('\n')}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 리포트 생성 버튼 */}
      {(() => {
        const canSubmit = !isGenerating(generationStatus) && isAiConfigured;
        return (
          <button
            onClick={handleGenerate}
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
            className="w-full py-2.5 text-sm font-medium bg-[var(--color-status-success-fg)] hover:bg-[var(--color-status-success-fg)] text-white rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-status-success-fg)]"
          >
            <Sparkles className="w-4 h-4" />
            리포트 생성
          </button>
        );
      })()}

      {/* Step 4: 최근 생성된 AI 리포트 (히스토리) — 재다운로드 전용
          - 재생성 없이 markdown 을 done 화면으로 복원해 즉시 다시 다운로드 가능
          - 기본 3개 노출 + 전체 보기 토글 */}
      {aiReportHistoryEntries.filter(isSingleEntry).length > 0 && (
        <div className="pt-2 border-t border-[var(--color-border-default)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
              <History className="w-3.5 h-3.5" />
              <span>
                최근 생성된 리포트 ({aiReportHistoryEntries.filter(isSingleEntry).length})
              </span>
            </div>
            {confirmClearHistory ? (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-[var(--color-text-tertiary)]">모두 삭제할까요?</span>
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="text-[var(--color-status-error-fg)] hover:text-[var(--color-status-error-fg)] underline"
                >
                  예
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearHistory(false)}
                  className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] underline"
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearHistory(true)}
                className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-status-error-fg)] transition-colors"
              >
                전체 삭제
              </button>
            )}
          </div>

          <ul className="space-y-1.5">
            {(() => {
              const singleEntries = aiReportHistoryEntries.filter(isSingleEntry);
              return showAllHistory ? singleEntries : singleEntries.slice(0, 3);
            })().map(
              (e) => {
                const presetLabel =
                  PRESETS.find((p) => p.type === e.presetType)?.label ?? e.presetType;
                const metaBits: string[] = [
                  AI_PROVIDER_LABELS[e.provider],
                  e.model,
                ];
                if (typeof e.tokensUsed === 'number') {
                  metaBits.push(`${e.tokensUsed.toLocaleString()} 토큰`);
                }
                if (typeof e.estimatedCostUsd === 'number') {
                  metaBits.push(`~$${e.estimatedCostUsd.toFixed(4)}`);
                }
                return (
                  <li
                    key={e.id}
                    className="group flex items-start gap-2 bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 hover:bg-[var(--color-bg-hover)] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => void handleRestoreHistory(e)}
                      className="flex-1 min-w-0 text-left focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none rounded"
                      title="클릭하면 해당 리포트를 복원해 다시 다운로드할 수 있습니다"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[var(--color-text-primary)] truncate">
                          {presetLabel}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--color-bg-surface)] text-[var(--color-text-tertiary)]">
                          {e.outputFormat}
                        </span>
                        <span className="text-[10px] text-[var(--color-text-disabled)]">
                          {formatRelativeTime(e.generatedAt)}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-tertiary)] truncate mt-0.5">
                        {e.sourceFileName}
                      </p>
                      <p className="text-[11px] text-[var(--color-text-secondary)] truncate mt-1 flex items-center flex-wrap gap-x-1.5 gap-y-0.5">
                        {metaBits.map((bit, i) => (
                          <span key={i} className="inline-flex items-center">
                            {i > 0 && (
                              <span className="mr-1.5 text-[var(--color-text-disabled)]">·</span>
                            )}
                            {bit}
                          </span>
                        ))}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteHistory(e.id)}
                      title="이 항목 삭제"
                      className="flex-shrink-0 p-1.5 rounded text-[var(--color-text-disabled)] hover:text-[var(--color-status-error-fg)] hover:bg-[var(--color-status-error-bg)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-status-error-border)] focus-visible:outline-none"
                      aria-label="히스토리 항목 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              },
            )}
          </ul>

          {aiReportHistoryEntries.filter(isSingleEntry).length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllHistory((v) => !v)}
              className="mt-2 text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] inline-flex items-center gap-1 transition-colors"
            >
              {showAllHistory ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  접기
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  {aiReportHistoryEntries.filter(isSingleEntry).length - 3}개 더 보기
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* 파일 크기 경고 다이얼로그 */}
      <FileSizeWarningDialog
        open={pendingWarning !== null}
        variant={pendingWarning ?? 'small'}
        fileName={fileName ?? ''}
        fileSize={fileSize}
        onContinue={proceedAfterWarning}
        onCancel={() => setPendingWarning(null)}
      />

      {/* 소스 코드 전송 확인 다이얼로그 */}
      <SourceFileConfirmDialog
        open={sourceConfirmOpen}
        files={sourceConfirmFiles}
        loading={sourceConfirmLoading}
        provider={aiProvider}
        onConfirm={() => {
          setSourceConfirmOpen(false);
          void runGeneration();
        }}
        onCancel={() => setSourceConfirmOpen(false)}
      />

      {/* 단일 모드 Fragment 닫기 (generationMode === 'single' 분기) */}
      </>
      )}
    </div>
  );
}
