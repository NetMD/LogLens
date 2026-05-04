interface Props {
  progress: number; // 0-100
  fileName: string;
}

export function ProgressBar({ progress, fileName }: Props) {
  return (
    <div className="w-full max-w-md space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--color-text-secondary)] truncate max-w-[280px]">{fileName}</span>
        <span className="text-[var(--color-text-tertiary)] ml-2 flex-shrink-0">{Math.round(progress)}%</span>
      </div>
      <div className="w-full h-1.5 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--color-accent-primary)] rounded-full transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-[var(--color-text-tertiary)] text-center">로그 파일 파싱 중...</p>
    </div>
  );
}
