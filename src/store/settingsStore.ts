// 앱 설정 Zustand store (비persist -- Tauri store가 영구 저장 담당)

import { create } from 'zustand';
import type { AppSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';

interface SettingsState extends AppSettings {
  /** Tauri store에서 초기 로드가 완료되었는지 여부 */
  _initialized: boolean;
  setSettings: (s: Partial<AppSettings> & { _initialized?: boolean }) => void;
  resetToDefaults: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULT_SETTINGS,
  _initialized: false,
  setSettings: (partial) => set((s) => ({ ...s, ...partial })),
  resetToDefaults: () => set({ ...DEFAULT_SETTINGS }),
}));
