// 파일 크기 기반 사전 경고 모달 (AI 리포트 생성 진입 전)
// - small (< 1MB)  : info 톤, "AI 분석 품질 낮을 수 있음"
// - large (>= 5MB) : warning 톤, "요약 모드로 분석됨"
// ESC / 배경 클릭으로 취소, aria-modal 다이얼로그

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, AlertTriangle } from 'lucide-react';

export type WarningVariant = 'small' | 'large';

interface Props {
  open: boolean;
  variant: WarningVariant;
  fileName: string;
  fileSize: number; // bytes
  onContinue: () => void;
  onCancel: () => void;
}

/**
 * 파일 크기 기반 경고 variant 결정 (pure)
 * < 1MB  → 'small'
 * >= 5MB → 'large'
 * else   → null (경고 없음)
 */
export function decideWarningVariant(fileSize: number): WarningVariant | null {
  const ONE_MB = 1 * 1024 * 1024;
  const FIVE_MB = 5 * 1024 * 1024;
  if (fileSize < ONE_MB) return 'small';
  if (fileSize >= FIVE_MB) return 'large';
  return null;
}

/** 파일 크기 포맷 (KB 또는 MB, 소수점 1자리) */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

export function FileSizeWarningDialog({
  open,
  variant,
  fileName,
  fileSize,
  onContinue,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  // body 스크롤 lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC 키로 취소
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  // 마운트 시 취소 버튼에 포커스
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => cancelBtnRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;

  // variant별 톤 컬러 + 아이콘 + 메시지
  const isLarge = variant === 'large';
  const Icon = isLarge ? AlertTriangle : Info;
  const iconColorClass = isLarge ? 'text-[var(--color-status-warn-fg)]' : 'text-[var(--color-accent-primary)]';
  const iconBgClass = isLarge ? 'bg-[var(--color-status-warn-bg)]' : 'bg-[var(--color-accent-primary-subtle-bg)]/40';
  const title = isLarge ? t('pdf.warningLargeTitle') : t('pdf.warningSmallTitle');
  const description = isLarge ? t('pdf.warningLargeDesc') : t('pdf.warningSmallDesc');

  // large variant일 때 "계속 진행" 버튼은 상대적으로 덜 강조 (secondary 스타일)
  const continueBtnClass = isLarge
    ? 'bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] border border-[var(--color-border-default)]'
    : 'bg-[var(--color-button-primary-bg)] hover:bg-[var(--color-button-primary-bg-hover)] text-white';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fsw-title"
      aria-describedby="fsw-desc"
    >
      {/* 배경 */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
      />
      {/* 다이얼로그 본문 */}
      <div className="relative w-full max-w-sm mx-4 p-5 rounded-xl bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] shadow-2xl">
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-full ${iconBgClass} flex items-center justify-center flex-shrink-0`}
          >
            <Icon className={`w-4 h-4 ${iconColorClass}`} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="fsw-title"
              className="text-sm font-semibold text-[var(--color-text-primary)]"
            >
              {title}
            </h2>
            <p
              id="fsw-desc"
              className="text-xs text-[var(--color-text-tertiary)] mt-1 leading-relaxed"
            >
              {description}
            </p>
            {/* 파일 정보 */}
            <div className="mt-3 text-xs text-[var(--color-text-tertiary)] bg-[var(--color-bg-elevated)] rounded px-2 py-1.5 truncate">
              <span className="text-[var(--color-text-secondary)]">
                {fileName || t('pdf.fileUnnamed')}
              </span>
              <span className="text-[var(--color-text-disabled)]"> · </span>
              <span>{formatSize(fileSize)}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none motion-safe:transition-colors"
          >
            {t('pdf.cancel')}
          </button>
          <button
            type="button"
            onClick={onContinue}
            className={`px-3 py-1.5 text-xs rounded-md focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none motion-safe:transition-colors ${continueBtnClass}`}
          >
            {t('pdf.continueAction')}
          </button>
        </div>
      </div>
    </div>
  );
}
