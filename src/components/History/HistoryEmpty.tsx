// 히스토리 빈 상태 화면

import { History } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';

export function HistoryEmpty() {
  const requestModeChange = useUiStore((s) => s.requestModeChange);
  const setActiveToolTab = useUiStore((s) => s.setActiveToolTab);

  function handleGoToFile() {
    requestModeChange({ appMode: 'file', mainView: 'stacktrace' });
    setActiveToolTab(null);
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <History
        className="w-12 h-12 text-[var(--color-text-disabled)] opacity-50"
        aria-hidden="true"
      />
      <p className="text-sm font-medium text-[var(--color-text-secondary)] mt-4">
        분석 히스토리가 없습니다
      </p>
      <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
        로그 파일을 분석하면 여기에 자동으로 기록됩니다
      </p>
      <button
        type="button"
        onClick={handleGoToFile}
        className="mt-4 px-4 py-2 text-sm bg-[var(--color-button-primary-bg)] hover:bg-[var(--color-button-primary-bg-hover)] active:bg-[var(--color-button-primary-bg)] text-white rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
      >
        파일 분석하기
      </button>
    </div>
  );
}
