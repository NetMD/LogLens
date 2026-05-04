// 상태 점 + 라벨 조합 공용 배지

import { StatusDot } from "./StatusDot";

type Variant = "emerald" | "red" | "neutral" | "sky";

interface Props {
  variant: Variant;
  label: string;
  pulse?: boolean;
  title?: string;
  className?: string;
  role?: "alert" | "status";
  ariaLive?: "assertive" | "polite";
}

const TEXT_COLOR: Record<Variant, string> = {
  emerald: "text-[var(--color-status-success-fg)]",
  red: "text-[var(--color-status-error-fg)]",
  neutral: "text-[var(--color-text-secondary)]",
  sky: "text-[var(--color-accent-primary)]",
};

const BG_COLOR: Record<Variant, string> = {
  emerald: "bg-[var(--color-status-success-fg)]/10 border-[var(--color-status-success-border)]/30",
  red: "bg-[var(--color-status-error-bg)] border-[var(--color-status-error-border)]",
  neutral: "bg-[var(--color-bg-elevated)] border-[var(--color-border-default)]/30",
  sky: "bg-[var(--color-accent-primary-subtle-bg)] border-[var(--color-accent-primary)]",
};

export function StatusBadge({
  variant,
  label,
  pulse = false,
  title,
  className = "",
  role,
  ariaLive,
}: Props) {
  return (
    <div
      title={title}
      role={role}
      aria-live={ariaLive}
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-medium ${BG_COLOR[variant]} ${TEXT_COLOR[variant]} ${className}`}
    >
      <StatusDot variant={variant} pulse={pulse} />
      <span className="truncate max-w-[280px]">{label}</span>
    </div>
  );
}
