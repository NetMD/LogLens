import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileSearch, Radio, type LucideIcon } from "lucide-react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useLogFile } from "../../hooks/useLogFile";
import { useLogWatchActions } from "../../hooks/useLogWatch";
import { useLogStore } from "../../store/logStore";
import { ProgressBar } from "./ProgressBar";

export type LogDropZoneVariant = "file" | "live";

// VARIANT_CONFIG: 텍스트는 i18n 키 문자열로 저장. 렌더링 시점에 t() 로 변환.
interface VariantConfig {
  Icon: LucideIcon;
  iconClassName: string;
  dragBorderClass: string;
  dragBgClass: string;
  iconBoxActiveClass: string;
  iconColorClass: string;
  iconColorActiveClass: string;
  titleKey: string;
  subtitleKey: string;
  buttonLabelKey: string;
  buttonClass: string;
  ariaLabelKey: string;
}

const VARIANT_CONFIG: Record<LogDropZoneVariant, VariantConfig> = {
  file: {
    Icon: FileSearch,
    iconClassName: "",
    dragBorderClass: "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary-subtle-bg)] scale-[1.02]",
    dragBgClass: "bg-[var(--color-accent-primary-subtle-bg)]",
    iconBoxActiveClass: "bg-[var(--color-accent-primary-subtle-bg)]",
    iconColorClass: "text-[var(--color-text-tertiary)]",
    iconColorActiveClass: "text-[var(--color-accent-primary)]",
    titleKey: "fileAnalysis.dropzone",
    subtitleKey: "fileAnalysis.fileSubtitle",
    buttonLabelKey: "fileAnalysis.selectFile",
    buttonClass:
      "bg-[var(--color-button-primary-bg)] hover:bg-[var(--color-button-primary-bg)] border-[var(--color-accent-primary)] text-white",
    ariaLabelKey: "fileAnalysis.ariaLabelFile",
  },
  live: {
    Icon: Radio,
    iconClassName: "motion-safe:animate-pulse",
    dragBorderClass: "border-[var(--color-status-success-border)]/60 bg-[var(--color-status-success-fg)]/10 scale-[1.02]",
    dragBgClass: "bg-[var(--color-status-success-bg)]",
    iconBoxActiveClass: "bg-[var(--color-status-success-bg)]",
    iconColorClass: "text-[var(--color-text-tertiary)]",
    iconColorActiveClass: "text-[var(--color-status-success-fg)]",
    titleKey: "realtime.dropzone",
    subtitleKey: "realtime.dropzoneDesc",
    buttonLabelKey: "realtime.startWatch",
    buttonClass:
      "bg-[var(--color-status-success-fg)] hover:bg-[var(--color-status-success-fg)] border-[var(--color-status-success-border)] text-white",
    ariaLabelKey: "fileAnalysis.ariaLabelLive",
  },
};

interface Props {
  variant?: LogDropZoneVariant;
}

export function LogDropZone({ variant = "file" }: Props) {
  const { t } = useTranslation();
  const { loadFile } = useLogFile();
  const { start: startWatch } = useLogWatchActions();
  const isParsing = useLogStore((s) => s.isParsing);
  const progress = useLogStore((s) => s.progress);
  const fileName = useLogStore((s) => s.fileName);
  const parseError = useLogStore((s) => s.parseError);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  // 드롭 핸들러 내부에서 최신 variant 참조 (클로저 stale 방지)
  const variantRef = useRef<LogDropZoneVariant>(variant);
  useEffect(() => {
    variantRef.current = variant;
  }, [variant]);

  // variant 변경 시 에러 상태 초기화
  useEffect(() => {
    setError(null);
  }, [variant]);

  const config = useMemo(() => VARIANT_CONFIG[variant], [variant]);

  useEffect(() => {
    let cancelled = false;

    // Tauri 드롭 이벤트 등록 (절대 경로 확보)
    try {
      getCurrentWebviewWindow()
        .onDragDropEvent((event) => {
          if (cancelled) return;
          if (event.payload.type === "over") {
            setIsDragging(true);
          } else if (event.payload.type === "leave") {
            setIsDragging(false);
          } else if (event.payload.type === "drop") {
            setIsDragging(false);
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              setError(null);
              const currentVariant = variantRef.current;
              if (currentVariant === "live") {
                startWatch(paths[0]).catch((e) => setError(String(e)));
              } else {
                loadFile(paths[0]).catch((e) => setError(String(e)));
              }
            }
          }
        })
        .then((unlisten) => {
          if (cancelled) {
            unlisten();
          } else {
            unlistenRef.current = unlisten;
          }
        })
        .catch(() => {
          // Tauri 환경이 아닌 경우 무시
        });
    } catch {
      // Tauri 환경이 아닌 경우 무시
    }

    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
  }, [loadFile, startWatch]);

  const handleOpen = async () => {
    setError(null);
    try {
      if (variant === "live") {
        await startWatch();
      } else {
        await loadFile();
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const displayError = error || parseError;

  if (isParsing) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <ProgressBar progress={progress} fileName={fileName ?? ""} />
      </div>
    );
  }

  const Icon = config.Icon;

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div
        role="button"
        tabIndex={0}
        aria-label={t(config.ariaLabelKey)}
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void handleOpen();
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        className={`
          w-full max-w-lg border-2 border-dashed rounded-xl p-12 text-center
          motion-safe:transition-all motion-safe:duration-200 cursor-pointer select-none
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]
          ${
            isDragging
              ? config.dragBorderClass
              : "border-[var(--color-border-default)] hover:border-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-surface)]"
          }
        `}
      >
        <div className="flex flex-col items-center gap-5">
          {/* 아이콘 */}
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center motion-safe:transition-colors ${
              isDragging ? config.iconBoxActiveClass : "bg-[var(--color-bg-elevated)]"
            }`}
          >
            <Icon
              className={`w-8 h-8 ${
                isDragging ? config.iconColorActiveClass : config.iconColorClass
              } ${config.iconClassName}`}
              aria-hidden="true"
            />
          </div>

          <div className="space-y-1">
            <p className="text-base font-medium text-[var(--color-text-primary)]">
              {isDragging ? t('fileAnalysis.dropHere') : t(config.titleKey)}
            </p>
            <p className="text-sm text-[var(--color-text-tertiary)]">{t(config.subtitleKey)}</p>
          </div>

          {!isDragging && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleOpen();
              }}
              className={`mt-2 px-4 py-1.5 rounded-md text-sm font-medium border motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] ${config.buttonClass}`}
            >
              {t(config.buttonLabelKey)}
            </button>
          )}
        </div>
      </div>

      {displayError && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-lg px-4">
          <div className="bg-[var(--color-status-error-bg)] border border-[var(--color-status-error-border)] text-[var(--color-status-error-fg)] text-sm rounded-lg px-4 py-3 flex items-start gap-3">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
            <span>{displayError}</span>
          </div>
        </div>
      )}
    </div>
  );
}
