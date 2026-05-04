// 분석 히스토리 Zustand store (비persist -- Tauri store가 영구 저장 담당)

import { create } from 'zustand';
import type { HistoryEntry } from '../types/history';

interface HistoryState {
  entries: HistoryEntry[];       // analyzedAt DESC 정렬 유지
  selectedId: string | null;     // 상세 조회 대상 (null = 목록)
  isLoaded: boolean;             // 초기 로드 완료 여부

  // 액션
  setEntries: (entries: HistoryEntry[]) => void;
  addEntry: (entry: HistoryEntry) => void;
  removeEntry: (id: string) => void;
  clearEntries: () => void;
  setSelectedId: (id: string | null) => void;
  setLoaded: (v: boolean) => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  entries: [],
  selectedId: null,
  isLoaded: false,

  setEntries: (entries) => set({ entries }),

  // 배열 앞에 추가 (최신순 유지)
  addEntry: (entry) => set((s) => ({
    entries: [entry, ...s.entries],
  })),

  // 삭제 시 selectedId가 해당 항목이면 null로 초기화
  removeEntry: (id) => set((s) => ({
    entries: s.entries.filter((e) => e.id !== id),
    selectedId: s.selectedId === id ? null : s.selectedId,
  })),

  clearEntries: () => set({ entries: [], selectedId: null }),

  setSelectedId: (id) => set({ selectedId: id }),

  setLoaded: (v) => set({ isLoaded: v }),
}));
