// Tauri store(history.json) <-> historyStore 브릿지 훅

import { Store } from '@tauri-apps/plugin-store';
import { useHistoryStore } from '../store/historyStore';
import { useSettingsStore } from '../store/settingsStore';
import { validateHistoryEntry } from '../types/history';
import type { HistoryEntry } from '../types/history';

// 싱글턴 Store 인스턴스 (모듈 레벨 캐싱)
let historyStoreInstance: Store | null = null;
async function getStore(): Promise<Store> {
  if (!historyStoreInstance) {
    historyStoreInstance = await Store.load('history.json');
  }
  return historyStoreInstance;
}

export function useHistory() {
  /**
   * 앱 초기화 시 history.json -> historyStore 로드
   * 호출 위치: App.tsx useEffect (loadSettings와 병렬)
   */
  async function load(): Promise<void> {
    try {
      const store = await getStore();
      const rawEntries = await store.get<unknown[]>('entries');
      if (!Array.isArray(rawEntries)) {
        useHistoryStore.getState().setEntries([]);
        useHistoryStore.getState().setLoaded(true);
        return;
      }
      let valid: HistoryEntry[] = [];
      for (const raw of rawEntries) {
        if (validateHistoryEntry(raw)) {
          valid.push(raw);
        } else {
          console.warn('[useHistory] 불완전한 히스토리 항목 무시:', raw);
        }
      }

      // FIFO 상한 정리: maxHistoryCount 초과분 제거
      const maxCount = useSettingsStore.getState().maxHistoryCount;
      if (maxCount > 0 && valid.length > maxCount) {
        valid = valid.slice(0, maxCount);
        // 초과분 제거 결과를 영구 저장에도 반영
        await persist(valid);
      }

      useHistoryStore.getState().setEntries(valid);
      useHistoryStore.getState().setLoaded(true);
    } catch {
      console.warn('[useHistory] history.json 로드 실패, 빈 목록 사용');
      useHistoryStore.getState().setEntries([]);
      useHistoryStore.getState().setLoaded(true);
    }
  }

  /**
   * 히스토리 항목 추가 + FIFO 상한 적용 + 영구 저장
   * 호출 위치: useLogFile.ts Completed 분기 (fire-and-forget)
   */
  async function add(entry: HistoryEntry): Promise<void> {
    const maxCount = useSettingsStore.getState().maxHistoryCount;
    useHistoryStore.getState().addEntry(entry);

    // FIFO: 상한 초과 시 오래된 항목 제거
    let entries = useHistoryStore.getState().entries;
    if (entries.length > maxCount) {
      entries = entries.slice(0, maxCount);
      useHistoryStore.getState().setEntries(entries);
    }

    await persist(entries);
  }

  /**
   * 개별 삭제 + 영구 저장
   * 호출 위치: HistoryRow 삭제 버튼
   */
  async function remove(id: string): Promise<void> {
    useHistoryStore.getState().removeEntry(id);
    await persist(useHistoryStore.getState().entries);
  }

  /**
   * 전체 삭제 + 영구 저장
   * 호출 위치: HistoryView "전체 삭제" / DataManagementSection "전체 삭제"
   */
  async function clear(): Promise<void> {
    useHistoryStore.getState().clearEntries();
    await persist([]);
  }

  /** 내부: entries 배열을 history.json에 저장 */
  async function persist(entries: HistoryEntry[]): Promise<void> {
    try {
      const store = await getStore();
      await store.set('entries', entries);
      await store.save();
    } catch (e) {
      console.warn('[useHistory] history.json 저장 실패:', e);
    }
  }

  return { load, add, remove, clear };
}
