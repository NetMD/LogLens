// Tauri store(ai-report-history.json) <-> aiReportHistoryStore 브릿지 훅
// useHistory.ts 와 동일한 패턴. FIFO 상한 상수는 AI_REPORT_HISTORY_MAX 고정.

import { Store } from '@tauri-apps/plugin-store';
import { useAiReportHistoryStore } from '../store/aiReportHistoryStore';
import {
  AI_REPORT_HISTORY_MAX,
  validateAiReportHistoryEntry,
} from '../types/aiReportHistory';
import type { AiReportHistoryEntry } from '../types/aiReportHistory';

// 싱글턴 Store 인스턴스
let storeInstance: Store | null = null;
async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await Store.load('ai-report-history.json');
  }
  return storeInstance;
}

export function useAiReportHistory() {
  /** 앱 초기화 시 ai-report-history.json -> aiReportHistoryStore 로드 */
  async function load(): Promise<void> {
    try {
      const store = await getStore();
      const raw = await store.get<unknown[]>('entries');
      if (!Array.isArray(raw)) {
        useAiReportHistoryStore.getState().setEntries([]);
        useAiReportHistoryStore.getState().setLoaded(true);
        return;
      }
      let valid: AiReportHistoryEntry[] = [];
      for (const r of raw) {
        if (validateAiReportHistoryEntry(r)) {
          valid.push(r);
        } else {
          console.warn('[useAiReportHistory] 불완전한 항목 무시:', r);
        }
      }
      // FIFO 상한 정리
      if (valid.length > AI_REPORT_HISTORY_MAX) {
        valid = valid.slice(0, AI_REPORT_HISTORY_MAX);
        await persist(valid);
      }
      useAiReportHistoryStore.getState().setEntries(valid);
      useAiReportHistoryStore.getState().setLoaded(true);
    } catch {
      console.warn('[useAiReportHistory] ai-report-history.json 로드 실패, 빈 목록 사용');
      useAiReportHistoryStore.getState().setEntries([]);
      useAiReportHistoryStore.getState().setLoaded(true);
    }
  }

  /** 항목 추가 + FIFO 상한 + 영구 저장 */
  async function add(entry: AiReportHistoryEntry): Promise<void> {
    useAiReportHistoryStore.getState().addEntry(entry);
    let entries = useAiReportHistoryStore.getState().entries;
    if (entries.length > AI_REPORT_HISTORY_MAX) {
      entries = entries.slice(0, AI_REPORT_HISTORY_MAX);
      useAiReportHistoryStore.getState().setEntries(entries);
    }
    await persist(entries);
  }

  async function remove(id: string): Promise<void> {
    useAiReportHistoryStore.getState().removeEntry(id);
    await persist(useAiReportHistoryStore.getState().entries);
  }

  async function clear(): Promise<void> {
    useAiReportHistoryStore.getState().clearEntries();
    await persist([]);
  }

  async function persist(entries: AiReportHistoryEntry[]): Promise<void> {
    try {
      const store = await getStore();
      await store.set('entries', entries);
      await store.save();
    } catch (e) {
      console.warn('[useAiReportHistory] ai-report-history.json 저장 실패:', e);
    }
  }

  return { load, add, remove, clear };
}
