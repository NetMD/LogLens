import { useTranslation } from "react-i18next";

interface Props {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "w-4 h-4 border-2",
  md: "w-6 h-6 border-2",
  lg: "w-8 h-8 border-[3px]",
};

export function LoadingSpinner({ size = "md", className = "" }: Props) {
  const { t } = useTranslation();
  return (
    <div
      className={`${sizeMap[size]} rounded-full border-[var(--color-text-disabled)] border-t-blue-400 animate-spin ${className}`}
      role="status"
      aria-label={t('common.loading')}
    />
  );
}
