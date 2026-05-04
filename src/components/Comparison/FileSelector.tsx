// 비교용 파일 선택 컴포넌트 (5상태 UI)
// idle: 드래그앤드롭 + 클릭 영역
// parsing: 파일명 + 크기 + 프로그레스 바
// completed: 체크 아이콘 + 파일 정보 + 통계 + [교체] 버튼
// error: 경고 아이콘 + 에러 메시지 + [재시도] 버튼
// waiting: 파일명 + 크기 + 미니 스피너 + 대기 안내

import {
  FileSearch,
  Check,
  AlertTriangle,
  RefreshCw,
  Loader2,
  X,
} from "lucide-react";
import type { ComparisonFileState } from "../../store/comparisonStore";

// --- Props ---

interface FileSelectorProps {
  side: "A" | "B";
  fileState: ComparisonFileState;
  otherSideState: ComparisonFileState;
  onFileSelect: (side: "A" | "B", filePath?: string) => void;
  onReplace: (side: "A" | "B") => void;
  onClear: (side: "A" | "B") => void;
  onDragHover: (side: "A" | "B") => void;
  isDragTarget: boolean;
  disabled?: boolean;
}

// --- A/B 색상 상수 ---

const SIDE_COLORS = {
  A: {
    badge: "bg-[var(--color-button-primary-bg)]/20 text-[var(--color-accent-primary)]",
    button: "bg-[var(--color-button-primary-bg)] hover:bg-[var(--color-button-primary-bg)] text-white",
    progress: "bg-[var(--color-accent-primary)]",
    dragBorder: "border-[var(--color-accent-primary)]",
    dragBg: "bg-[var(--color-accent-primary-subtle-bg)]",
  },
  B: {
    badge: "bg-[var(--color-status-success-fg)]/20 text-[var(--color-status-success-fg)]",
    button: "bg-[var(--color-status-success-fg)] hover:bg-[var(--color-status-success-fg)] text-white",
    progress: "bg-[var(--color-status-success-fg)]",
    dragBorder: "border-[var(--color-status-success-border)]/60",
    dragBg: "bg-[var(--color-status-success-fg)]/10",
  },
} as const;

// --- 상태 결정 로직 ---

type FileSelectorState = "idle" | "selected" | "parsing" | "completed" | "error" | "waiting";

function getState(
  fileState: ComparisonFileState,
  side: "A" | "B",
  otherSideState: ComparisonFileState
): FileSelectorState {
  if (fileState.parseError) return "error";
  if (fileState.isParsing) return "parsing";
  if (fileState.analysis) return "completed";
  // waiting: B가 파일 선택됨 + A가 아직 파싱 중
  if (side === "B" && fileState.filePath && otherSideState.isParsing)
    return "waiting";
  // selected: 파일 선택됨 + 아직 파싱 시작 전 (상대쪽 미선택)
  if (fileState.filePath) return "selected";
  return "idle";
}

// --- 파일 크기 포맷 ---

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// --- 메인 컴포넌트 ---

export function FileSelector({
  side,
  fileState,
  otherSideState,
  onFileSelect,
  onReplace,
  onClear,
  onDragHover,
  isDragTarget,
  disabled,
}: FileSelectorProps) {
  const state = getState(fileState, side, otherSideState);
  const colors = SIDE_COLORS[side];

  // 키보드 접근성: Enter/Space로 파일 선택
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onFileSelect(side);
    }
  };

  // --- idle 상태 ---
  if (state === "idle") {
    const containerClass = isDragTarget
      ? `border-2 border-dashed ${colors.dragBorder} ${colors.dragBg} scale-[1.01]`
      : "border-2 border-dashed border-[var(--color-border-default)]";

    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={`파일 ${side} 선택`}
        className={`${containerClass} rounded-xl p-8 min-h-[280px]
          flex flex-col items-center justify-center relative
          cursor-pointer transition-all duration-200
          hover:border-[var(--color-text-tertiary)]
          focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none
          ${disabled ? "opacity-50 pointer-events-none" : ""}`}
        onClick={() => onFileSelect(side)}
        onKeyDown={handleKeyDown}
        onDragEnter={() => onDragHover(side)}
        onDragOver={(e) => e.preventDefault()}
      >
        {/* 사이드 뱃지 */}
        <span
          className={`absolute top-3 left-3 text-xs font-semibold rounded px-2 py-0.5 ${colors.badge}`}
        >
          {side}
        </span>

        {/* 아이콘 */}
        <div className="w-14 h-14 rounded-xl bg-[var(--color-bg-elevated)] flex items-center justify-center mb-4">
          <FileSearch className="w-7 h-7 text-[var(--color-text-tertiary)]" />
        </div>

        {/* 안내 텍스트 */}
        <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
          파일 {side}
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
          파일을 드래그하거나 클릭하세요
        </p>
        <p className="text-xs text-[var(--color-text-disabled)] mb-4">
          .log, .txt, .csv — 최대 500MB
        </p>

        {/* 파일 선택 버튼 */}
        <button
          className={`px-4 py-1.5 rounded-md text-sm font-medium ${colors.button}`}
          onClick={(e) => {
            e.stopPropagation();
            onFileSelect(side);
          }}
        >
          파일 선택
        </button>
      </div>
    );
  }

  // --- selected 상태 (파일 선택됨, 파싱 대기) ---
  if (state === "selected") {
    return (
      <div
        className="border-2 border-solid border-[var(--color-border-default)] rounded-xl p-8 min-h-[280px]
          flex flex-col items-center justify-center relative"
        onDragEnter={() => onDragHover(side)}
        onDragOver={(e) => e.preventDefault()}
      >
        <span
          className={`absolute top-3 left-3 text-xs font-semibold rounded px-2 py-0.5 ${colors.badge}`}
        >
          {side}
        </span>

        {/* 교체 / 해제 버튼 */}
        <div className="absolute top-3 right-3 flex items-center gap-1">
          <button
            className="text-xs px-2 py-1 rounded
              border border-[var(--color-border-default)]
              text-[var(--color-text-tertiary)]
              hover:text-[var(--color-text-secondary)]
              hover:bg-[var(--color-bg-hover)]"
            onClick={() => onFileSelect(side)}
            aria-label={`파일 ${side} 교체`}
          >
            <RefreshCw className="w-3 h-3 inline mr-1" />
            교체
          </button>
          <button
            className="text-xs px-2 py-1 rounded
              border border-[var(--color-status-error-border)]/40
              text-[var(--color-status-error-fg)]/70
              hover:text-[var(--color-status-error-fg)]
              hover:bg-[var(--color-status-error-bg)]"
            onClick={() => onClear(side)}
            aria-label={`파일 ${side} 해제`}
          >
            <X className="w-3 h-3 inline mr-1" />
            해제
          </button>
        </div>

        {/* 파일 정보 */}
        <div className="w-14 h-14 rounded-xl bg-[var(--color-bg-elevated)] flex items-center justify-center mb-4">
          <Check className="w-7 h-7 text-[var(--color-accent-success)]" />
        </div>

        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate max-w-full mb-1">
          {fileState.fileName}
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
          {formatFileSize(fileState.fileSize)}
        </p>

        <p className="text-xs text-[var(--color-text-disabled)]">
          {side === "A" ? "파일 B를 선택하면 비교를 시작합니다" : "파일 A를 선택하면 비교를 시작합니다"}
        </p>
      </div>
    );
  }

  // --- parsing 상태 ---
  if (state === "parsing") {
    return (
      <div
        className="border-2 border-solid border-[var(--color-border-default)] rounded-xl p-8 min-h-[280px]
          flex flex-col items-center justify-center relative"
        onDragEnter={() => onDragHover(side)}
        onDragOver={(e) => e.preventDefault()}
      >
        <span
          className={`absolute top-3 left-3 text-xs font-semibold rounded px-2 py-0.5 ${colors.badge}`}
        >
          {side}
        </span>

        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate max-w-full mb-1">
          {fileState.fileName}
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
          {formatFileSize(fileState.fileSize)}
        </p>

        {/* 프로그레스 바 */}
        <div className="w-full max-w-xs">
          <div
            className="w-full h-1.5 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={fileState.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`파일 ${side} 파싱 진행률`}
          >
            <div
              className={`h-full ${colors.progress} rounded-full transition-all duration-150`}
              style={{ width: `${fileState.progress}%` }}
            />
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] text-center mt-2">
            {Math.round(fileState.progress)}%
          </p>
        </div>

        <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
          파싱 중...
        </p>
      </div>
    );
  }

  // --- completed 상태 ---
  if (state === "completed") {
    const analysis = fileState.analysis!;
    const errorCount =
      analysis.levelCounts.ERROR + analysis.levelCounts.FATAL;
    const warnCount = analysis.levelCounts.WARN;

    return (
      <div
        className="border border-solid border-[var(--color-border-default)] rounded-xl p-4
          bg-[var(--color-bg-surface)] relative"
        onDragEnter={() => onDragHover(side)}
        onDragOver={(e) => e.preventDefault()}
      >
        {/* 사이드 뱃지 */}
        <span
          className={`absolute top-3 left-3 text-xs font-semibold rounded px-2 py-0.5 ${colors.badge}`}
        >
          {side}
        </span>

        {/* 교체 버튼 */}
        <button
          className="absolute top-3 right-3 text-xs px-2 py-1 rounded
            border border-[var(--color-border-default)]
            text-[var(--color-text-tertiary)]
            hover:text-[var(--color-text-secondary)]
            hover:bg-[var(--color-bg-hover)]"
          onClick={() => onReplace(side)}
          aria-label={`파일 ${side} 교체`}
        >
          <RefreshCw className="w-3 h-3 inline mr-1" />
          교체
        </button>

        {/* 파일 정보 */}
        <div className="mt-6">
          <div className="flex items-center gap-1.5 mb-1">
            <Check className="w-4 h-4 text-[var(--color-accent-success)]" />
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {fileState.fileName}
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {formatFileSize(fileState.fileSize)}
          </p>
          {fileState.firstTimestamp && (
            <p className="text-xs text-[var(--color-text-tertiary)] font-mono">
              {fileState.firstTimestamp}
            </p>
          )}
        </div>

        {/* 통계 */}
        <div className="mt-2">
          <p className="text-xs text-[var(--color-text-secondary)]">
            전체 {analysis.totalEntries.toLocaleString()}건
          </p>
          <p className="text-xs">
            <span className="text-[var(--color-status-error-fg)]">
              ERROR {errorCount.toLocaleString()}
            </span>
            {" | "}
            <span className="text-[var(--color-status-warn-fg)]">
              WARN {warnCount.toLocaleString()}
            </span>
          </p>
          {analysis.totalEntries === 0 && (
            <p className="text-xs text-[var(--color-status-warn-fg)] mt-1">
              인식된 로그 항목이 없습니다
            </p>
          )}
        </div>
      </div>
    );
  }

  // --- error 상태 ---
  if (state === "error") {
    return (
      <div
        className="border-2 border-dashed border-[var(--color-status-error-border)]/50 rounded-xl p-8 min-h-[280px]
          bg-[var(--color-status-error-bg)] flex flex-col items-center justify-center relative"
        onDragEnter={() => onDragHover(side)}
        onDragOver={(e) => e.preventDefault()}
      >
        <span
          className={`absolute top-3 left-3 text-xs font-semibold rounded px-2 py-0.5 ${colors.badge}`}
        >
          {side}
        </span>

        {/* 재시도 버튼 */}
        <button
          className="absolute top-3 right-3 text-xs px-2 py-1 rounded
            border border-[var(--color-status-error-border)]/50
            text-[var(--color-status-error-fg)] hover:bg-[var(--color-status-error-bg)]"
          onClick={() => onFileSelect(side)}
        >
          재시도
        </button>

        <AlertTriangle className="w-5 h-5 text-[var(--color-accent-danger)] mb-2" />
        <p className="text-sm font-medium text-[var(--color-status-error-fg)] mb-1">파싱 실패</p>
        <p className="text-xs text-[var(--color-status-error-fg)]/80 text-center max-w-[240px]">
          {fileState.parseError}
        </p>
      </div>
    );
  }

  // --- waiting 상태 (B가 A 파싱 완료를 대기) ---
  return (
    <div
      className="border-2 border-solid border-[var(--color-border-default)] rounded-xl p-8 min-h-[280px]
        flex flex-col items-center justify-center relative"
      onDragEnter={() => onDragHover(side)}
      onDragOver={(e) => e.preventDefault()}
    >
      <span
        className={`absolute top-3 left-3 text-xs font-semibold rounded px-2 py-0.5 ${colors.badge}`}
      >
        {side}
      </span>

      <p className="text-sm font-medium text-[var(--color-text-primary)] truncate max-w-full mb-1">
        {fileState.fileName}
      </p>
      <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
        {formatFileSize(fileState.fileSize)}
      </p>

      <div className="flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin text-[var(--color-status-success-fg)]" />
        <span className="text-xs text-[var(--color-text-tertiary)]">
          A 파싱 완료 후 시작됩니다
        </span>
      </div>
    </div>
  );
}
