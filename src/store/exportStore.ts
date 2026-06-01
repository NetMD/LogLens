// PDF/문서 내보내기 전용 상태 store — R13: fileId 스코프 byFile Record (FR-16, BL-12)
// logStore를 읽기 전용으로만 참조 (변경 0건 원칙)

import { create } from 'zustand';

// 생성 상태 타입 (8차: 'analyzing-source' 추가)
export type GenerationStatus =
  | 'idle'
  | 'collecting'
  | 'analyzing-source'
  | 'calling-ai'
  | 'generating-doc'
  | 'done'
  | 'error';

// AI 리포트 프리셋 타입
export type PresetType = 'incident' | 'daily' | 'devSummary';

// 스택트레이스 건수 제한 (0 = 전체, 최대 50건)
export type StacktraceLimit = 3 | 5 | 10 | 0;

// PDF 포함 섹션 체크박스
export interface IncludeSections {
  info: boolean;
  summaryCards: boolean;
  timeline: boolean;
  topErrors: boolean;
  stacktrace: boolean;
}

// 출력 언어 (8차 신규)
export type OutputLanguage = 'ko' | 'en';

export interface ExportState {
  // 기본 PDF 옵션
  title: string;
  saveFileName: string;
  includeSections: IncludeSections;
  stacktraceLimit: StacktraceLimit;
  // 히스토리 fallback (원본 파일 없이 저장된 요약만 사용) 여부
  isFromHistory: boolean;

  // AI 리포트 옵션
  activeTab: 'basic' | 'ai';
  presetType: PresetType;
  inputMode: 'preset' | 'upload';
  outputFormat: 'pdf' | 'docx';
  uploadedFile: { name: string; size: number; arrayBuffer: ArrayBuffer } | null;

  // --- 8차 추가 필드 ---
  outputLanguage: OutputLanguage;
  projectRoot: string | null;
  streamingBuffer: string;

  // 생성 상태 (원시 상태만 -- 파생은 getter 함수)
  generationStatus: GenerationStatus;
  generationError: string | null;
  generatedContent: string | null;
  generatedBlob: Blob | null;
}

interface ExportStoreState {
  byFile: Record<string, ExportState>; // fileId 스코프
  currentFileId: string | null; // 활성 탭 (UI 표시 기준)

  // 액션 (모두 fileId 인자 — currentFileId 기본)
  setCurrentFileId: (fileId: string | null) => void;
  ensureFileState: (fileId: string) => void;
  removeFileState: (fileId: string) => void;
  setStateForFile: (fileId: string, patch: Partial<ExportState>) => void;
  resetGeneration: (fileId: string) => void;
  resetAll: (fileId: string) => void;
  toggleSection: (fileId: string, key: keyof IncludeSections) => void;
  appendStreamingBuffer: (fileId: string, delta: string) => void;

  // 레거시 호환 setter (currentFileId 위임) — 소비처 회귀 표면 최소화 (§4.4)
  setTitle: (t: string) => void;
  setSaveFileName: (n: string) => void;
  setIsFromHistory: (v: boolean) => void;
  setStacktraceLimit: (n: StacktraceLimit) => void;
  setActiveTab: (tab: 'basic' | 'ai') => void;
  setPresetType: (p: PresetType) => void;
  setInputMode: (m: 'preset' | 'upload') => void;
  setOutputFormat: (f: 'pdf' | 'docx') => void;
  setUploadedFile: (f: ExportState['uploadedFile']) => void;
  setGenerationStatus: (s: GenerationStatus) => void;
  setGenerationError: (e: string | null) => void;
  setGeneratedContent: (c: string | null) => void;
  setGeneratedBlob: (b: Blob | null) => void;
  setOutputLanguage: (l: OutputLanguage) => void;
  setProjectRoot: (p: string | null) => void;
  resetStreamingBuffer: () => void;
}

// currentFileId 위임 헬퍼
function patchCurrent(
  set: (fn: (s: ExportStoreState) => Partial<ExportStoreState>) => void,
  patch: Partial<ExportState>,
): void {
  set((s) => {
    if (!s.currentFileId) return {};
    const prev = s.byFile[s.currentFileId] ?? makeInitialExportState();
    return {
      byFile: { ...s.byFile, [s.currentFileId]: { ...prev, ...patch } },
    };
  });
}

const initialIncludeSections: IncludeSections = {
  info: true,
  summaryCards: true,
  timeline: true,
  topErrors: true,
  stacktrace: true,
};

export function makeInitialExportState(): ExportState {
  return {
    title: '',
    saveFileName: '',
    isFromHistory: false,
    includeSections: { ...initialIncludeSections },
    stacktraceLimit: 5,
    activeTab: 'basic',
    presetType: 'incident',
    inputMode: 'preset',
    outputFormat: 'pdf',
    uploadedFile: null,
    outputLanguage: 'ko',
    projectRoot: null,
    streamingBuffer: '',
    generationStatus: 'idle',
    generationError: null,
    generatedContent: null,
    generatedBlob: null,
  };
}

export const useExportStore = create<ExportStoreState>((set) => ({
  byFile: {},
  currentFileId: null,

  setCurrentFileId: (fileId) => set({ currentFileId: fileId }),

  ensureFileState: (fileId) =>
    set((s) => {
      if (s.byFile[fileId]) return s;
      return { byFile: { ...s.byFile, [fileId]: makeInitialExportState() } };
    }),

  removeFileState: (fileId) =>
    set((s) => {
      if (!s.byFile[fileId]) return s;
      const next = { ...s.byFile };
      delete next[fileId];
      return { byFile: next };
    }),

  setStateForFile: (fileId, patch) =>
    set((s) => {
      const prev = s.byFile[fileId] ?? makeInitialExportState();
      return { byFile: { ...s.byFile, [fileId]: { ...prev, ...patch } } };
    }),

  resetGeneration: (fileId) =>
    set((s) => {
      const prev = s.byFile[fileId] ?? makeInitialExportState();
      return {
        byFile: {
          ...s.byFile,
          [fileId]: {
            ...prev,
            generationStatus: 'idle',
            generationError: null,
            generatedContent: null,
            generatedBlob: null,
            streamingBuffer: '',
          },
        },
      };
    }),

  resetAll: (fileId) =>
    set((s) => ({
      byFile: { ...s.byFile, [fileId]: makeInitialExportState() },
    })),

  toggleSection: (fileId, key) =>
    set((s) => {
      const prev = s.byFile[fileId] ?? makeInitialExportState();
      return {
        byFile: {
          ...s.byFile,
          [fileId]: {
            ...prev,
            includeSections: {
              ...prev.includeSections,
              [key]: !prev.includeSections[key],
            },
          },
        },
      };
    }),

  appendStreamingBuffer: (fileId, delta) =>
    set((s) => {
      const prev = s.byFile[fileId] ?? makeInitialExportState();
      return {
        byFile: {
          ...s.byFile,
          [fileId]: { ...prev, streamingBuffer: prev.streamingBuffer + delta },
        },
      };
    }),

  // 레거시 호환 setter — currentFileId 위임
  setTitle: (t) => patchCurrent(set, { title: t }),
  setSaveFileName: (n) => patchCurrent(set, { saveFileName: n }),
  setIsFromHistory: (v) => patchCurrent(set, { isFromHistory: v }),
  setStacktraceLimit: (n) => patchCurrent(set, { stacktraceLimit: n }),
  setActiveTab: (tab) => patchCurrent(set, { activeTab: tab }),
  setPresetType: (p) => patchCurrent(set, { presetType: p }),
  setInputMode: (m) => patchCurrent(set, { inputMode: m }),
  setOutputFormat: (f) => patchCurrent(set, { outputFormat: f }),
  setUploadedFile: (f) => patchCurrent(set, { uploadedFile: f }),
  setGenerationStatus: (st) => patchCurrent(set, { generationStatus: st }),
  setGenerationError: (e) => patchCurrent(set, { generationError: e }),
  setGeneratedContent: (c) => patchCurrent(set, { generatedContent: c }),
  setGeneratedBlob: (b) => patchCurrent(set, { generatedBlob: b }),
  setOutputLanguage: (l) => patchCurrent(set, { outputLanguage: l }),
  setProjectRoot: (p) => patchCurrent(set, { projectRoot: p }),
  resetStreamingBuffer: () => patchCurrent(set, { streamingBuffer: '' }),
}));

// --- 호환 셀렉터/액션 계층 (활성 탭 currentFileId 기준, §4.4) ---
// 큐레이터 #1: 단일 필드 selector 유지. byFile[currentFileId]?.X 를 단일 selector 로 읽는다.

const EMPTY_EXPORT = makeInitialExportState();

/** 활성 탭의 ExportState 단일 필드를 읽는 셀렉터 (없으면 기본값) */
export function useActiveExportField<K extends keyof ExportState>(
  key: K,
): ExportState[K] {
  return useExportStore((s) => {
    const fid = s.currentFileId;
    return fid ? s.byFile[fid]?.[key] ?? EMPTY_EXPORT[key] : EMPTY_EXPORT[key];
  });
}

/** 활성 탭에 patch 적용 (currentFileId 없으면 no-op) */
export function patchActiveExport(patch: Partial<ExportState>): void {
  const { currentFileId, setStateForFile } = useExportStore.getState();
  if (!currentFileId) return;
  setStateForFile(currentFileId, patch);
}

/** 활성 탭의 ExportState 즉시 조회 (액션 내부용) */
export function getActiveExport(): ExportState {
  const { currentFileId, byFile } = useExportStore.getState();
  return (currentFileId ? byFile[currentFileId] : undefined) ?? EMPTY_EXPORT;
}

// --- 파생 상태 (순수 함수) ---

/** 생성 진행 중 여부 (analyzing-source 포함) */
export function isGenerating(status: GenerationStatus): boolean {
  return (
    status === 'collecting' ||
    status === 'analyzing-source' ||
    status === 'calling-ai' ||
    status === 'generating-doc'
  );
}

/** 생성 시작 가능 여부 */
export function canGenerate(status: GenerationStatus): boolean {
  return status === 'idle' || status === 'done' || status === 'error';
}

/** 진행률 퍼센트 */
export function progressPercent(status: GenerationStatus): number {
  switch (status) {
    case 'collecting': return 20;
    case 'analyzing-source': return 40;
    case 'calling-ai': return 70;
    case 'generating-doc': return 90;
    case 'done': return 100;
    default: return 0;
  }
}

/** 진행 메시지 (ko 기본, en은 reportGenerator/UI 레이어에서 국제화) */
export function progressMessage(status: GenerationStatus): string {
  switch (status) {
    case 'collecting': return '분석 데이터 수집 중...';
    case 'analyzing-source': return '소스 코드 분석 중...';
    case 'calling-ai': return 'AI 분석 중...';
    case 'generating-doc': return '문서 생성 중...';
    default: return '';
  }
}
