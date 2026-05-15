// 우하단 플로팅 버튼 ("새 로그 N건")

import { ArrowDown } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  count: number;
  onClick: () => void;
}

export function FloatingActionButton({ count, onClick }: Props) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('realtime.scrollToNew', { count })}
      className="absolute right-6 bottom-6 z-20 inline-flex items-center gap-2 px-4 py-2 rounded-full shadow-lg bg-[var(--color-button-primary-bg)] hover:bg-[var(--color-button-primary-bg-hover)] text-white text-sm font-medium motion-safe:transition-colors"
    >
      <span>{t('realtime.newEntries', { count: count.toLocaleString() })}</span>
      <ArrowDown className="w-4 h-4" />
    </button>
  );
}
