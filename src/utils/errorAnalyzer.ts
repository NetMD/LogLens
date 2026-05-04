import type { LogEntry, LogLevel } from "./logParser";

export interface ErrorSummary {
  exceptionClass: string;
  count: number;
  firstOccurrence: string;
  lastOccurrence: string;
  sampleEntryId: string;
}

export interface TimelinePoint {
  hour: string; // "2024-01-15 14:00"
  ERROR: number;
  WARN: number;
  INFO: number;
}

export interface AnalysisResult {
  levelCounts: Record<LogLevel, number>;
  topErrors: ErrorSummary[];
  timeline: TimelinePoint[];
  totalEntries: number;
  parseFailCount: number;
}

const EMPTY_LEVEL_COUNTS = (): Record<LogLevel, number> => ({
  TRACE: 0,
  DEBUG: 0,
  INFO: 0,
  WARN: 0,
  ERROR: 0,
  FATAL: 0,
});

export function analyzeEntries(
  entries: LogEntry[],
  parseFailCount = 0
): AnalysisResult {
  const levelCounts = EMPTY_LEVEL_COUNTS();
  const exceptionMap = new Map<string, ErrorSummary>();
  const timelineMap = new Map<string, TimelinePoint>();

  for (const entry of entries) {
    levelCounts[entry.level]++;

    // Exception 유형별 집계
    if (entry.exceptionClass) {
      const existing = exceptionMap.get(entry.exceptionClass);
      if (existing) {
        existing.count++;
        existing.lastOccurrence = entry.timestamp;
      } else {
        exceptionMap.set(entry.exceptionClass, {
          exceptionClass: entry.exceptionClass,
          count: 1,
          firstOccurrence: entry.timestamp,
          lastOccurrence: entry.timestamp,
          sampleEntryId: entry.id,
        });
      }
    }

    // 시간대별 집계 (1시간 버킷)
    // timestamp: "2024-01-15 14:23:45.123" → hourKey: "2024-01-15 14:00"
    const hourKey = entry.timestamp.slice(0, 13) + ":00";
    const existing = timelineMap.get(hourKey);
    const tp = existing ?? { hour: hourKey, ERROR: 0, WARN: 0, INFO: 0 };

    if (entry.level === "ERROR" || entry.level === "FATAL") {
      tp.ERROR++;
    } else if (entry.level === "WARN") {
      tp.WARN++;
    } else {
      tp.INFO++;
    }

    if (!existing) timelineMap.set(hourKey, tp);
  }

  const topErrors = Array.from(exceptionMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const timeline = Array.from(timelineMap.values()).sort((a, b) =>
    a.hour.localeCompare(b.hour)
  );

  return {
    levelCounts,
    topErrors,
    timeline,
    totalEntries: entries.length,
    parseFailCount,
  };
}
