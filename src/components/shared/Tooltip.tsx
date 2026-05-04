// 경량 자체 구현 Tooltip
// - hover + focus-within 시 표시
// - role="tooltip"
// - 자식은 단일 element 가정 (래퍼 div 로 감쌈)

import { useId, type ReactNode } from "react";

interface Props {
  content: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  // delay 는 CSS transition 으로 처리 — prop 은 호환성 위해 받지만 미사용
  delay?: number;
}

export function Tooltip({ content, children, disabled = false }: Props) {
  const id = useId();

  if (disabled || !content) {
    return <>{children}</>;
  }

  return (
    <span className="relative inline-flex group">
      {/* aria-describedby 연결을 위해 자식을 그대로 둠 — 시맨틱은 부모가 담당 */}
      {children}
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 whitespace-nowrap rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] px-2 py-1 text-[11px] text-[var(--color-text-primary)] shadow-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 motion-safe:transition-opacity motion-safe:duration-150"
      >
        {content}
      </span>
    </span>
  );
}
