// 자체 구현 확인 다이얼로그 (Radix 미사용)
// - role=alertdialog, ESC/배경 클릭으로 취소
// - 마운트 시 취소 버튼에 초기 포커스, 언마운트 시 returnFocusRef 로 복귀
// - Tab 트랩 (간단 구현: ref 배열 순환)

import { AlertTriangle } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { LoadingSpinner } from "./LoadingSpinner";

interface Props {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** 선택적 3번째 액션 (예: "유지" 버튼) */
  extraAction?: {
    label: string;
    onClick: () => void;
  };
  returnFocusRef?: React.MutableRefObject<HTMLElement | null>;
  isBusy?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
  extraAction,
  returnFocusRef,
  isBusy = false,
}: Props) {
  const { t } = useTranslation();
  const resolvedConfirmLabel = confirmLabel ?? t('common.confirm');
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel');
  const titleId = useId();
  const descId = useId();
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 마운트 시 취소 버튼에 초기 포커스
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => cancelBtnRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // ESC + Tab 트랩
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!isBusy) onCancel();
        return;
      }
      if (e.key === "Tab") {
        // 두 버튼 사이만 트랩
        const focusables = [cancelBtnRef.current, confirmBtnRef.current].filter(
          (el): el is HTMLButtonElement => el !== null
        );
        if (focusables.length === 0) return;
        const active = document.activeElement as HTMLElement | null;
        const idx = active ? focusables.indexOf(active as HTMLButtonElement) : -1;
        e.preventDefault();
        if (e.shiftKey) {
          const next = focusables[(idx - 1 + focusables.length) % focusables.length];
          next?.focus();
        } else {
          const next = focusables[(idx + 1) % focusables.length];
          next?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, isBusy, onCancel]);

  // 언마운트 시 트리거 요소로 포커스 복귀
  useEffect(() => {
    if (open) return;
    const target = returnFocusRef?.current;
    if (target) {
      const t = setTimeout(() => target.focus(), 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open, returnFocusRef]);

  if (!open) return null;

  const confirmBtnClass = destructive
    ? "bg-[var(--color-button-danger-bg)] hover:bg-[var(--color-button-danger-bg-hover)] disabled:bg-[var(--color-button-danger-bg)] disabled:text-[var(--color-status-error-fg)]"
    : "bg-[var(--color-button-primary-bg)] hover:bg-[var(--color-button-primary-bg-hover)] disabled:bg-[var(--color-button-primary-bg)] disabled:text-[var(--color-accent-primary)]";

  const iconBgClass = destructive ? "bg-[var(--color-status-error-bg)]" : "bg-[var(--color-accent-primary-subtle-bg)]/40";
  const iconColorClass = destructive ? "text-[var(--color-status-error-fg)]" : "text-[var(--color-accent-primary)]";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => {
          if (!isBusy) onCancel();
        }}
      />
      <div
        ref={containerRef}
        className="relative w-full max-w-sm mx-4 p-5 rounded-xl bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] shadow-2xl"
      >
        {destructive && (
          <div className="flex items-start gap-3 mb-3">
            <div
              className={`w-9 h-9 rounded-full ${iconBgClass} flex items-center justify-center flex-shrink-0`}
            >
              <AlertTriangle
                className={`w-4 h-4 ${iconColorClass}`}
                aria-hidden="true"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h2 id={titleId} className="text-sm font-semibold text-[var(--color-text-primary)]">
                {title}
              </h2>
              <p id={descId} className="text-xs text-[var(--color-text-tertiary)] mt-1">
                {description}
              </p>
            </div>
          </div>
        )}
        {!destructive && (
          <div className="mb-3">
            <h2 id={titleId} className="text-sm font-semibold text-[var(--color-text-primary)]">
              {title}
            </h2>
            <p id={descId} className="text-xs text-[var(--color-text-tertiary)] mt-1">
              {description}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="px-3 py-1.5 text-xs rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:text-[var(--color-text-disabled)] disabled:hover:bg-transparent focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none motion-safe:transition-colors"
          >
            {resolvedCancelLabel}
          </button>
          {extraAction && (
            <button
              type="button"
              onClick={extraAction.onClick}
              disabled={isBusy}
              className="px-3 py-1.5 text-xs rounded-md text-[var(--color-accent-primary)] hover:bg-[var(--color-button-primary-bg)]/15 focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none motion-safe:transition-colors"
            >
              {extraAction.label}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className={`px-3 py-1.5 text-xs rounded-md text-white flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none motion-safe:transition-colors ${confirmBtnClass}`}
          >
            {isBusy && <LoadingSpinner size="sm" />}
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
