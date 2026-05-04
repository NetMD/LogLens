// 실시간 감시 모드의 빈 상태 표시
// - 중앙 정렬, Radio 아이콘 (motion-safe:animate-pulse)

import { Radio, type LucideIcon } from "lucide-react";

interface Props {
  icon?: LucideIcon;
  title: string;
  description: string;
}

export function EmptyLiveState({ icon: Icon = Radio, title, description }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-12">
      <div className="w-12 h-12 rounded-full bg-[var(--color-status-success-bg)] flex items-center justify-center">
        <Icon
          className="w-6 h-6 text-[var(--color-status-success-fg)] motion-safe:animate-pulse"
          aria-hidden="true"
        />
      </div>
      <p className="text-sm font-medium text-[var(--color-text-secondary)]">{title}</p>
      <p className="text-xs text-[var(--color-text-tertiary)] text-center max-w-xs">{description}</p>
    </div>
  );
}
