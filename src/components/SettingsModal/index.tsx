// 설정 모달 메인 쉘 (560x580px, 3섹션, 저장/취소)

import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSettings } from '../../hooks/useSettings';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { sanitizeSettings, DEFAULT_SETTINGS } from '../../types/settings';
import { ERROR_LABELS } from '../../constants/errorLabels';
import type { AppSettings } from '../../types/settings';
import { ThemeSection } from './ThemeSection';
import { LogViewerSection } from './LogViewerSection';
import { DataManagementSection } from './DataManagementSection';
import { AiSection } from './AiSection';
import { AboutSection } from './AboutSection';
import { useHistoryStore } from '../../store/historyStore';
import { useHistory } from '../../hooks/useHistory';

export function SettingsModal() {
  const isOpen = useUiStore((s) => s.isSettingsModalOpen);
  const scrollTarget = useUiStore((s) => s.settingsModalScrollTarget);
  const closeSettingsModal = useUiStore((s) => s.closeSettingsModal);
  const clearSettingsScrollTarget = useUiStore((s) => s.clearSettingsScrollTarget);

  const { save } = useSettings();
  const historyCount = useHistoryStore((s) => s.entries.length);
  const { clear: clearHistory } = useHistory();

  const titleId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const aboutSectionRef = useRef<HTMLDivElement>(null);
  const aiSectionRef = useRef<HTMLDivElement>(null);
  const prevThemeRef = useRef<AppSettings['theme']>('dark');

  // 로컬 draft 상태 (저장 전까지 settingsStore에 반영하지 않음)
  const [draft, setDraft] = useState<AppSettings>({ ...DEFAULT_SETTINGS });
  const [saveError, setSaveError] = useState<string | null>(null);

  // Tab 트랩
  useFocusTrap(containerRef, {
    enabled: isOpen,
    onEscape: handleCancel,
  });

  // 모달 오픈 시: settingsStore 현재 값을 draft로 복사 + prevTheme 저장
  useEffect(() => {
    if (isOpen) {
      const current = useSettingsStore.getState();
      setDraft({
        theme: current.theme,
        fontFamily: current.fontFamily,
        fontSize: current.fontSize,
        maxLogLines: current.maxLogLines,
        errorToast: current.errorToast,
        alertSound: current.alertSound,
        maxHistoryCount: current.maxHistoryCount,
        aiProvider: current.aiProvider,
        // 프로바이더별 키 맵은 shallow copy로 복제 (draft 변경이 store에 즉시 영향 안 주도록)
        aiApiKeys: { ...current.aiApiKeys },
        aiModel: current.aiModel,
        showDebugLog: current.showDebugLog,
        localLlmEndpoint: current.localLlmEndpoint,
        localLlmModel: current.localLlmModel,
      });
      prevThemeRef.current = current.theme;
      setSaveError(null);
    }
  }, [isOpen]);

  // 스크롤 타겟 처리 (about 또는 ai 섹션)
  useEffect(() => {
    if (isOpen && scrollTarget) {
      const targetRef = scrollTarget === 'about' ? aboutSectionRef : aiSectionRef;
      const t = setTimeout(() => {
        targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        clearSettingsScrollTarget();
      }, 100);
      return () => clearTimeout(t);
    }
  }, [isOpen, scrollTarget, clearSettingsScrollTarget]);

  if (!isOpen) return null;

  // 테마 변경 시 즉시 프리뷰
  function handleThemeChange(newTheme: AppSettings['theme']) {
    setDraft((d) => ({ ...d, theme: newTheme }));
    // 즉시 DOM 적용 (프리뷰)
    const resolved = newTheme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : newTheme;
    document.documentElement.dataset.theme = resolved;
  }

  // 취소: 테마 롤백 + draft 폐기 + 모달 닫기
  function handleCancel() {
    const prev = prevThemeRef.current;
    const resolved = prev === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : prev;
    document.documentElement.dataset.theme = resolved;
    closeSettingsModal();
  }

  // 저장: sanitize -> settingsStore + settings.json 기록 -> 모달 닫기
  async function handleSave() {
    const sanitized = sanitizeSettings(draft);
    try {
      await save(sanitized);
      closeSettingsModal();
    } catch {
      setSaveError(ERROR_LABELS.SETTINGS_SAVE_FAILED);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* 오버레이 */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={handleCancel}
      />

      {/* 모달 컨테이너 */}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-[560px] max-w-full mx-4 max-h-[580px] bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-xl shadow-2xl flex flex-col"
      >
        {/* 헤더 (고정) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-default)] shrink-0">
          <h2 id={titleId} className="text-base font-semibold text-[var(--color-text-primary)]">
            설정
          </h2>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="설정 닫기"
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none rounded-lg p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 (스크롤) */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* 화면 섹션 */}
          <ThemeSection
            theme={draft.theme}
            fontFamily={draft.fontFamily}
            fontSize={draft.fontSize}
            onThemeChange={handleThemeChange}
            onFontFamilyChange={(fontFamily) => setDraft((d) => ({ ...d, fontFamily }))}
            onFontSizeChange={(fontSize) => setDraft((d) => ({ ...d, fontSize }))}
          />

          {/* 로그 뷰어 섹션 */}
          <LogViewerSection
            maxLogLines={draft.maxLogLines}
            errorToast={draft.errorToast}
            alertSound={draft.alertSound}
            showDebugLog={draft.showDebugLog}
            onMaxLogLinesChange={(maxLogLines) => setDraft((d) => ({ ...d, maxLogLines }))}
            onErrorToastChange={(errorToast) => setDraft((d) => ({ ...d, errorToast }))}
            onAlertSoundChange={(alertSound) => setDraft((d) => ({ ...d, alertSound }))}
            onShowDebugLogChange={(showDebugLog) => setDraft((d) => ({ ...d, showDebugLog }))}
          />

          {/* 데이터 관리 섹션 */}
          <DataManagementSection
            maxHistoryCount={draft.maxHistoryCount}
            onMaxHistoryCountChange={(maxHistoryCount) => setDraft((d) => ({ ...d, maxHistoryCount }))}
            historyCount={historyCount}
            onClearHistory={clearHistory}
          />

          {/* AI 설정 섹션 */}
          <div ref={aiSectionRef}>
            <AiSection
              aiProvider={draft.aiProvider}
              aiApiKeys={draft.aiApiKeys}
              aiModel={draft.aiModel}
              localLlmEndpoint={draft.localLlmEndpoint}
              localLlmModel={draft.localLlmModel}
              onProviderChange={(p) => setDraft((d) => ({ ...d, aiProvider: p }))}
              onApiKeyChange={(provider, k) =>
                setDraft((d) => ({
                  ...d,
                  aiApiKeys: { ...d.aiApiKeys, [provider]: k },
                }))
              }
              onModelChange={(m) => setDraft((d) => ({ ...d, aiModel: m }))}

              onLocalLlmEndpointChange={(v) => setDraft((d) => ({ ...d, localLlmEndpoint: v }))}
              onLocalLlmModelChange={(v) => setDraft((d) => ({ ...d, localLlmModel: v }))}
            />
          </div>

          {/* 정보 섹션 (오픈소스 라이선스) */}
          <div ref={aboutSectionRef}>
            <AboutSection />
          </div>
        </div>

        {/* 하단 (고정) */}
        <div className="shrink-0 border-t border-[var(--color-border-default)] px-6 py-4">
          {/* 저장 에러 배너 */}
          {saveError && (
            <div className="mb-3 bg-[var(--color-status-warn-bg)] border border-[var(--color-status-warn-border)] rounded-lg px-3 py-2 text-xs text-[var(--color-status-warn-fg)]">
              {saveError}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-sm rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-sm rounded-lg font-medium bg-[var(--color-button-primary-bg)] text-white hover:bg-[var(--color-button-primary-bg-hover)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
