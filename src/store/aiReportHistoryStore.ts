// AI 리포트 히스토리 Zustand store (비persist — Tauri store 가 영구 저장 담당)
// historyStore.ts 와 동일한 구조: 실제 파일 I/O 는 useAiReportHistory 훅이 수행한다.

import { create } from 'zustand';
import type { AiReportHistoryEntry } from '../types/aiReportHistory';

interface AiReportHistoryState {
  entries: AiReportHistoryEntry[];   // generatedAt DESC 정렬 유지
  isLoaded: boolean;                 // 초기 로드 완료 여부

  setEntries: (entries: AiReportHistoryEntry[]) => void;
  addEntry: (entry: AiReportHistoryEntry) => void;
  removeEntry: (id: string) => void;
  clearEntries: () => void;
  setLoaded: (v: boolean) => void;
}

export const useAiReportHistoryStore = create<AiReportHistoryState>((set) => ({
  entries: [],
  isLoaded: false,

  setEntries: (entries) => set({ entries }),

  // 최신순 유지: 앞에 추가
  addEntry: (entry) => set((s) => ({
    entries: [entry, ...s.entries],
  })),

  removeEntry: (id) => set((s) => ({
    entries: s.entries.filter((e) => e.id !== id),
  })),

  clearEntries: () => set({ entries: [] }),

  setLoaded: (v) => set({ isLoaded: v }),
}));
