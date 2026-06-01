// 분석 페이로드 빌더 (8차 신규)
// logStore(읽기 전용)와 exportStore(isFromHistory)에서 데이터를 읽어
// AI 프롬프트에 투입할 AnalysisPayload를 조립한다.
//
// 4조건 매트릭스:
//   isFromHistory=true           → summaryMode='summary', Top 10, stack/source 제외
//   fileSize >= 5MB              → summaryMode='summary', Top 5,  stack/source 제외
//   fileSize < 5MB, root=null    → summaryMode='full',    Top 10, stack 포함(Top 5), source 제외
//   fileSize < 5MB, root !== null→ summaryMode='full',    Top 10, stack 포함(Top 5), source 포함

import { getActiveFile } from '../../store/activeFileSelectors';
import { getActiveExport } from '../../store/exportStore';
import { resolveSources } from './sourceCodeResolver';
import type {
  AnalysisPayload,
  BuildOptions,
  SummaryMode,
} from './types';
import { AiApiError } from './types';
import type { ErrorSummary, AnalysisResult } from '../../utils/errorAnalyzer';
import type { LogEntry } from '../../utils/logParser';

const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024; // 5MB
const MAX_STACKTRACE_SAMPLES = 5;             // full 모드에서 AI에 전달할 최대 스택트레이스 수

/**
 * summaryMode 결정 (pure, 단위 테스트 대상)
 */
export function decideSummaryMode(
  fileSize: number,
  isFromHistory: boolean,
): SummaryMode {
  if (isFromHistory) return 'summary';
  if (fileSize >= LARGE_FILE_THRESHOLD) return 'summary';
  return 'full';
}

/**
 * Top 예외 상위 N 추출 (pure, 단위 테스트 대상)
 * analysis.topErrors를 AnalysisPayload.topExceptions 형태로 변환하며 rank를 부여한다.
 */
export function pickTopExceptions(
  analysis: { topErrors: ErrorSummary[] },
  limit: number,
): AnalysisPayload['topExceptions'] {
  return analysis.topErrors.slice(0, limit).map((e, i) => ({
    rank: i + 1,
    className: extractShortClassName(e.exceptionClass),
    fullName: e.exceptionClass,
    count: e.count,
    firstOccurrence: e.firstOccurrence,
    lastOccurrence: e.lastOccurrence,
  }));
}

/** FQN에서 단순 클래스명 추출 (pure) */
function extractShortClassName(fqn: string): string {
  const parts = fqn.split('.');
  return parts[parts.length - 1] ?? fqn;
}

/**
 * buildAnalysisData
 * logStore.getState()를 호출부가 아닌 이 함수가 직접 호출한다 (기존 collectReportData 동일 원칙).
 * reportGenerator.ts의 원본 collectReportData를 대체한다.
 */
export async function buildAnalysisData(
  options: BuildOptions,
): Promise<AnalysisPayload> {
  const activeF = getActiveFile();
  const analysis = activeF?.analysis ?? null;
  const entries = activeF?.entries ?? [];
  const fileName = activeF?.fileName ?? null;
  const fileSize = activeF?.fileSize ?? 0;
  if (!analysis) {
    throw new AiApiError('PARSE_ERROR', 'analysis is null');
  }
  const { isFromHistory } = getActiveExport();

  const summaryMode = decideSummaryMode(fileSize, isFromHistory);
  const topLimit = summaryMode === 'summary' ? 5 : 10;
  const topExceptions = pickTopExceptions(analysis, topLimit);

  // hourlyDistribution 정규화 (소문자 키)
  const hourlyDistribution = analysis.timeline.map((t) => ({
    hour: t.hour,
    error: t.ERROR,
    warn: t.WARN,
    info: t.INFO,
  }));

  // summary 기본 필드
  const levelCounts = analysis.levelCounts;
  const errorCount = levelCounts.ERROR + levelCounts.FATAL;
  const warnCount = levelCounts.WARN;
  const infoCount = levelCounts.INFO;
  const totalCount = analysis.totalEntries;
  const errorRate = totalCount > 0 ? errorCount / totalCount : 0;

  const payload: AnalysisPayload = {
    summary: {
      fileName: fileName ?? 'unknown',
      fileSize,
      analyzedAt: new Date().toISOString(),
      totalCount,
      errorCount,
      warnCount,
      infoCount,
      errorRate,
    },
    topExceptions,
    hourlyDistribution,
    meta: {
      summaryMode,
      sourceCodeTruncated: false,
      language: options.language,
      generatedAt: new Date().toISOString(),
    },
  };

  // 스택트레이스는 full 모드이면서 history가 아닌 경우에만 포함
  if (summaryMode === 'full' && !isFromHistory) {
    payload.stackTraces = extractStackTraces(entries, MAX_STACKTRACE_SAMPLES);
  }

  // 소스 코드는 스택트레이스가 있고 projectRoot가 지정된 경우에만 수집
  if (
    payload.stackTraces !== undefined &&
    payload.stackTraces.length > 0 &&
    options.projectRoot !== null
  ) {
    if (options.abortSignal?.aborted) {
      throw new AiApiError('ABORTED', '');
    }
    const result = await resolveSources(
      payload.stackTraces,
      options.projectRoot,
      {
        maxFiles: 5,
        contextLines: 10,
        abortSignal: options.abortSignal,
      },
    );
    if (result.files.length > 0) {
      payload.sourceCode = { files: result.files };
    }
    payload.meta.sourceCodeTruncated = result.truncated;
  }

  return payload;
}

/**
 * LogEntry 배열에서 ERROR/FATAL 상위 N건을 AnalysisPayload.stackTraces 형태로 변환 (pure 일부)
 * sourceCodeResolver가 기대하는 frames 문자열 배열 형식으로 직렬화한다.
 */
function extractStackTraces(
  entries: LogEntry[],
  limit: number,
): NonNullable<AnalysisPayload['stackTraces']> {
  const errorEntries = entries
    .filter((e) => (e.level === 'ERROR' || e.level === 'FATAL') && e.stacktrace.length > 0)
    .slice(0, limit);

  return errorEntries.map((e) => ({
    level: e.level,
    timestamp: e.timestamp,
    logger: e.logger,
    message: e.message,
    exceptionClass: e.exceptionClass ?? '',
    frames: e.stacktrace.map((f) =>
      // sourceCodeResolver.FRAME_PATTERN이 기대하는 형식:
      //   "at com.example.Foo.bar(Foo.java:42)"
      `at ${f.className}.${f.methodName}(${f.fileName}:${f.lineNumber})`,
    ),
  }));
}

// AnalysisResult 타입 export (promptTemplates가 참조하는 경우를 위한 편의)
export type { AnalysisResult };
