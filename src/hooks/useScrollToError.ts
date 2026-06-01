import { useCallback } from "react";
import { useLogStore } from "../store/logStore";
import { setActiveMainView } from "../store/uiStore";

export function useScrollToError() {
  const scrollToEntry = useCallback((entryId: string) => {
    const { activeFileId, patchTabUi } = useLogStore.getState();
    if (activeFileId) {
      patchTabUi(activeFileId, { selectedEntryId: entryId });
    }
    // 현재 탭의 stacktrace 뷰로 전환 (탭별 mainView 보존)
    setActiveMainView("stacktrace");

    // DOM에서 해당 엔트리로 스크롤 (가상화 폴백)
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
  }, []);

  return { scrollToEntry };
}
