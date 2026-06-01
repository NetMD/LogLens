// 전역 단일 드롭 리스너 (App 레벨에서 1회만 마운트) — 설계 §3.1, FR-01/03
// onDragDropEvent 는 Webview 당 1개 (G-6: 정확히 1곳).
// 드롭 = 새 탭 추가, 같은 filePath 재드롭 → 기존 탭 포커스.
//
// [EXT-001(loglens) 적용] 클로저 stale 방지:
//   - loadFileAsTab/startWatchAsTab 은 ref 로 캡처(최신 참조)
//   - store 값은 핸들러 내부에서 useLogStore.getState() 직접 조회(클로저 캡처 금지)
//   - cancelled 플래그로 StrictMode 더블 effect 시 첫 등록 unlisten

import { useEffect, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useLogFile } from "./useLogFile";
import { useLogWatchActions } from "./useLogWatch";
import { useLogStore } from "../store/logStore";
import { useUiStore } from "../store/uiStore";

/**
 * 드롭 variant 판정 = payload.position 좌표 기반 (React hover 금지, NFR-A).
 * R13 1차: 윈도우 전역 단일 드롭이므로 활성 탭 kind 파생 기본.
 */
function resolveDropVariant(_position: {
  x: number;
  y: number;
}): "file" | "live" {
  const { activeFileId, files } = useLogStore.getState();
  const activeKind = activeFileId ? files[activeFileId]?.kind : undefined;
  return activeKind ?? "file";
}

export function useGlobalFileDrop(): void {
  const { loadFileAsTab } = useLogFile();
  const { startWatchAsTab } = useLogWatchActions();

  // ★ 핸들러가 항상 최신 값을 보도록 ref 캡처 (stale 방지)
  const loadRef = useRef(loadFileAsTab);
  loadRef.current = loadFileAsTab;
  const watchRef = useRef(startWatchAsTab);
  watchRef.current = startWatchAsTab;

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    getCurrentWebviewWindow()
      .onDragDropEvent((event) => {
        if (cancelled) return;
        if (event.payload.type !== "drop") return; // over/leave 무시
        // 비교 모드는 자체 분할 드롭존(A/B)이 좌표 판정을 담당하므로 전역 드롭은 양보 (G-6 화면 직교)
        if (useUiStore.getState().activeToolTab === "compare") return;
        const paths = event.payload.paths;
        if (!paths || paths.length === 0) return;
        // ★ variant 판정은 payload.position 좌표 (React hover 금지)
        const variant = resolveDropVariant(event.payload.position);
        if (variant === "live") {
          watchRef.current(paths[0]).catch(() => {
            /* 에러 토스트는 startWatchAsTab 내부 처리 */
          });
        } else {
          loadRef.current(paths[0]).catch(() => {
            /* 에러 토스트는 loadFileAsTab 내부 처리 */
          });
        }
      })
      .then((u) => {
        if (cancelled) u();
        else unlisten = u;
      })
      .catch(() => {
        /* non-Tauri 환경 무시 (EX-12) */
      });

    return () => {
      cancelled = true;
      unlisten?.(); // ★ unlisten 누수 방지 + StrictMode 더블 effect 가드
    };
    // ★ 의존성 빈 배열 + ref 캡처 → onDragDropEvent Webview당 1회만 등록 (G-6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
