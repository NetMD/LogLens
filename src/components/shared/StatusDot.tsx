// 상태 표시용 색상 점 컴포넌트 (pulse 옵션)

type Variant = "emerald" | "red" | "neutral" | "sky";

interface Props {
  variant: Variant;
  pulse?: boolean;
  className?: string;
}

const COLOR_CLASS: Record<Variant, string> = {
  emerald: "bg-[var(--color-status-success-fg)]",
  red: "bg-[var(--color-status-error-fg)]",
  neutral: "bg-[var(--color-text-tertiary)]",
  sky: "bg-[var(--color-accent-primary)]",
};

const PULSE_RING_CLASS: Record<Variant, string> = {
  emerald: "bg-[var(--color-status-success-fg)]",
  red: "bg-[var(--color-status-error-fg)]",
  neutral: "bg-[var(--color-bg-elevated)]",
  sky: "bg-[var(--color-accent-primary-subtle-bg)]",
};

export function StatusDot({ variant, pulse = false, className = "" }: Props) {
  return (
    <span
      className={`relative inline-flex w-2 h-2 ${className}`}
      aria-hidden="true"
    >
      {pulse && (
        <span
          className={`motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full ${PULSE_RING_CLASS[variant]}`}
        />
      )}
      <span
        className={`relative inline-flex rounded-full h-2 w-2 ${COLOR_CLASS[variant]}`}
      />
    </span>
  );
}
