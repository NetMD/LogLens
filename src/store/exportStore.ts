// PDF/문서 내보내기 전용 상태 store
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

interface ExportState {
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

  // Actions
  setTitle: (t: string) => void;
  setSaveFileName: (n: string) => void;
  setIsFromHistory: (v: boolean) => void;
  toggleSection: (key: keyof IncludeSections) => void;
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
  // --- 8차 액션 ---
  setOutputLanguage: (l: OutputLanguage) => void;
  setProjectRoot: (p: string | null) => void;
  appendStreamingBuffer: (delta: string) => void;
  resetStreamingBuffer: () => void;
  resetGeneration: () => void;
  resetAll: () => void;
}

const initialIncludeSections: IncludeSections = {
  info: true,
  summaryCards: true,
  timeline: true,
  topErrors: true,
  stacktrace: true,
};

export const useExportStore = create<ExportState>((set) => ({
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
  // 8차 initial state
  outputLanguage: 'ko',
  projectRoot: null,
  streamingBuffer: '',
  generationStatus: 'idle',
  generationError: null,
  generatedContent: null,
  generatedBlob: null,

  setTitle: (t) => set({ title: t }),
  setSaveFileName: (n) => set({ saveFileName: n }),
  setIsFromHistory: (v) => set({ isFromHistory: v }),
  toggleSection: (key) =>
    set((s) => ({
      includeSections: { ...s.includeSections, [key]: !s.includeSections[key] },
    })),
  setStacktraceLimit: (n) => set({ stacktraceLimit: n }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setPresetType: (p) => set({ presetType: p }),
  setInputMode: (m) => set({ inputMode: m }),
  setOutputFormat: (f) => set({ outputFormat: f }),
  setUploadedFile: (f) => set({ uploadedFile: f }),
  setGenerationStatus: (s) => set({ generationStatus: s }),
  setGenerationError: (e) => set({ generationError: e }),
  setGeneratedContent: (c) => set({ generatedContent: c }),
  setGeneratedBlob: (b) => set({ generatedBlob: b }),
  // --- 8차 액션 구현 ---
  setOutputLanguage: (l) => set({ outputLanguage: l }),
  setProjectRoot: (p) => set({ projectRoot: p }),
  appendStreamingBuffer: (delta) =>
    set((s) => ({ streamingBuffer: s.streamingBuffer + delta })),
  resetStreamingBuffer: () => set({ streamingBuffer: '' }),
  resetGeneration: () =>
    set({
      generationStatus: 'idle',
      generationError: null,
      generatedContent: null,
      generatedBlob: null,
      // 8차: streamingBuffer 리셋. projectRoot/outputLanguage는 유지 (세션 내 재사용)
      streamingBuffer: '',
    }),
  resetAll: () =>
    set({
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
      // 8차: resetAll 시 projectRoot/outputLanguage도 초기화
      outputLanguage: 'ko',
      projectRoot: null,
      streamingBuffer: '',
      generationStatus: 'idle',
      generationError: null,
      generatedContent: null,
      generatedBlob: null,
    }),
}));

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
