// 심각도 시각 표시 뱃지 컴포넌트

import { useTranslation } from 'react-i18next';

interface Props {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

const BADGE_STYLES: Record<string, string> = {
  HIGH: 'bg-[var(--color-button-danger-bg)] text-white',
  MEDIUM: 'bg-[var(--color-status-warn-fg)] text-white',
  LOW: 'bg-[var(--color-status-success-fg)] text-white',
};

const BADGE_LABEL_KEYS: Record<string, string> = {
  HIGH: 'aiDiagnosis.severityHigh',
  MEDIUM: 'aiDiagnosis.severityMedium',
  LOW: 'aiDiagnosis.severityLow',
};

export function SeverityBadge({ severity }: Props) {
  const { t } = useTranslation();
  const style = BADGE_STYLES[severity] ?? BADGE_STYLES.MEDIUM;
  const labelKey = BADGE_LABEL_KEYS[severity] ?? BADGE_LABEL_KEYS.MEDIUM;
  const label = t(labelKey);

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${style}`}
      aria-label={t('aiDiagnosis.severityAria', { label })}
    >
      {severity}
    </span>
  );
}
