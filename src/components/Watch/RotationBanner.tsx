// 로그 회전(rotation) 알림 배너 — 5초 자동 소멸 + progress 카운트다운

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUiStore, type RotationReason } from "../../store/uiStore";

// reason → i18n 키 매핑. 렌더 시점에 t() 적용.
const REASON_KEY: Record<RotationReason, string> = {
  FILE_ID_CHANGED: "realtime.rotationFileIdChanged",
  TRUNCATED: "realtime.rotationTruncated",
  RECREATED: "realtime.rotationRecreated",
};

const DURATION_MS = 5000;

export function RotationBanner() {
  const { t } = useTranslation();
  const banner = useUiStore((s) => s.rotationBanner);
  const dismiss = useUiStore((s) => s.dismissRotationBanner);
  const [progress, setProgress] = useState(100);

  // 진행률 애니메이션 (100 -> 0)
  useEffect(() => {
    if (!banner?.visible) {
      setProgress(100);
      return;
    }
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const elapsed = Date.now() - start;
      const remain = Math.max(0, 100 - (elapsed / DURATION_MS) * 100);
      setProgress(remain);
      if (remain > 0) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [banner?.visible]);

  if (!banner?.visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute left-1/2 -translate-x-1/2 bottom-20 z-10 bg-[var(--color-status-warn-bg)] border border-[var(--color-status-warn-border)]/60 text-[var(--color-status-warn-fg)] rounded-lg shadow-lg px-4 py-3 text-sm min-w-[280px] max-w-md"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true">!</span>
        <div className="flex-1">
          <p className="font-medium">{t(REASON_KEY[banner.reason])}</p>
          <p className="text-xs text-[var(--color-status-warn-fg)]/80 mt-0.5">
            {t('realtime.rotationContinue')}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-[var(--color-status-warn-fg)]/70 hover:text-[var(--color-status-warn-fg)] text-xs"
          aria-label={t('realtime.dismissNotification')}
        >
          {t('common.close')}
        </button>
      </div>
      <div className="mt-2 h-0.5 bg-[var(--color-status-warn-border)] rounded overflow-hidden">
        <div
          className="h-full bg-[var(--color-status-warn-fg)]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
