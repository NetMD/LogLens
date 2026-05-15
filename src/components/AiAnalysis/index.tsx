// AI 분석 패널 (Pro 기능 — P1 구현 예정)
// 현재는 UI 구조만 제공
// R12 i18n: aiDiagnosis.panelTitle / panelDesc 키로 한국어/영어 분기

import { useTranslation } from 'react-i18next';

export function AiAnalysisView() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
      <div className="w-12 h-12 rounded-xl bg-[var(--color-accent-primary-subtle-bg)] flex items-center justify-center">
        <svg className="w-6 h-6 text-[var(--color-accent-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--color-text-secondary)]">{t('aiDiagnosis.panelTitle')}</p>
        <p className="text-xs text-[var(--color-text-disabled)] mt-1 max-w-xs">
          {t('aiDiagnosis.panelDesc')}
        </p>
      </div>
    </div>
  );
}
