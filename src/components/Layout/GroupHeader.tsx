// 사이드바 그룹 헤더: 텍스트 버튼(라벨 클릭) + chevron 버튼(접기 토글) 분리
// - 라벨 클릭: onLabelClick (예: 기본 탭으로 이동)
// - chevron 클릭: onToggle (그룹 접기/펼치기)
// - accent: 'file' | 'live' 좌측 2px 색상 바 + 기본 아이콘

import {
  ChevronDown,
  ChevronRight,
  FileText,
  Radio,
  type LucideIcon,
} from "lucide-react";

interface Props {
  label: string;
  collapsed: boolean;
  onLabelClick: () => void;
  onToggle: () => void;
  labelAriaLabel?: string;
  toggleAriaLabel?: string;
  accent?: "file" | "live";
  icon?: LucideIcon;
  labelId?: string;
  // 현재 활성 그룹 여부 (모드 전환 트리거용 — aria-pressed)
  isActive?: boolean;
}

export function GroupHeader({
  label,
  collapsed,
  onLabelClick,
  onToggle,
  labelAriaLabel,
  toggleAriaLabel,
  accent,
  icon,
  labelId,
  isActive,
}: Props) {
  const ChevronIcon = collapsed ? ChevronRight : ChevronDown;

  // accent 별 좌측 바 색상
  const accentBarClass =
    accent === "live"
      ? "bg-[var(--color-status-success-fg)] motion-safe:animate-pulse"
      : accent === "file"
        ? "bg-[var(--color-accent-primary)]"
        : "";

  // 기본 아이콘: file -> FileText, live -> Radio
  const DefaultIcon: LucideIcon | null =
    icon ?? (accent === "live" ? Radio : accent === "file" ? FileText : null);

  return (
    <div className="relative flex items-center gap-1 px-2 mb-1">
      {accent && (
        <span
          aria-hidden="true"
          className={`absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r ${accentBarClass}`}
        />
      )}
      <button
        type="button"
        onClick={onLabelClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onLabelClick();
          }
        }}
        role="button"
        aria-pressed={isActive ?? undefined}
        aria-label={labelAriaLabel ?? label}
        className={`flex-1 flex items-center gap-1.5 text-left px-2 py-1 text-xs font-semibold uppercase tracking-wider motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] rounded ${
          isActive
            ? "text-[var(--color-text-primary)]"
            : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
        }`}
      >
        {DefaultIcon && (
          <DefaultIcon className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
        )}
        <span id={labelId}>{label}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-expanded={!collapsed}
        aria-label={
          toggleAriaLabel ?? (collapsed ? `${label} 펼치기` : `${label} 접기`)
        }
        className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] motion-safe:transition-colors"
      >
        <ChevronIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
