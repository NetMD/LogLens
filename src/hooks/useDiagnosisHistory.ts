// Tauri store (diagnosis-history.json) CRUD 브릿지
// 기존 useAiReportHistory.ts 패턴을 그대로 따름

import { Store } from '@tauri-apps/plugin-store';
import type { DiagnosisHistory } from '../types/diagnosis';

const STORE_FILE = 'diagnosis-history.json';
const STORE_KEY = 'entries';

// 싱글턴 Store 인스턴스
let storeInstance: Store | null = null;
async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await Store.load(STORE_FILE);
  }
  return storeInstance;
}

/** 히스토리 항목 최소 유효성 검증 */
function validateDiagnosisHistory(raw: unknown): raw is DiagnosisHistory {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.savedAt === 'string' &&
    typeof obj.exceptionClass === 'string'
  );
}

/** 전체 히스토리 로드 */
export async function loadDiagnosisHistories(): Promise<DiagnosisHistory[]> {
  try {
    const store = await getStore();
    const raw = await store.get<unknown[]>(STORE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter(validateDiagnosisHistory);
  } catch {
    console.warn('[useDiagnosisHistory] 로드 실패');
    return [];
  }
}

/** 히스토리 저장 (최신이 앞, maxCount 초과분 삭제) */
export async function saveDiagnosisHistory(
  entry: DiagnosisHistory,
  maxCount: number,
): Promise<void> {
  const store = await getStore();
  let entries = await loadDiagnosisHistories();
  entries.unshift(entry);
  if (entries.length > maxCount) {
    entries = entries.slice(0, maxCount);
  }
  await store.set(STORE_KEY, entries);
  await store.save();
}

/** 히스토리 개별 삭제 */
export async function deleteDiagnosisHistory(id: string): Promise<void> {
  const store = await getStore();
  let entries = await loadDiagnosisHistories();
  entries = entries.filter(e => e.id !== id);
  await store.set(STORE_KEY, entries);
  await store.save();
}

/** 히스토리 전체 삭제 */
export async function clearAllDiagnosisHistory(): Promise<void> {
  const store = await getStore();
  await store.set(STORE_KEY, []);
  await store.save();
}
