// 비교 기능 순차 파싱 오케스트레이션 훅
// A 파싱 완료 후 B 파싱 시작 (entryCounter 충돌 방지)
// 기존 useLogFile.ts 패턴을 기반으로 구현

import { Channel, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";
import { analyzeEntries } from "../utils/errorAnalyzer";
import { flushPending, parseBatch, resetParser, detectCsvFormat, preprocessCsvLines } from "../utils/logParser";
import type { LogEntry } from "../utils/logParser";
import { useComparisonStore } from "../store/comparisonStore";
import { compareAnalyses } from "../utils/comparisonAnalyzer";
import i18n from "../i18n";

// FileReadEvent: 기존 useLogFile.ts와 동일 타입
interface FileReadEvent {
  event: "Chunk" | "Completed" | "Error";
  data: {
    lines: string[];
    progress: number;
    total_lines?: number;
    message?: string;
  };
}

interface FileMetadata {
  size: number;
  name: string;
  path: string;
}

export function useComparisonFile() {
  const store = useComparisonStore; // static access for actions

  // --- 단일 side 파싱 (Promise 반환) ---
  const parseSingleFile = useCallback(
    async (side: "A" | "B", filePath: string): Promise<void> => {
      const s = store.getState();

      // 1. 메타데이터 조회
      let meta: FileMetadata;
      try {
        meta = await invoke<FileMetadata>("get_file_metadata", {
          path: filePath,
        });
      } catch (e) {
        s.setParseError(side, String(e));
        return;
      }

      // 2. side 초기화 + 메타 설정
      s.resetSide(side);
      s.setFileMeta(side, meta.name, meta.path, meta.size);

      // 3. 파서 리셋 (A만) + 파싱 시작
      // 설계 결정: A만 resetParser() 호출. B는 counter 이어감 -> entryId 유니크 보장
      if (side === "A") {
        resetParser();
      }
      s.setParsing(side, true);

      let pending: ReturnType<typeof parseBatch>["pending"] = null;
      const allEntries: LogEntry[] = [];
      let totalFailCount = 0;
      let isCsv: boolean | null = null;
      const csvRawLines: string[] = [];

      // 4. Channel 생성 + 메시지 핸들링
      const channel = new Channel<FileReadEvent>();

      return new Promise<void>((resolve, reject) => {
        channel.onmessage = (event) => {
          if (event.event === "Chunk") {
            let { lines, progress } = event.data;
            s.setProgress(side, progress);

            if (isCsv === null) isCsv = detectCsvFormat(lines);

            if (isCsv) {
              csvRawLines.push(...lines);
            } else {
              const result = parseBatch(lines, pending);
              pending = result.pending;
              totalFailCount += result.parseFailCount;
              if (result.entries.length > 0) {
                allEntries.push(...result.entries);
                s.appendEntries(side, result.entries);
              }
            }
          } else if (event.event === "Completed") {
            if (isCsv && csvRawLines.length > 0) {
              const extracted = preprocessCsvLines(csvRawLines, true);
              extracted.reverse();
              const BATCH = 500;
              for (let i = 0; i < extracted.length; i += BATCH) {
                const batch = extracted.slice(i, i + BATCH);
                const result = parseBatch(batch, pending);
                pending = result.pending;
                totalFailCount += result.parseFailCount;
                if (result.entries.length > 0) {
                  allEntries.push(...result.entries);
                  s.appendEntries(side, result.entries);
                }
              }
            }

            const lastEntries = flushPending(pending);
            if (lastEntries.length > 0) {
              allEntries.push(...lastEntries);
              s.appendEntries(side, lastEntries);
            }
            pending = null;

            const analysis = analyzeEntries(allEntries, totalFailCount);
            s.setAnalysis(side, analysis);

            // firstTimestamp 설정
            if (allEntries.length > 0) {
              s.setFirstTimestamp(side, allEntries[0].timestamp);
            }

            s.setProgress(side, 100);
            s.setParsing(side, false);
            resolve();
          } else if (event.event === "Error") {
            s.setParseError(side, event.data.message ?? i18n.t("common.unknownError"));
            reject(new Error(event.data.message));
          }
        };

        invoke("read_log_file", { path: filePath, onEvent: channel }).catch(
          (e) => {
            s.setParseError(side, String(e));
            reject(e);
          }
        );
      });
    },
    []
  );

  // --- 양쪽 순차 파싱 + 비교 결과 자동 계산 ---
  const startComparison = useCallback(
    async (pathA: string, pathB: string): Promise<void> => {
      // A 파싱
      try {
        await parseSingleFile("A", pathA);
      } catch {
        // A 실패 -> B 시도하지 않음
        return;
      }

      // B 파싱
      try {
        await parseSingleFile("B", pathB);
      } catch {
        return;
      }

      // 양쪽 완료 -> 비교 결과 계산
      const state = store.getState();
      if (state.fileA.analysis && state.fileB.analysis) {
        const result = compareAnalyses(
          state.fileA.analysis,
          state.fileB.analysis
        );
        state.setComparisonResult(result);
      }
    },
    [parseSingleFile]
  );

  // --- 파일 선택 (단일 side, 드래그앤드롭 또는 다이얼로그) ---
  const selectFile = useCallback(
    async (side: "A" | "B", filePath?: string): Promise<void> => {
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

      // 메타데이터 조회 (크기 검증 포함)
      let meta: FileMetadata;
      try {
        meta = await invoke<FileMetadata>("get_file_metadata", { path });
      } catch (e) {
        store.getState().setParseError(side, String(e));
        return;
      }

      const s = store.getState();
      s.setFileMeta(side, meta.name, meta.path, meta.size);

      // 양쪽 모두 파일이 선택되었고, 양쪽 모두 아직 분석 결과가 없으면 자동 파싱 시작
      const updated = store.getState();
      if (
        updated.fileA.filePath &&
        updated.fileB.filePath &&
        !updated.fileA.analysis &&
        !updated.fileB.analysis &&
        !updated.fileA.isParsing &&
        !updated.fileB.isParsing
      ) {
        await startComparison(updated.fileA.filePath, updated.fileB.filePath);
      }
    },
    [startComparison]
  );

  // --- 한쪽만 교체 파싱 ---
  const replaceSide = useCallback(
    async (side: "A" | "B"): Promise<void> => {
      const selected = await open({
        multiple: false,
        filters: [
          { name: "Log Files", extensions: ["log", "txt", "csv", "gz"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (!selected || typeof selected !== "string") return;

      // 교체 시에는 resetParser() 호출 (counter를 리셋하여 깨끗한 상태)
      resetParser();

      try {
        await parseSingleFile(side, selected);
      } catch {
        return;
      }

      // 비교 결과 재계산
      const state = store.getState();
      if (state.fileA.analysis && state.fileB.analysis) {
        const result = compareAnalyses(
          state.fileA.analysis,
          state.fileB.analysis
        );
        state.setComparisonResult(result);
      }
    },
    [parseSingleFile]
  );

  return { selectFile, replaceSide, parseSingleFile, startComparison };
}
