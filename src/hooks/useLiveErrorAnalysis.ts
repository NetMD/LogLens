// 실시간 감시 모드에서 에러 패턴 분석 갱신 (주기/디바운스 300ms)
// - appMode === 'live' 이고 mainView !== 'liveLog' 일 때만 활성화
// - entries 변화 시 300ms 디바운스로 analyzeEntries 실행

import { useEffect } from "react";
import { useLogStore } from "../store/logStore";
import { useUiStore } from "../store/uiStore";
import { analyzeEntries } from "../utils/errorAnalyzer";

export function useLiveErrorAnalysis() {
  const entries = useLogStore((s) => s.entries);
  const setAnalysis = useLogStore((s) => s.setAnalysis);
  const appMode = useUiStore((s) => s.appMode);
  const mainView = useUiStore((s) => s.mainView);

  const enabled = appMode === "live" && mainView !== "liveLog";

  useEffect(() => {
    if (!enabled) return;
    if (entries.length === 0) return;

    const handle = setTimeout(() => {
      const result = analyzeEntries(entries);
      setAnalysis(result);
    }, 300);

    return () => clearTimeout(handle);
  }, [enabled, entries, setAnalysis]);
}
