// 설정 모달 메인 쉘 (560x580px, 3섹션, 저장/취소)

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import i18n from '../../i18n';
import type { Language } from '../../i18n/languages';
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
  const { t } = useTranslation();
  const isOpen = useUiStore((s) => s.isSettingsModalOpen);
  const scrollTarget = useUiStore((s) => s.settingsModalScrollTarget);
  const closeSettingsModal = useUiStore((s) => s.closeSettingsModal);
  const clearSettingsScrollTarget = useUiStore((s) => s.clearSettingsScrollTarget);

  const { save, setLanguage } = useSettings();
  const historyCount = useHistoryStore((s) => s.entries.length);
  const { clear: clearHistory } = useHistory();

  const titleId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const aboutSectionRef = useRef<HTMLDivElement>(null);
  const aiSectionRef = useRef<HTMLDivElement>(null);
  const prevThemeRef = useRef<AppSettings['theme']>('dark');
  const prevLanguageRef = useRef<Language>('ko');

  // 로컬 draft 상태 (저장 전까지 settingsStore에 반영하지 않음)
  const [draft, setDraft] = useState<AppSettings>({ ...DEFAULT_SETTINGS });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

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
        language: current.language,
      });
      prevThemeRef.current = current.theme;
      prevLanguageRef.current = current.language;
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

  // 언어 변경: 단일 위임 함수 setLanguage() 호출 (i18n → tauri → settingsStore)
  // 라디오 클릭 시 즉시 UI 갱신 (테마와 동일한 즉시 프리뷰 패턴)
  function handleLanguageChange(lang: Language) {
    setDraft((d) => ({ ...d, language: lang }));
    // 즉시 프리뷰 (UI 만 — Tauri store 저장은 handleSave 가 처리)
    void i18n.changeLanguage(lang); // allow: settings preview path
  }

  // 취소: 테마 + 언어 롤백 + draft 폐기 + 모달 닫기
  function handleCancel() {
    const prev = prevThemeRef.current;
    const resolved = prev === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : prev;
    document.documentElement.dataset.theme = resolved;
    // 언어 프리뷰 롤백
    const prevLang = prevLanguageRef.current;
    if (i18n.language !== prevLang) {
      void i18n.changeLanguage(prevLang); // allow: settings cancel rollback path
    }
    closeSettingsModal();
  }

  // 저장: sanitize -> settingsStore + settings.json 기록 -> 모달 닫기
  // 언어가 바뀌었으면 setLanguage 단일 위임 함수를 명시적으로 호출하여
  // i18n.changeLanguage 의 유일한 호출 진입점 패턴(R12 설계서 §4.2)을 보존한다.
  async function handleSave() {
    const sanitized = sanitizeSettings(draft);
    setIsSavingSettings(true);
    try {
      // (1) 언어가 바뀌었으면 단일 위임 함수 setLanguage() 로 i18n+영속화+미러 갱신.
      //     i18n.changeLanguage 는 이미 handleLanguageChange 에서 즉시 프리뷰 적용됐지만,
      //     setLanguage() 는 idempotent 하므로 동일 lang 재호출도 안전하다.
      //     (i18next 자체가 동일 언어 재설정 시 no-op + Tauri store 멱등 write)
      if (prevLanguageRef.current !== sanitized.language) {
        await setLanguage(sanitized.language);
      }
      // (2) 나머지 모든 필드를 일괄 저장. save() 의 for 루프가 language 도 동일 값으로
      //     덮어쓰지만 멱등이므로 무해.
      await save(sanitized);
      closeSettingsModal();
    } catch {
      setSaveError(ERROR_LABELS.SETTINGS_SAVE_FAILED);
    } finally {
      setIsSavingSettings(false);
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
            {t('settings.title')}
          </h2>
          <button
            type="button"
            onClick={handleCancel}
            aria-label={t('settings.close')}
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
            language={draft.language}
            isSavingSettings={isSavingSettings}
            i18nReady={i18n.isInitialized}
            onThemeChange={handleThemeChange}
            onFontFamilyChange={(fontFamily) => setDraft((d) => ({ ...d, fontFamily }))}
            onFontSizeChange={(fontSize) => setDraft((d) => ({ ...d, fontSize }))}
            onLanguageChange={handleLanguageChange}
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
              disabled={isSavingSettings}
              className="px-4 py-2 text-sm rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('settings.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSavingSettings}
              className="px-4 py-2 text-sm rounded-lg font-medium bg-[var(--color-button-primary-bg)] text-white hover:bg-[var(--color-button-primary-bg-hover)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {t('settings.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
