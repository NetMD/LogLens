// @deprecated 이 컴포넌트는 더 이상 사용되지 않습니다.
// LogDropZone(variant='live')와 WatchStatusBadge 로 기능이 분리되었습니다.
// 신규 코드에서 import 하지 마세요 — 다음 PR 에서 삭제 예정.
//
// 실시간 감시 토글 버튼
// 상태별 variant: idle / starting / watching / error

import { FolderOpen, Loader2, RotateCw, StopCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLogWatchActions } from "../../hooks/useLogWatch";
import { useLogStore } from "../../store/logStore";
import { StatusDot } from "../shared/StatusDot";

// starting 상태가 50ms 이내에 끝나면 스피너 깜빡임 방지
const SPINNER_DELAY_MS = 50;

export function WatchToggleButton() {
  const watchMode = useLogStore((s) => s.watchMode);
  // 액션 전용 훅 사용 (이벤트 구독은 MainLayout 의 controller 에서 1회만)
  const { start, stop } = useLogWatchActions();

  const [showStartingSpinner, setShowStartingSpinner] = useState(false);
  const spinnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // starting 진입 후 50ms 이상 유지될 때만 스피너 표시
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

  const handleClick = () => {
    if (watchMode === "idle") {
      void start();
    } else if (watchMode === "watching") {
      void stop();
    } else if (watchMode === "error") {
      // 재시도
      const lastPath = useLogStore.getState().watchPath;
      void start(lastPath ?? undefined);
    }
    // starting 상태에서는 클릭 무시
  };

  const isPressed = watchMode === "watching" || watchMode === "starting";
  const disabled = watchMode === "starting" && !showStartingSpinner;

  const baseClass =
    "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border motion-safe:transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]/60";

  let variantClass = "";
  let content: React.ReactNode = null;

  switch (watchMode) {
    case "idle":
      variantClass =
        "bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)] border-[var(--color-border-default)] text-[var(--color-text-primary)]";
      content = (
        <>
          <FolderOpen className="w-4 h-4" />
          <span>파일 열기</span>
        </>
      );
      break;
    case "starting":
      variantClass =
        "bg-[var(--color-bg-elevated)] border-[var(--color-border-default)] text-[var(--color-text-secondary)] cursor-wait";
      content = showStartingSpinner ? (
        <>
          <Loader2 className="w-4 h-4 motion-safe:animate-spin" />
          <span>시작 중...</span>
        </>
      ) : (
        <>
          <FolderOpen className="w-4 h-4" />
          <span>파일 열기</span>
        </>
      );
      break;
    case "watching":
      variantClass =
        "bg-[var(--color-status-success-fg)]/15 hover:bg-[var(--color-status-success-fg)]/25 border-[var(--color-status-success-border)]/40 text-[var(--color-status-success-fg)]";
      content = (
        <>
          <StatusDot variant="emerald" pulse />
          <span>실시간</span>
          <StopCircle className="w-4 h-4 opacity-70" />
        </>
      );
      break;
    case "error":
      variantClass =
        "bg-[var(--color-button-danger-bg)]/15 hover:bg-[var(--color-button-danger-bg)]/25 border-[var(--color-status-error-border)] text-[var(--color-status-error-fg)]";
      content = (
        <>
          <RotateCw className="w-4 h-4" />
          <span>재시도</span>
        </>
      );
      break;
  }

  return (
    <button
      type="button"
      aria-pressed={isPressed}
      aria-label={
        watchMode === "watching"
          ? "실시간 감시 중지"
          : watchMode === "error"
            ? "감시 재시도"
            : "로그 파일 열어 실시간 감시 시작"
      }
      disabled={disabled}
      onClick={handleClick}
      className={`${baseClass} ${variantClass}`}
    >
      {content}
    </button>
  );
}
