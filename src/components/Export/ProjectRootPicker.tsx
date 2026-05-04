// 프로젝트 루트 폴더 선택 UI
// plugin-dialog.open({ directory: true })로 폴더 선택 → exportStore.projectRoot 업데이트
// 선택 후 보안 배너 표시 (소스코드 AI 전송 경고)

import { useId, useState } from 'react';
import { FolderOpen, X, AlertTriangle } from 'lucide-react';

interface Props {
  projectRoot: string | null;
  onChange: (path: string | null) => void;
  disabled?: boolean;
}

export function ProjectRootPicker({ projectRoot, onChange, disabled }: Props) {
  const bannerId = useId();
  const [isPicking, setIsPicking] = useState(false);

  const handlePick = async () => {
    if (disabled || isPicking) return;
    setIsPicking(true);
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === 'string' && selected.length > 0) {
        onChange(selected);
      }
    } catch (e) {
      console.warn('[ProjectRootPicker] 폴더 선택 실패:', e);
    } finally {
      setIsPicking(false);
    }
  };

  const handleClear = () => {
    if (disabled) return;
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* 경로 표시 (readonly) */}
        <div
          className={`flex-1 min-w-0 bg-[var(--color-bg-elevated)] rounded-lg px-3 py-2 text-sm truncate ${
            projectRoot
              ? 'text-[var(--color-text-secondary)]'
              : 'text-[var(--color-text-disabled)]'
          }`}
          aria-describedby={projectRoot ? bannerId : undefined}
        >
          {projectRoot ?? '선택되지 않음'}
        </div>

        {/* 폴더 선택 버튼 */}
        <button
          type="button"
          onClick={handlePick}
          disabled={disabled || isPicking}
          className="px-3 py-2 text-xs rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none motion-safe:transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          폴더 선택
        </button>

        {/* 선택 해제 버튼 (선택된 상태에서만) */}
        {projectRoot && (
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            aria-label="선택 해제"
            className="p-2 rounded-lg text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)] disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none motion-safe:transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 보안 배너 (선택된 상태에서만) */}
      {projectRoot && (
        <div
          id={bannerId}
          role="note"
          className="flex items-start gap-1.5 text-xs text-[var(--color-status-warn-fg)] bg-[var(--color-status-warn-bg)] border border-[var(--color-status-warn-border)] border-[var(--color-status-warn-border)] rounded p-2 leading-relaxed"
        >
          <AlertTriangle
            className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
            aria-hidden="true"
          />
          <span>
            선택한 폴더의 Java/Kotlin 소스 파일이 AI 서버로 전송됩니다. 민감
            정보가 포함되지 않았는지 확인해 주세요.
          </span>
        </div>
      )}
    </div>
  );
}
