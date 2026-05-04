import { useCallback } from "react";
import { useUiStore } from "../store/uiStore";

export function useScrollToError() {
  const setSelectedEntry = useUiStore((s) => s.setSelectedEntry);
  const requestModeChange = useUiStore((s) => s.requestModeChange);

  const scrollToEntry = useCallback(
    (entryId: string) => {
      setSelectedEntry(entryId);
      // 현재 모드를 유지한 채 stacktrace 뷰로 전환
      const { appMode } = useUiStore.getState();
      requestModeChange({ appMode, mainView: "stacktrace" });

      // DOM에서 해당 엔트리로 스크롤
      requestAnimationFrame(() => {
        const el = document.getElementById(`entry-${entryId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-[var(--color-border-focus)]");
          setTimeout(() => {
            el.classList.remove("ring-2", "ring-[var(--color-border-focus)]");
          }, 2000);
        }
      });
    },
    [setSelectedEntry, requestModeChange]
  );

  return { scrollToEntry };
}
