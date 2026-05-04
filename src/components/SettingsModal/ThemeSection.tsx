// 화면 설정 섹션: 테마 선택 + 폰트패밀리 + 폰트 크기

import { useCallback } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { AppSettings } from '../../types/settings';
import { FontPicker } from './FontPicker';

// 테마 옵션
const THEME_OPTIONS: { value: AppSettings['theme']; label: string }[] = [
  { value: 'dark', label: '다크' },
  { value: 'light', label: '라이트' },
  { value: 'system', label: '시스템' },
];

interface ThemeSectionProps {
  theme: AppSettings['theme'];
  fontFamily: string;
  fontSize: number;
  onThemeChange: (theme: AppSettings['theme']) => void;
  onFontFamilyChange: (fontFamily: string) => void;
  onFontSizeChange: (fontSize: number) => void;
}

export function ThemeSection({
  theme,
  fontFamily,
  fontSize,
  onThemeChange,
  onFontFamilyChange,
  onFontSizeChange,
}: ThemeSectionProps) {
  // 세그먼트 컨트롤: 화살표 키 roving tabindex
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

  return (
    <fieldset>
      <legend className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">
        화면
      </legend>

      <div className="space-y-4">
        {/* 테마 세그먼트 컨트롤 */}
        <div>
          <label id="settings-theme-label" className="block text-xs text-[var(--color-text-tertiary)] mb-1.5">
            테마
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
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 시스템 폰트 선택 */}
        <FontPicker value={fontFamily} onChange={onFontFamilyChange} />

        {/* 폰트 크기 스텝퍼 */}
        <div>
          <label id="settings-font-size" className="block text-xs text-[var(--color-text-tertiary)] mb-1.5">
            폰트 크기
          </label>
          <div className="flex items-center gap-2" aria-labelledby="settings-font-size">
            <button
              type="button"
              aria-label="폰트 크기 줄이기"
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
              aria-label="폰트 크기 늘리기"
              disabled={fontSize >= 20}
              onClick={() => onFontSizeChange(Math.min(20, fontSize + 1))}
              className="w-8 h-8 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-[var(--color-text-tertiary)] ml-1">px</span>
          </div>
        </div>
      </div>
    </fieldset>
  );
}
