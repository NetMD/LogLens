import { Channel, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";
import { analyzeEntries } from "../utils/errorAnalyzer";
import { flushPending, parseBatch, detectCsvFormat, preprocessCsvLines } from "../utils/logParser";
import type { LogEntry } from "../utils/logParser";
import { useLogStore, runReclaimIfNeeded } from "../store/logStore";
import { useExportStore, isGenerating } from "../store/exportStore";
import { useUiStore } from "../store/uiStore";
import { useHistory } from "./useHistory";
import { toHistorySummary } from "../types/history";
import { toast } from "sonner";
import i18n from "../i18n";

interface FileReadChunk {
  lines: string[];
  progress: number;
}

interface FileReadEvent {
  event: "Chunk" | "Completed" | "Error";
  data: FileReadChunk & { total_lines?: number; message?: string };
}

interface FileMetadata {
  size: number;
  name: string;
  path: string;
}

// [setState throttle — 파일별]
// 매 500라인 배치마다 appendEntries(setState) 를 호출하면 30,000 라인에서 60회 setState.
// 200ms 간격으로 묶어 4~5회로 압축한다. Completed/Error 시 강제 flush.
// streamFileInto 가 fileId 단위로 호출되므로 throttle 버퍼는 클로저 로컬 = 파일별 자연 분리 (큐레이터 #4).
const FLUSH_INTERVAL_MS = 200;

/**
 * 회수된 탭/활성 탭 fileId 로 파일 내용을 스트리밍 파싱하여 store 에 채운다.
 * Raw 보기를 연 탭이면 rawSink 로 rawLines 도 함께 적재 (§5.1).
 */
export async function streamFileInto(
  fileId: string,
  path: string,
  opts?: { collectRaw?: boolean },
): Promise<void> {
  const {
    setParsing,
    setProgress,
    appendEntries,
    setAnalysis,
    setParseError,
    setRawLines,
  } = useLogStore.getState();

  performance.mark(`parse-start-${fileId}`);
  setParsing(fileId, true);
  setProgress(fileId, 0);

  let pending: ReturnType<typeof parseBatch>["pending"] = null;
  const allEntries: LogEntry[] = [];
  let totalFailCount = 0;
  let isCsv: boolean | null = null;
  const csvRawLines: string[] = [];

  // Raw 보기 연 탭: 고아·표준·멀티라인 전부 순서대로 수집 (A안 §5.1)
  const collectRaw = opts?.collectRaw === true;
  const rawBuffer: string[] = [];
  const rawSink = collectRaw ? (line: string) => rawBuffer.push(line) : undefined;

  // throttle 버퍼 (클로저 로컬 = 파일별)
  let pendingBuffer: LogEntry[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flushAppendBuffer = () => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (pendingBuffer.length > 0) {
      appendEntries(fileId, pendingBuffer);
      pendingBuffer = [];
    }
  };

  const scheduleAppend = (newEntries: LogEntry[]) => {
    if (newEntries.length === 0) return;
    pendingBuffer.push(...newEntries);
    if (flushTimer === null) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        if (pendingBuffer.length > 0) {
          appendEntries(fileId, pendingBuffer);
          pendingBuffer = [];
        }
      }, FLUSH_INTERVAL_MS);
    }
  };

  const channel = new Channel<FileReadEvent>();

  channel.onmessage = (event) => {
    if (event.event === "Chunk") {
      const { lines, progress } = event.data;
      setProgress(fileId, progress);

      if (isCsv === null) {
        isCsv = detectCsvFormat(lines);
      }

      if (isCsv) {
        // CSV: 라인 축적만 (파싱은 Completed 에서). Raw 원본 순서 = csvRawLines (Q-D5).
        csvRawLines.push(...lines);
      } else {
        const result = parseBatch(lines, pending, { rawSink, fileIdSalt: fileId });
        pending = result.pending;
        totalFailCount += result.parseFailCount;
        if (result.entries.length > 0) {
          allEntries.push(...result.entries);
          scheduleAppend(result.entries);
        }
      }
    } else if (event.event === "Completed") {
      // CSV: Raw 원본 순서는 csvRawLines (Q-D5). entries 는 추출+역전.
      if (isCsv && csvRawLines.length > 0) {
        if (rawSink) {
          for (const l of csvRawLines) rawSink(l);
        }
        const extracted = preprocessCsvLines(csvRawLines, true);
        extracted.reverse();
        const BATCH = 500;
        for (let i = 0; i < extracted.length; i += BATCH) {
          const batch = extracted.slice(i, i + BATCH);
          const result = parseBatch(batch, pending, { fileIdSalt: fileId });
          pending = result.pending;
          totalFailCount += result.parseFailCount;
          if (result.entries.length > 0) {
            allEntries.push(...result.entries);
            scheduleAppend(result.entries);
          }
        }
      }

      const lastEntries = flushPending(pending, fileId);
      if (lastEntries.length > 0) {
        allEntries.push(...lastEntries);
        scheduleAppend(lastEntries);
      }
      pending = null;

      flushAppendBuffer();

      const analysis = analyzeEntries(allEntries, totalFailCount);
      setAnalysis(fileId, analysis);
      if (totalFailCount > 0) {
        useLogStore.getState().incrementFailCount(fileId, totalFailCount);
      }
      if (collectRaw) {
        setRawLines(fileId, rawBuffer, "A");
      }

      setProgress(fileId, 100);
      setParsing(fileId, false);

      performance.mark(`parse-end-${fileId}`);
      try {
        performance.measure(`parse-${fileId}`, `parse-start-${fileId}`, `parse-end-${fileId}`);
      } catch {
        /* mark 부재 시 무시 */
      }

      // 예산 체크 (회수) — 진단 스트리밍/Export 생성 중 탭 보호 가드 주입 (planner §7-2)
      runReclaimIfNeeded((id) => {
        const diag = useUiStore.getState().diagnoses[id];
        if (diag?.isStreaming) return false;
        const exp = useExportStore.getState().byFile[id];
        if (exp && isGenerating(exp.generationStatus)) return false;
        return true;
      });
    } else if (event.event === "Error") {
      flushAppendBuffer();
      setParseError(fileId, event.data.message ?? i18n.t("common.unknownError"));
    }
  };

  try {
    await invoke("read_log_file", { path, onEvent: channel });
  } catch (e) {
    flushAppendBuffer();
    setParseError(fileId, String(e));
  }
}

/**
 * 회수된 탭(reclaimed=true)을 filePath 재파싱으로 무손실 복구 (BL-20, AC-02-3).
 */
export async function reparseReclaimed(fileId: string): Promise<void> {
  const f = useLogStore.getState().files[fileId];
  if (!f || !f.filePath) {
    if (f) {
      useLogStore.getState().setParseError(fileId, i18n.t("tabs.reclaimReloadFailed"));
    }
    return;
  }
  // reclaimed 플래그 해제 후 재스트리밍
  useLogStore.getState().patchTabUi(fileId, {});
  useLogStore.setState((state) => {
    const cur = state.files[fileId];
    if (!cur) return state;
    return { files: { ...state.files, [fileId]: { ...cur, reclaimed: false } } };
  });
  await streamFileInto(fileId, f.filePath);
}

export function useLogFile() {
  const { add: addHistory } = useHistory();

  /**
   * 드롭/파일선택 → 새 탭 추가 또는 기존 탭 포커스 (§3.2, BL-04/05).
   */
  const loadFileAsTab = useCallback(
    async (filePath?: string): Promise<void> => {
      let path = filePath;
      if (!path) {
        const selected = await open({
          multiple: false,
          filters: [
            { name: "Log Files", extensions: ["log", "txt", "csv", "gz"] },
            { name: "All Files", extensions: ["*"] },
          ],
        });
        if (!selected || typeof selected !== "string") return;
        path = selected;
      }

      // 1) 메타 선검사 (EX-01) — 실패 시 새 탭 생성 안 함
      let meta: FileMetadata;
      try {
        meta = await invoke<FileMetadata>("get_file_metadata", { path });
      } catch {
        toast.error(i18n.t("fileAnalysis.openFailed"));
        return;
      }

      // 2) filePath 정규화 + 재드롭 동일성 (BL-04)
      const norm = meta.path.replace(/\\/g, "/");
      const { files, fileOrder, addFileTab, setActiveFileId } =
        useLogStore.getState();
      const matched = fileOrder.find((id) => files[id].filePath === norm);
      if (matched) {
        setActiveFileId(matched); // 포커스 (새 탭 X, EX-02 무음)
        if (files[matched].reclaimed) {
          void reparseReclaimed(matched);
        }
        return;
      }

      // 3) 신규 탭 생성 + 활성화 + 파일별 스트리밍
      const fileId = crypto.randomUUID();
      addFileTab({
        fileId,
        kind: "file",
        fileName: meta.name,
        filePath: norm,
        fileSize: meta.size,
      });
      setActiveFileId(fileId);

      // export store 의 파일별 상태 초기화 + 보장
      useExportStore.getState().ensureFileState(fileId);

      await streamFileInto(fileId, path);

      // 히스토리 자동 저장 (파일 모드만, fire-and-forget)
      const done = useLogStore.getState().files[fileId];
      if (done && done.analysis) {
        try {
          addHistory({
            id: crypto.randomUUID(),
            analyzedAt: new Date().toISOString(),
            fileName: done.fileName ?? "unknown",
            filePath: done.filePath ?? "",
            fileSize: done.fileSize,
            summary: toHistorySummary(done.analysis),
          });
        } catch (e) {
          console.warn("[useLogFile] 히스토리 저장 실패:", e);
        }
      }
    },
    // store action 함수들은 Zustand가 안정 참조를 보장
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // 호환 alias: 기존 호출처(HistoryView 등)는 loadFile 사용
  return { loadFileAsTab, loadFile: loadFileAsTab };
}
