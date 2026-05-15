// 화면 설정 섹션: 테마 선택 + 폰트패밀리 + 폰트 크기 + 언어

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import type { AppSettings } from '../../types/settings';
import type { Language } from '../../i18n/languages';
import { FontPicker } from './FontPicker';

// 테마 옵션 (값: 코드 / 라벨 키: i18n 키)
const THEME_OPTIONS: { value: AppSettings['theme']; labelKey: string }[] = [
  { value: 'dark', labelKey: 'settings.themeOptionDark' },
  { value: 'light', labelKey: 'settings.themeOptionLight' },
  { value: 'system', labelKey: 'settings.themeOptionSystem' },
];

// 언어 옵션 (UX §5-3 — endonym + lang 속성으로 스크린리더 발음 분기)
const LANGUAGE_OPTIONS: { value: Language; labelKey: string; lang: string }[] = [
  { value: 'ko', labelKey: 'settings.languageOptionKo', lang: 'ko' },
  { value: 'en', labelKey: 'settings.languageOptionEn', lang: 'en' },
];

interface ThemeSectionProps {
  theme: AppSettings['theme'];
  fontFamily: string;
  fontSize: number;
  language: Language;
  isSavingSettings: boolean;
  i18nReady: boolean;
  onThemeChange: (theme: AppSettings['theme']) => void;
  onFontFamilyChange: (fontFamily: string) => void;
  onFontSizeChange: (fontSize: number) => void;
  onLanguageChange: (lang: Language) => void;
}

export function ThemeSection({
  theme,
  fontFamily,
  fontSize,
  language,
  isSavingSettings,
  i18nReady,
  onThemeChange,
  onFontFamilyChange,
  onFontSizeChange,
  onLanguageChange,
}: ThemeSectionProps) {
  const { t } = useTranslation();
  // [EXT-002 적용] disabled 조건식 명문화 — 저장 진행 중 / i18n 미초기화 시 비활성
  const languageDisabled = isSavingSettings || !i18nReady;

  // 세그먼트 컨트롤: 화살표 키 roving tabindex (테마)
  const handleSegmentKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      let nextIndex = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % THEME_OPTIONS.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIndex = (currentIndex - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length;
      }
      if (nextIndex >= 0) {
        onThemeChange(THEME_OPTIONS[nextIndex].value);
        // roving tabindex: 다음 요소에 포커스
        const container = (e.currentTarget as HTMLElement).parentElement;
        const buttons = container?.querySelectorAll<HTMLElement>('[role="radio"]');
        buttons?.[nextIndex]?.focus();
      }
    },
    [onThemeChange]
  );

  // 언어 세그먼트 키보드 핸들러 (테마 패턴 100% 복제)
  const handleLanguageKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      let nextIndex = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % LANGUAGE_OPTIONS.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIndex = (currentIndex - 1 + LANGUAGE_OPTIONS.length) % LANGUAGE_OPTIONS.length;
      }
      if (nextIndex >= 0) {
        onLanguageChange(LANGUAGE_OPTIONS[nextIndex].value);
        const container = (e.currentTarget as HTMLElement).parentElement;
        const buttons = container?.querySelectorAll<HTMLElement>('[role="radio"]');
        buttons?.[nextIndex]?.focus();
      }
    },
    [onLanguageChange]
  );

  return (
    <fieldset>
      <legend className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">
        {t('settings.themeSectionTitle')}
      </legend>

      <div className="space-y-4">
        {/* 테마 세그먼트 컨트롤 */}
        <div>
          <label
            id="settings-theme-label"
            className="block text-xs text-[var(--color-text-tertiary)] mb-1.5"
          >
            {t('settings.theme')}
          </label>
          <div
            role="radiogroup"
            aria-labelledby="settings-theme-label"
            className="flex bg-[var(--color-bg-elevated)] rounded-lg p-1"
          >
            {THEME_OPTIONS.map((opt, idx) => {
              const isSelected = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => onThemeChange(opt.value)}
                  onKeyDown={(e) => handleSegmentKeyDown(e, idx)}
                  className={`flex-1 py-1.5 text-xs font-medium text-center cursor-pointer rounded-md transition-all duration-150 focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-surface)] focus-visible:outline-none ${
                    isSelected
                      ? 'bg-[var(--color-button-primary-bg)] text-white shadow-sm'
                      : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {t(opt.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        {/* 시스템 폰트 선택 */}
        <FontPicker value={fontFamily} onChange={onFontFamilyChange} />

        {/* 폰트 크기 스텝퍼 */}
        <div>
          <label
            id="settings-font-size"
            className="block text-xs text-[var(--color-text-tertiary)] mb-1.5"
          >
            {t('settings.fontSize')}
          </label>
          <div className="flex items-center gap-2" aria-labelledby="settings-font-size">
            <button
              type="button"
              aria-label={t('settings.decreaseFontSize')}
              disabled={fontSize <= 10}
              onClick={() => onFontSizeChange(Math.max(10, fontSize - 1))}
              className="w-8 h-8 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-12 text-center text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg py-1.5 tabular-nums">
              {fontSize}
            </span>
            <button
              type="button"
              aria-label={t('settings.increaseFontSize')}
              disabled={fontSize >= 20}
              onClick={() => onFontSizeChange(Math.min(20, fontSize + 1))}
              className="w-8 h-8 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-[var(--color-text-tertiary)] ml-1">px</span>
          </div>
        </div>

        {/* === 언어 세그먼트 (UX §2-3 — 디바이더 없이 mt-5 만) === */}
        <div className="mt-5">
          <label
            id="settings-language-label"
            className="block text-xs text-[var(--color-text-tertiary)] mb-1.5"
          >
            {t('settings.language')}
          </label>
          <div
            role="radiogroup"
            aria-labelledby="settings-language-label"
            aria-label={t('settings.languageRadiogroupLabel')}
            aria-busy={isSavingSettings ? 'true' : undefined}
            className={`flex bg-[var(--color-bg-elevated)] rounded-lg p-1 ${
              languageDisabled ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {LANGUAGE_OPTIONS.map((opt, idx) => {
              const isSelected = language === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  lang={opt.lang}
                  disabled={languageDisabled}
                  onClick={() => onLanguageChange(opt.value)}
                  onKeyDown={(e) => handleLanguageKeyDown(e, idx)}
                  className={`flex-1 py-1.5 text-xs font-medium text-center cursor-pointer rounded-md transition-all duration-150 focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-surface)] focus-visible:outline-none disabled:cursor-not-allowed ${
                    isSelected
                      ? 'bg-[var(--color-button-primary-bg)] text-white shadow-sm'
                      : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {t(opt.labelKey)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </fieldset>
  );
}
