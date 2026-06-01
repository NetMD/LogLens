// 실시간 감시 모드에서 에러 패턴 분석 갱신 (주기/디바운스 300ms)
// - 활성 탭이 live 이고 mainView !== 'liveLog' 일 때만 활성화
// - entries 변화 시 300ms 디바운스로 analyzeEntries 실행 (활성 탭 스코프)

import { useEffect } from "react";
import { useLogStore } from "../store/logStore";
import { useActiveFile, useActiveFileEntries } from "../store/activeFileSelectors";
import { useMainView } from "../store/uiStore";
import { analyzeEntries } from "../utils/errorAnalyzer";

export function useLiveErrorAnalysis() {
  const activeFile = useActiveFile();
  const entries = useActiveFileEntries();
  const mainView = useMainView();
  const activeFileId = useLogStore((s) => s.activeFileId);

  const enabled = activeFile?.kind === "live" && mainView !== "liveLog";

  useEffect(() => {
    if (!enabled || !activeFileId) return;
    if (entries.length === 0) return;

    const handle = setTimeout(() => {
      const result = analyzeEntries(entries);
      useLogStore.getState().setAnalysis(activeFileId, result);
    }, 300);

    return () => clearTimeout(handle);
  }, [enabled, entries, activeFileId]);
}
