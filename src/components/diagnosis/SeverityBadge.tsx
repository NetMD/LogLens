// 심각도 시각 표시 뱃지 컴포넌트

interface Props {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

const BADGE_STYLES: Record<string, string> = {
  HIGH: 'bg-[var(--color-button-danger-bg)] text-white',
  MEDIUM: 'bg-[var(--color-status-warn-fg)] text-white',
  LOW: 'bg-[var(--color-status-success-fg)] text-white',
};

const BADGE_LABELS: Record<string, string> = {
  HIGH: '높은 심각도',
  MEDIUM: '보통 심각도',
  LOW: '낮은 심각도',
};

export function SeverityBadge({ severity }: Props) {
  const style = BADGE_STYLES[severity] ?? BADGE_STYLES.MEDIUM;
  const label = BADGE_LABELS[severity] ?? BADGE_LABELS.MEDIUM;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${style}`}
      aria-label={`심각도: ${label}`}
    >
      {severity}
    </span>
  );
}
