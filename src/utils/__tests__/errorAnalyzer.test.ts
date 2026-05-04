import { describe, it, expect } from "vitest";
import { analyzeEntries } from "../errorAnalyzer";
import type { LogEntry } from "../logParser";

// ─────────────────────────────────────────────
// 헬퍼: LogEntry 생성
// ─────────────────────────────────────────────
function makeEntry(
  overrides: Partial<LogEntry> & { level: LogEntry["level"]; timestamp: string }
): LogEntry {
  const { level, timestamp, ...rest } = overrides;
  return {
    id: `${timestamp.replace(/[^0-9]/g, "")}-1`,
    timestamp,
    level,
    pid: 1,
    thread: "main",
    logger: "c.example.Test",
    message: "test message",
    stacktrace: [],
    rawLines: [],
    ...rest,
  };
}

// ─────────────────────────────────────────────
// TC-07: 빈 entries 배열 처리
// ─────────────────────────────────────────────
describe("TC-07 | 빈 entries 배열", () => {
  it("TC-07-1: 빈 배열 입력 시 모든 카운터 0", () => {
    const result = analyzeEntries([]);
    expect(result.totalEntries).toBe(0);
    expect(result.topErrors).toHaveLength(0);
    expect(result.timeline).toHaveLength(0);
    expect(result.levelCounts.ERROR).toBe(0);
    expect(result.levelCounts.WARN).toBe(0);
    expect(result.levelCounts.INFO).toBe(0);
    expect(result.levelCounts.TRACE).toBe(0);
    expect(result.levelCounts.DEBUG).toBe(0);
    expect(result.levelCounts.FATAL).toBe(0);
  });

  it("TC-07-2: parseFailCount 전달값이 결과에 반영됨", () => {
    const result = analyzeEntries([], 42);
    expect(result.parseFailCount).toBe(42);
  });
});

// ─────────────────────────────────────────────
// TC-08: 레벨별 카운팅
// ─────────────────────────────────────────────
describe("TC-08 | 레벨별 카운팅", () => {
  it("TC-08-1: 각 레벨 1개씩 — levelCounts 정확도", () => {
    const entries: LogEntry[] = [
      makeEntry({ level: "TRACE", timestamp: "2024-01-15 10:00:00.000" }),
      makeEntry({ level: "DEBUG", timestamp: "2024-01-15 10:01:00.000" }),
      makeEntry({ level: "INFO",  timestamp: "2024-01-15 10:02:00.000" }),
      makeEntry({ level: "WARN",  timestamp: "2024-01-15 10:03:00.000" }),
      makeEntry({ level: "ERROR", timestamp: "2024-01-15 10:04:00.000" }),
      makeEntry({ level: "FATAL", timestamp: "2024-01-15 10:05:00.000" }),
    ];
    const result = analyzeEntries(entries);
    expect(result.levelCounts.TRACE).toBe(1);
    expect(result.levelCounts.DEBUG).toBe(1);
    expect(result.levelCounts.INFO).toBe(1);
    expect(result.levelCounts.WARN).toBe(1);
    expect(result.levelCounts.ERROR).toBe(1);
    expect(result.levelCounts.FATAL).toBe(1);
    expect(result.totalEntries).toBe(6);
  });
});

// ─────────────────────────────────────────────
// TC-09: Exception 중복 집계 정확도
// ─────────────────────────────────────────────
describe("TC-09 | Exception 중복 집계", () => {
  it("TC-09-1: 동일 예외 3회 발생 → count=3", () => {
    const entries: LogEntry[] = [
      makeEntry({
        level: "ERROR",
        timestamp: "2024-01-15 10:00:00.000",
        exceptionClass: "java.lang.NullPointerException",
        exceptionMessage: "msg1",
      }),
      makeEntry({
        level: "ERROR",
        timestamp: "2024-01-15 10:01:00.000",
        exceptionClass: "java.lang.NullPointerException",
        exceptionMessage: "msg2",
      }),
      makeEntry({
        level: "ERROR",
        timestamp: "2024-01-15 10:02:00.000",
        exceptionClass: "java.lang.NullPointerException",
        exceptionMessage: "msg3",
      }),
    ];
    const result = analyzeEntries(entries);
    expect(result.topErrors).toHaveLength(1);
    expect(result.topErrors[0].count).toBe(3);
    expect(result.topErrors[0].exceptionClass).toBe("java.lang.NullPointerException");
  });

  it("TC-09-2: firstOccurrence와 lastOccurrence가 올바르게 기록됨", () => {
    const entries: LogEntry[] = [
      makeEntry({
        level: "ERROR",
        timestamp: "2024-01-15 10:00:00.000",
        exceptionClass: "com.example.MyException",
      }),
      makeEntry({
        level: "ERROR",
        timestamp: "2024-01-15 11:00:00.000",
        exceptionClass: "com.example.MyException",
      }),
    ];
    const result = analyzeEntries(entries);
    expect(result.topErrors[0].firstOccurrence).toBe("2024-01-15 10:00:00.000");
    expect(result.topErrors[0].lastOccurrence).toBe("2024-01-15 11:00:00.000");
  });

  it("TC-09-3: 서로 다른 예외는 별도 집계됨", () => {
    const entries: LogEntry[] = [
      makeEntry({
        level: "ERROR",
        timestamp: "2024-01-15 10:00:00.000",
        exceptionClass: "java.lang.NullPointerException",
      }),
      makeEntry({
        level: "ERROR",
        timestamp: "2024-01-15 10:01:00.000",
        exceptionClass: "java.lang.IllegalArgumentException",
      }),
    ];
    const result = analyzeEntries(entries);
    expect(result.topErrors).toHaveLength(2);
  });

  it("TC-09-4: exceptionClass 없는 엔트리는 집계에서 제외됨", () => {
    const entries: LogEntry[] = [
      makeEntry({ level: "ERROR", timestamp: "2024-01-15 10:00:00.000" }),
      makeEntry({ level: "ERROR", timestamp: "2024-01-15 10:01:00.000" }),
    ];
    const result = analyzeEntries(entries);
    expect(result.topErrors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// TC-10: Top 10 슬라이싱
// ─────────────────────────────────────────────
describe("TC-10 | Top 10 초과 시 슬라이싱", () => {
  it("TC-10-1: 예외 15종 입력 시 topErrors는 10개만 반환", () => {
    const entries: LogEntry[] = Array.from({ length: 15 }, (_, i) =>
      makeEntry({
        level: "ERROR",
        timestamp: `2024-01-15 10:0${String(i).padStart(1, "0")}:00.000`,
        exceptionClass: `com.example.Exception${i}`,
      })
    );
    const result = analyzeEntries(entries);
    expect(result.topErrors.length).toBeLessThanOrEqual(10);
  });

  it("TC-10-2: topErrors는 count 내림차순 정렬", () => {
    const entries: LogEntry[] = [
      ...Array.from({ length: 3 }, () =>
        makeEntry({
          level: "ERROR",
          timestamp: "2024-01-15 10:00:00.000",
          exceptionClass: "com.example.FrequentException",
        })
      ),
      makeEntry({
        level: "ERROR",
        timestamp: "2024-01-15 10:01:00.000",
        exceptionClass: "com.example.RareException",
      }),
    ];
    const result = analyzeEntries(entries);
    expect(result.topErrors[0].exceptionClass).toBe("com.example.FrequentException");
    expect(result.topErrors[0].count).toBe(3);
    expect(result.topErrors[1].count).toBe(1);
  });
});

// ─────────────────────────────────────────────
// TC-11: 시간대별 버킷 (timeline)
// ─────────────────────────────────────────────
describe("TC-11 | 시간대별 버킷 및 정렬", () => {
  it("TC-11-1: 같은 시간대 엔트리가 하나의 버킷으로 집계됨", () => {
    const entries: LogEntry[] = [
      makeEntry({ level: "ERROR", timestamp: "2024-01-15 14:10:00.000" }),
      makeEntry({ level: "WARN",  timestamp: "2024-01-15 14:30:00.000" }),
      makeEntry({ level: "INFO",  timestamp: "2024-01-15 14:55:00.000" }),
    ];
    const result = analyzeEntries(entries);
    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0].hour).toBe("2024-01-15 14:00");
    expect(result.timeline[0].ERROR).toBe(1);
    expect(result.timeline[0].WARN).toBe(1);
    expect(result.timeline[0].INFO).toBe(1);
  });

  it("TC-11-2: FATAL 레벨은 ERROR 버킷에 합산됨", () => {
    const entries: LogEntry[] = [
      makeEntry({ level: "FATAL", timestamp: "2024-01-15 14:00:00.000" }),
      makeEntry({ level: "ERROR", timestamp: "2024-01-15 14:01:00.000" }),
    ];
    const result = analyzeEntries(entries);
    expect(result.timeline[0].ERROR).toBe(2);
  });

  it("TC-11-3: 여러 시간대는 시간순 오름차순 정렬", () => {
    const entries: LogEntry[] = [
      makeEntry({ level: "INFO", timestamp: "2024-01-15 16:00:00.000" }),
      makeEntry({ level: "INFO", timestamp: "2024-01-15 14:00:00.000" }),
      makeEntry({ level: "INFO", timestamp: "2024-01-15 15:00:00.000" }),
    ];
    const result = analyzeEntries(entries);
    expect(result.timeline[0].hour).toBe("2024-01-15 14:00");
    expect(result.timeline[1].hour).toBe("2024-01-15 15:00");
    expect(result.timeline[2].hour).toBe("2024-01-15 16:00");
  });

  it("TC-11-4: hourKey 슬라이싱 정확도 — 분/초가 :00으로 버킷화됨", () => {
    const entries: LogEntry[] = [
      makeEntry({ level: "INFO", timestamp: "2024-01-15 09:59:59.999" }),
    ];
    const result = analyzeEntries(entries);
    expect(result.timeline[0].hour).toBe("2024-01-15 09:00");
  });
});
