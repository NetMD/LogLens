import type { StackFrame } from "../../utils/logParser";

interface Props {
  frame: StackFrame;
}

export function StackTraceLine({ frame }: Props) {
  return (
    <div
      className={`
        log-viewer-font text-xs px-4 py-0.5 leading-5
        ${frame.isUserCode
          ? "text-[var(--color-status-warn-fg)] dark:text-[var(--color-status-warn-fg)]"
          : "text-[var(--color-text-tertiary)]"
        }
      `}
    >
      <span className="text-[var(--color-text-disabled)]">at </span>
      {frame.isUserCode ? (
        <>
          <span className="text-[var(--color-status-warn-fg)] dark:text-[var(--color-status-warn-fg)]">{frame.className}</span>
          <span className="text-[var(--color-text-tertiary)]">.</span>
          <span className="text-[var(--color-status-warn-fg)] dark:text-[var(--color-status-warn-fg)]">{frame.methodName}</span>
          <span className="text-[var(--color-text-tertiary)]">(</span>
          <span className="text-[var(--color-status-warn-fg)] dark:text-[var(--color-status-warn-fg)]">{frame.fileName}:{frame.lineNumber}</span>
          <span className="text-[var(--color-text-tertiary)]">)</span>
        </>
      ) : (
        <span>{frame.raw}</span>
      )}
    </div>
  );
}
