// 실시간 감시 상태 뱃지 (상단 툴바 표시용)
// - appMode !== 'live' 이면 렌더하지 않음
// - 상태별: idle (대기 중, 클릭 무효) / starting (시작 중, 50ms 지연 스피너) /
//   watching (감시 중, 클릭→stop) / error (재시도, 클릭→start)

import { AlertTriangle, Loader2, RotateCw, StopCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useLogWatchActions } from "../../hooks/useLogWatch";
import { useLogStore } from "../../store/logStore";
import { useUiStore } from "../../store/uiStore";
import { StatusDot } from "../shared/StatusDot";

// starting 상태가 50ms 이내에 끝나면 스피너 깜빡임 방지
const SPINNER_DELAY_MS = 50;

export function WatchStatusBadge() {
  const { t } = useTranslation();
  const appMode = useUiStore((s) => s.appMode);
  const watchMode = useLogStore((s) => s.watchMode);
  const watchPath = useLogStore((s) => s.watchPath);
  const { start, stop } = useLogWatchActions();

  const [showStartingSpinner, setShowStartingSpinner] = useState(false);
  const spinnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (watchMode === "starting") {
      spinnerTimerRef.current = setTimeout(() => {
        setShowStartingSpinner(true);
      }, SPINNER_DELAY_MS);
    } else {
      if (spinnerTimerRef.current) {
        clearTimeout(spinnerTimerRef.current);
        spinnerTimerRef.current = null;
      }
      setShowStartingSpinner(false);
    }
    return () => {
      if (spinnerTimerRef.current) {
        clearTimeout(spinnerTimerRef.current);
        spinnerTimerRef.current = null;
      }
    };
  }, [watchMode]);

  // file 모드에서는 뱃지 표시하지 않음
  if (appMode !== "live") return null;

  const handleClick = () => {
    if (watchMode === "watching") {
      void stop();
    } else if (watchMode === "idle" || watchMode === "error") {
      if (watchPath) {
        void start(watchPath);
      } else {
        void start();
      }
    }
    // starting 은 클릭 무시
  };

  const baseClass =
    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border motion-safe:transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]/60";

  let variantClass = "";
  let content: React.ReactNode = null;
  let ariaLabel = "";
  let isClickable = false;

  switch (watchMode) {
    case "idle":
      variantClass =
        "bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)] border-[var(--color-border-default)] text-[var(--color-text-secondary)] cursor-pointer";
      content = (
        <>
          <span aria-hidden="true" className="text-[var(--color-text-tertiary)]">
            ○
          </span>
          <span>{t('realtime.idle')}</span>
        </>
      );
      ariaLabel = t('realtime.idleAriaLabel');
      isClickable = true;
      break;
    case "starting":
      variantClass =
        "bg-[var(--color-status-warn-bg)] border-[var(--color-status-warn-border)] text-[var(--color-status-warn-fg)] cursor-wait";
      content = showStartingSpinner ? (
        <>
          <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" />
          <span>{t('realtime.starting2')}</span>
        </>
      ) : (
        <>
          <span aria-hidden="true" className="text-[var(--color-status-warn-fg)]">
            ○
          </span>
          <span>{t('realtime.starting2')}</span>
        </>
      );
      ariaLabel = t('realtime.startingAriaLabel');
      break;
    case "watching":
      variantClass =
        "bg-[var(--color-status-success-fg)]/15 hover:bg-[var(--color-status-success-fg)]/25 border-[var(--color-status-success-border)]/40 text-[var(--color-status-success-fg)] cursor-pointer";
      content = (
        <>
          <StatusDot variant="emerald" pulse />
          <span>{t('realtime.watching')}</span>
          <StopCircle className="w-3.5 h-3.5 opacity-70" />
        </>
      );
      ariaLabel = t('realtime.watchingAriaLabel');
      isClickable = true;
      break;
    case "error":
      variantClass =
        "bg-[var(--color-button-danger-bg)]/15 hover:bg-[var(--color-button-danger-bg)]/25 border-[var(--color-status-error-border)] text-[var(--color-status-error-fg)] cursor-pointer";
      content = (
        <>
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{t('realtime.errorState')}</span>
          <RotateCw className="w-3.5 h-3.5 opacity-80" />
        </>
      );
      ariaLabel = t('realtime.errorStateAriaLabel');
      isClickable = true;
      break;
  }

  return (
    <button
      type="button"
      aria-live="polite"
      aria-label={ariaLabel}
      aria-disabled={!isClickable || undefined}
      disabled={!isClickable}
      onClick={handleClick}
      className={`${baseClass} ${variantClass} disabled:hover:bg-transparent`}
    >
      {content}
    </button>
  );
}
