// Raw 보기 B안 (>100MB) Rust 윈도우 읽기 IPC 계약 (FE 측, PM 사전결정 #2 / §5.2)
// dev-backend 의 src-tauri/src/contracts/raw_view.rs 와 1:1 대응.
// command 시그니처: build_raw_line_index(path) / read_raw_window(sessionId, startLine, endLine)

export const RAW_VIEW_COMMANDS = {
  BUILD_LINE_INDEX: "build_raw_line_index",
  READ_RAW_WINDOW: "read_raw_window",
} as const;

/**
 * build_raw_line_index(path) → 라인 인덱스 1회 풀스캔.
 * Rust 가 오프셋 배열 보관(세션), FE 엔 메타만.
 * payload sample: { "sessionId": "a1b2...", "lineCount": 4370000, "fileSize": 524288000 }
 */
export interface LineIndexMeta {
  sessionId: string; // raw 인덱스 세션 식별자
  lineCount: number; // 총 라인 수 (가상 스크롤 높이 산정 — virtualizer count)
  fileSize: number;
}

/**
 * read_raw_window(sessionId, startLine, endLine) → 해당 라인들만.
 * payload sample: { "startLine": 12000, "lines": ["2024-01-15 14:23:45.123  INFO ...", "..."] }
 */
export interface RawWindowResponse {
  startLine: number;
  lines: string[]; // [startLine, endLine) 구간 라인 (개행 제거)
}
