// 실시간 로그 감시 관련 Tauri 이벤트 상수 및 페이로드 타입 정의

export const WATCH_EVENTS = {
  LINE_ADDED: "log-line-added",
  ROTATED: "log-watch-rotated",
  ERROR: "log-watch-error",
  STOPPED: "log-watch-stopped",
} as const;

export interface LineAddedPayload {
  sessionId: string;
  lines: string[];
  startOffset: number;
  endOffset: number;
  isInitial: boolean;
  droppedCount: number;
  batchSeq: number;
}

export interface RotatedPayload {
  sessionId: string;
  reason: "FILE_ID_CHANGED" | "TRUNCATED" | "RECREATED";
  previousOffset: number;
  newFileSize: number;
  rotatedAt: string;
}

export interface WatchErrorPayload {
  sessionId: string;
  error: { code: string; message: string };
  fatal: boolean;
}

export interface StoppedPayload {
  sessionId: string;
  // 백엔드가 항상 reason 을 보내지는 않으므로 optional 처리 (M-1)
  reason?: string;
}

export interface StartWatchResponse {
  sessionId: string;
  initialLines: string[];
  startOffset: number;
}
