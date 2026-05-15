// 로그 뷰어 설정 섹션: 최대 표시 라인, ERROR 토스트, 알림음

import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { ToggleSwitch } from './ToggleSwitch';
import type { AppSettings } from '../../types/settings';

// 최대 표시 라인 옵션 — 값은 코드, 라벨은 i18n 키 또는 숫자 직렬화
const MAX_LOG_LINES_OPTIONS: { value: AppSettings['maxLogLines']; label: string; isUnlimited?: boolean }[] = [
  { value: 500, label: '500' },
  { value: 1000, label: '1,000' },
  { value: 3000, label: '3,000' },
  { value: 0, label: '', isUnlimited: true },
];

interface LogViewerSectionProps {
  maxLogLines: AppSettings['maxLogLines'];
  errorToast: boolean;
  alertSound: boolean;
  showDebugLog: boolean;
  onMaxLogLinesChange: (value: AppSettings['maxLogLines']) => void;
  onErrorToastChange: (value: boolean) => void;
  onAlertSoundChange: (value: boolean) => void;
  onShowDebugLogChange: (value: boolean) => void;
}

export function LogViewerSection({
  maxLogLines,
  errorToast,
  alertSound,
  showDebugLog,
  onMaxLogLinesChange,
  onErrorToastChange,
  onAlertSoundChange,
  onShowDebugLogChange,
}: LogViewerSectionProps) {
  const { t } = useTranslation();
  return (
    <fieldset>
      <legend className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">
        {t('settings.logViewer')}
      </legend>

      <div className="space-y-4">
        {/* 최대 표시 라인 드롭다운 */}
        <div>
          <label htmlFor="settings-max-log-lines" className="block text-xs text-[var(--color-text-tertiary)] mb-1.5">
            {t('settings.maxLines')}
          </label>
          <div className="relative">
            <select
              id="settings-max-log-lines"
              value={maxLogLines}
              onChange={(e) => onMaxLogLinesChange(Number(e.target.value) as AppSettings['maxLogLines'])}
              className="w-full appearance-none bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] hover:border-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:ring-2 focus:ring-[var(--color-border-focus)] focus:outline-none cursor-pointer pr-8"
            >
              {MAX_LOG_LINES_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.isUnlimited ? t('settings.unlimited') : opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)] pointer-events-none" />
          </div>
          {/* 무제한 경고 메시지 */}
          {maxLogLines === 0 && (
            <div className="flex items-start gap-1.5 mt-1.5" role="alert" aria-live="polite">
              <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-status-warn-fg)] shrink-0 mt-0.5" />
              <span className="text-xs text-[var(--color-status-warn-fg)]">
                {t('settings.unlimitedWarning')}
              </span>
            </div>
          )}
        </div>

        {/* ERROR 토스트 토글 */}
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <span id="settings-error-toast-label" className="text-sm text-[var(--color-text-secondary)]">
              {t('settings.errorToast')}
            </span>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              {t('settings.errorToastDesc')}
            </p>
          </div>
          <ToggleSwitch
            id="settings-error-toast"
            checked={errorToast}
            onChange={onErrorToastChange}
            labelId="settings-error-toast-label"
          />
        </div>

        {/* 알림음 토글 */}
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <span id="settings-alert-sound-label" className="text-sm text-[var(--color-text-secondary)]">
              {t('settings.alertSound')}
            </span>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              {t('settings.alertSoundDesc')}
            </p>
          </div>
          <ToggleSwitch
            id="settings-alert-sound"
            checked={alertSound}
            onChange={onAlertSoundChange}
            labelId="settings-alert-sound-label"
          />
        </div>

        {/* DEBUG/TRACE 로그 표시 토글 */}
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <span id="settings-show-debug-label" className="text-sm text-[var(--color-text-secondary)]">
              {t('settings.showDebugLog')}
            </span>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              {t('settings.showDebugLogDesc')}
            </p>
          </div>
          <ToggleSwitch
            id="settings-show-debug"
            checked={showDebugLog}
            onChange={onShowDebugLogChange}
            labelId="settings-show-debug-label"
          />
        </div>
      </div>
    </fieldset>
  );
}
