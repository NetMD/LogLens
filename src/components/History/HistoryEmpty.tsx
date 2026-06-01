// 히스토리 빈 상태 화면

import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../store/uiStore';

export function HistoryEmpty() {
  const { t } = useTranslation();
  const setActiveToolTab = useUiStore((s) => s.setActiveToolTab);

  function handleGoToFile() {
    // 도구 탭 해제 → 활성 탭 또는 드롭존으로 복귀 (다중 탭 모델)
    setActiveToolTab(null);
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <History
        className="w-12 h-12 text-[var(--color-text-disabled)] opacity-50"
        aria-hidden="true"
      />
      <p className="text-sm font-medium text-[var(--color-text-secondary)] mt-4">
        {t('history.empty')}
      </p>
      <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
        {t('history.emptyDesc')}
      </p>
      <button
        type="button"
        onClick={handleGoToFile}
        className="mt-4 px-4 py-2 text-sm bg-[var(--color-button-primary-bg)] hover:bg-[var(--color-button-primary-bg-hover)] active:bg-[var(--color-button-primary-bg)] text-white rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
      >
        {t('sidebar.fileAnalysis')}
      </button>
    </div>
  );
}
