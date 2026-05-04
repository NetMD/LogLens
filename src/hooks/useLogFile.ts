import { Channel, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";
import { analyzeEntries } from "../utils/errorAnalyzer";
import { flushPending, parseBatch, resetParser, detectCsvFormat, preprocessCsvLines } from "../utils/logParser";
import type { LogEntry } from "../utils/logParser";
import { useLogStore } from "../store/logStore";
import { useUiStore } from "../store/uiStore";
import { useExportStore } from "../store/exportStore";
import { useHistory } from "./useHistory";
import { toHistorySummary } from "../types/history";

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

export function useLogFile() {
  // store actions는 Zustand가 안정적으로 유지하므로 개별 구독
  const reset = useLogStore((s) => s.reset);
  const setFile = useLogStore((s) => s.setFile);
  const setParsing = useLogStore((s) => s.setParsing);
  const setProgress = useLogStore((s) => s.setProgress);
  const appendEntries = useLogStore((s) => s.appendEntries);
  const setAnalysis = useLogStore((s) => s.setAnalysis);
  const setParseError = useLogStore((s) => s.setParseError);

  const { add: addHistory } = useHistory();

  const loadFile = useCallback(async (
    filePath?: string,
    options?: { preserveProTab?: boolean },
  ): Promise<void> => {
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

    let meta: FileMetadata;
    try {
      meta = await invoke<FileMetadata>("get_file_metadata", { path });
    } catch (e) {
      setParseError(String(e));
      return;
    }

    reset();
    resetParser();
    setFile(meta.name, meta.path, meta.size);
    // 새 파일 로드 시 export store의 파일별 상태(제목/파일명/히스토리 fallback) 초기화
    useExportStore.setState({
      title: '',
      saveFileName: '',
      isFromHistory: false,
    });
    setParsing(true);
    // 파일 모드 진입 (이미 동일 모드면 무해)
    // preserveProTab: ExportView 등에서 호출 시 현재 분석 도구 탭(activeToolTab)을 유지
    if (!options?.preserveProTab) {
      useUiStore.getState().requestModeChange({
        appMode: "file",
        mainView: "stacktrace",
      });
    } else {
      useUiStore.getState().setAppMode("file");
    }

    let pending: ReturnType<typeof parseBatch>["pending"] = null;
    const allEntries: LogEntry[] = [];
    let totalFailCount = 0;
    let isCsv: boolean | null = null; // null = 미감지, true/false = 확정
    // CSV 모드에서는 역순 파일이므로 모든 라인을 모아서 Completed 시점에 역전 후 파싱
    const csvRawLines: string[] = [];

    // [setState throttle]
    // 매 500라인 배치마다 appendEntries(setState)를 호출하면 30,000 라인에서 60회 setState → React reconciliation 누적 비용 발생.
    // 200ms 간격으로 묶어 4~5회로 압축한다. Completed/Error 시 강제 flush 로 잔여 entries 손실 방지.
    // TODO(backlog): 동일 패턴이 useLogWatch / useComparisonFile 에도 적용 가능 — 거대한 라이브 스트림이나 큰 비교 파일에서 같은 멈춤이 보고되면 적용 검토.
    const FLUSH_INTERVAL_MS = 200;
    let pendingBuffer: LogEntry[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushAppendBuffer = () => {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (pendingBuffer.length > 0) {
        appendEntries(pendingBuffer);
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
            appendEntries(pendingBuffer);
            pendingBuffer = [];
          }
        }, FLUSH_INTERVAL_MS);
      }
    };

    const channel = new Channel<FileReadEvent>();

    channel.onmessage = (event) => {
      if (event.event === "Chunk") {
        let { lines, progress } = event.data;
        setProgress(progress);

        // CSV 감지 (첫 배치에서 1회만)
        if (isCsv === null) {
          isCsv = detectCsvFormat(lines);
        }

        if (isCsv) {
          // CSV: 라인 축적만 (파싱은 Completed 에서)
          csvRawLines.push(...lines);
        } else {
          // 일반 로그: 즉시 파싱
          const result = parseBatch(lines, pending);
          pending = result.pending;
          totalFailCount += result.parseFailCount;
          if (result.entries.length > 0) {
            allEntries.push(...result.entries);
            scheduleAppend(result.entries);
          }
        }
      } else if (event.event === "Completed") {
        // CSV 모드: 축적된 라인을 전처리(content 추출) → 역전 → 일괄 파싱
        if (isCsv && csvRawLines.length > 0) {
          const extracted = preprocessCsvLines(csvRawLines, true);
          extracted.reverse();
          // 500라인씩 배치로 나눠 파싱 (메모리 peak 관리)
          const BATCH = 500;
          for (let i = 0; i < extracted.length; i += BATCH) {
            const batch = extracted.slice(i, i + BATCH);
            const result = parseBatch(batch, pending);
            pending = result.pending;
            totalFailCount += result.parseFailCount;
            if (result.entries.length > 0) {
              allEntries.push(...result.entries);
              scheduleAppend(result.entries);
            }
          }
        }

        const lastEntries = flushPending(pending);
        if (lastEntries.length > 0) {
          allEntries.push(...lastEntries);
          scheduleAppend(lastEntries);
        }
        pending = null;

        // 잔여 throttle 버퍼를 분석 직전에 강제 flush — analyzeEntries 는 allEntries 를 직접 받지만,
        // 화면 표시는 store entries 기준이므로 setAnalysis 시점에 store 도 최신화되어 있어야 함.
        flushAppendBuffer();

        const analysis = analyzeEntries(allEntries, totalFailCount);
        setAnalysis(analysis);

        // [히스토리 자동 저장 -- fire-and-forget]
        // 조건: 파일 모드만 (live 모드 제외)
        const currentAppMode = useUiStore.getState().appMode;
        if (currentAppMode === 'file') {
          const { fileName: fName, filePath: fPath, fileSize: fSize } = useLogStore.getState();
          try {
            addHistory({
              id: crypto.randomUUID(),
              analyzedAt: new Date().toISOString(),
              fileName: fName ?? 'unknown',
              filePath: fPath ?? '',
              fileSize: fSize,
              summary: toHistorySummary(analysis),
            });
          } catch (e) {
            console.warn('[useLogFile] 히스토리 저장 실패:', e);
          }
        }

        setProgress(100);
        setParsing(false);
      } else if (event.event === "Error") {
        // 에러 시에도 잔여 throttle 버퍼는 사용자에게 보여주는 것이 디버깅에 유리 (부분 결과 보존)
        flushAppendBuffer();
        setParseError(event.data.message ?? "알 수 없는 오류");
      }
    };

    try {
      await invoke("read_log_file", { path, onEvent: channel });
    } catch (e) {
      // invoke 자체 실패 시에도 잔여 버퍼 정리
      flushAppendBuffer();
      setParseError(String(e));
    }
  // store action 함수들은 Zustand가 안정 참조를 보장하므로 의존성 배열 불필요
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { loadFile };
}
