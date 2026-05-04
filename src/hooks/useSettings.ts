// Tauri store(settings.json) <-> settingsStore 브릿지 훅

import { Store } from '@tauri-apps/plugin-store';
import { useSettingsStore } from '../store/settingsStore';
import { sanitizeSettings, DEFAULT_SETTINGS } from '../types/settings';
import type { AppSettings } from '../types/settings';

// 싱글턴 Store 인스턴스 (모듈 레벨 캐싱)
let storeInstance: Store | null = null;
async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await Store.load('settings.json');
  }
  return storeInstance;
}

export function useSettings() {
  const store = useSettingsStore();

  /** 앱 초기화 시 settings.json에서 로드 -> settingsStore 주입 */
  async function load(): Promise<void> {
    try {
      const tauriStore = await getStore();
      const raw: Partial<AppSettings> & { aiApiKey?: string } = {};
      for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
        const val = await tauriStore.get<AppSettings[typeof key]>(key);
        if (val !== null && val !== undefined) {
          (raw as Record<string, unknown>)[key] = val;
        }
      }
      // 레거시 aiApiKey 마이그레이션: 신규 스키마(aiApiKeys)에는 없지만
      // 기존 settings.json에 저장되어 있을 수 있으므로 명시적으로 읽어
      // sanitizeSettings가 aiApiKeys[aiProvider]로 이관하게 한다.
      const legacyKey = await tauriStore.get<string>('aiApiKey');
      if (typeof legacyKey === 'string' && legacyKey !== '') {
        raw.aiApiKey = legacyKey;
      }
      const sanitized = sanitizeSettings(raw);
      useSettingsStore.getState().setSettings({ ...sanitized, _initialized: true });

      // 마이그레이션이 발생했다면 레거시 키를 즉시 정리 + 새 구조로 저장
      // (다음 로드 시 중복 마이그레이션 방지 + store에 잔여 키 제거)
      if (typeof legacyKey === 'string' && legacyKey !== '') {
        try {
          await tauriStore.delete('aiApiKey');
          await tauriStore.set('aiApiKeys', sanitized.aiApiKeys);
          await tauriStore.save();
        } catch (e) {
          console.warn('[useSettings] 레거시 aiApiKey 정리 실패 (다음 저장 시 재시도):', e);
        }
      }
    } catch {
      // settings.json 파싱 실패 또는 파일 없음 -> 기본값 폴백
      console.warn('[useSettings] settings.json 로드 실패, 기본값 사용');
      useSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS, _initialized: true });
    }
  }

  /** "저장" 클릭 시: sanitize -> Tauri store 쓰기 -> settingsStore 업데이트 */
  async function save(settings: AppSettings): Promise<void> {
    const sanitized = sanitizeSettings(settings);
    try {
      const tauriStore = await getStore();
      for (const [key, value] of Object.entries(sanitized)) {
        await tauriStore.set(key, value);
      }
      await tauriStore.save();
      useSettingsStore.getState().setSettings(sanitized);
    } catch (e) {
      // 디스크 쓰기 실패 -> in-memory에는 반영, 경고 출력 후 에러를 상위로 전파
      console.warn('[useSettings] settings.json 저장 실패:', e);
      useSettingsStore.getState().setSettings(sanitized);
      throw e;
    }
  }

  return { ...store, load, save };
}
