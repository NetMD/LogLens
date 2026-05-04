// 두 AnalysisResult를 비교하는 순수 함수
// 입력: AnalysisResult A, B
// 출력: ComparisonResult (레벨별 증감, 예외 병합, 에러 비율)

import type { AnalysisResult, ErrorSummary } from "./errorAnalyzer";

// --- 출력 타입 ---

/** 증감 유형: increase(위험 증가), decrease(개선), neutral(중립), none(변화 없음) */
export type DeltaType = "increase" | "decrease" | "neutral" | "none";

/** 레벨별 증감 데이터 */
export interface LevelDelta {
  level: string; // "전체" | "ERROR" | "WARN" | "INFO"
  countA: number;
  countB: number;
  delta: number; // B - A
  deltaType: DeltaType;
}

/** 예외 클래스별 증감 데이터 */
export interface ExceptionDelta {
  exceptionClass: string;
  countA: number;
  countB: number;
  delta: number;
  presence: "both" | "onlyA" | "onlyB";
  sampleEntryIdA?: string;
  sampleEntryIdB?: string;
}

/** 비교 결과 전체 */
export interface ComparisonResult {
  levelDeltas: LevelDelta[];
  exceptionDeltas: ExceptionDelta[]; // B 기준 건수 내림차순, 최대 10개
  errorRateA: number; // ERROR / 전체 * 100 (소수점 2자리)
  errorRateB: number;
}

// --- 내부 함수 ---

/** deltaType 결정: ERROR/WARN은 위험도 반영, INFO/전체는 중립 */
function determineDeltaType(level: string, delta: number): DeltaType {
  if (delta === 0) return "none";
  if (level === "ERROR" || level === "WARN") {
    return delta > 0 ? "increase" : "decrease";
  }
  // INFO, 전체: 증감은 있지만 위험도와 무관
  return "neutral";
}

/** 양쪽 topErrors를 exceptionClass 키로 병합, B 기준 내림차순 상위 10개 */
function mergeExceptions(
  topErrorsA: ErrorSummary[],
  topErrorsB: ErrorSummary[]
): ExceptionDelta[] {
  const map = new Map<string, ExceptionDelta>();

  for (const e of topErrorsA) {
    map.set(e.exceptionClass, {
      exceptionClass: e.exceptionClass,
      countA: e.count,
      countB: 0,
      delta: -e.count,
      presence: "onlyA",
      sampleEntryIdA: e.sampleEntryId,
    });
  }

  for (const e of topErrorsB) {
    const existing = map.get(e.exceptionClass);
    if (existing) {
      existing.countB = e.count;
      existing.delta = e.count - existing.countA;
      existing.presence = "both";
      existing.sampleEntryIdB = e.sampleEntryId;
    } else {
      map.set(e.exceptionClass, {
        exceptionClass: e.exceptionClass,
        countA: 0,
        countB: e.count,
        delta: e.count,
        presence: "onlyB",
        sampleEntryIdB: e.sampleEntryId,
      });
    }
  }

  // B 기준 건수 내림차순 정렬 -> 상위 10개
  return Array.from(map.values())
    .sort((a, b) => b.countB - a.countB)
    .slice(0, 10);
}

// --- 메인 비교 함수 ---

export function compareAnalyses(
  analysisA: AnalysisResult,
  analysisB: AnalysisResult
): ComparisonResult {
  // 레벨별 증감 계산 (순서 고정: 전체, ERROR, WARN, INFO)
  // FATAL은 ERROR에 합산 (기존 TimelineChart도 동일 처리)
  const levels = [
    {
      level: "전체",
      countA: analysisA.totalEntries,
      countB: analysisB.totalEntries,
    },
    {
      level: "ERROR",
      countA: analysisA.levelCounts.ERROR + analysisA.levelCounts.FATAL,
      countB: analysisB.levelCounts.ERROR + analysisB.levelCounts.FATAL,
    },
    {
      level: "WARN",
      countA: analysisA.levelCounts.WARN,
      countB: analysisB.levelCounts.WARN,
    },
    {
      level: "INFO",
      countA: analysisA.levelCounts.INFO,
      countB: analysisB.levelCounts.INFO,
    },
  ];

  const levelDeltas: LevelDelta[] = levels.map(({ level, countA, countB }) => {
    const delta = countB - countA;
    return {
      level,
      countA,
      countB,
      delta,
      deltaType: determineDeltaType(level, delta),
    };
  });

  // 예외 병합
  const exceptionDeltas = mergeExceptions(
    analysisA.topErrors,
    analysisB.topErrors
  );

  // 에러 비율 계산 (소수점 2자리)
  const errorRateA =
    analysisA.totalEntries > 0
      ? Math.round(
          ((analysisA.levelCounts.ERROR + analysisA.levelCounts.FATAL) /
            analysisA.totalEntries) *
            10000
        ) / 100
      : 0;

  const errorRateB =
    analysisB.totalEntries > 0
      ? Math.round(
          ((analysisB.levelCounts.ERROR + analysisB.levelCounts.FATAL) /
            analysisB.totalEntries) *
            10000
        ) / 100
      : 0;

  return {
    levelDeltas,
    exceptionDeltas,
    errorRateA,
    errorRateB,
  };
}
