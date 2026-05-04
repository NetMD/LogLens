// 설정 모달 — 정보·오픈소스 라이선스 섹션
// 단순한 트리거. 모달은 OpenSourceLicensesModal 이 자체적으로 마운트/언마운트.

import { useState } from "react";
import { FileText } from "lucide-react";
import { OpenSourceLicensesModal } from "../OpenSourceLicensesModal";

export function AboutSection() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section>
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
        정보
      </h3>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-lg bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none transition-colors"
      >
        <span className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[var(--color-text-tertiary)]" />
          오픈소스 라이선스
        </span>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          보기 →
        </span>
      </button>

      <OpenSourceLicensesModal
        open={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </section>
  );
}
