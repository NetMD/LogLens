// AI 리포트 프리셋별 프롬프트 템플릿 (8차 확장)
// - SYSTEM_BASE / PRESET_INSTRUCTIONS 다국어화 (ko/en)
// - AnalysisPayload 기반 userPrompt
// - 소스코드 섹션, Word 구조 힌트 섹션 추가
// - 80KB 토큰 가드 (초과 시 stackTraces drop → 여전히 초과 시 PAYLOAD_TOO_LARGE)

import type { PresetType } from '../../store/exportStore';
import type { AnalysisPayload, ReportLanguage } from './types';
import { AiApiError } from './types';
import type { WordStructureHint } from './wordTemplateParser';

const PAYLOAD_BYTE_LIMIT = 80_000;

const SYSTEM_BASE: Record<ReportLanguage, string> = {
  ko: `당신은 Spring Boot 애플리케이션의 로그를 분석하는 전문가입니다.
아래 로그 분석 데이터를 기반으로 한국어로 보고서를 작성해 주세요.
마크다운 형식으로 작성하되, 간결하고 실무적인 어조를 사용하세요.`,
  en: `You are an expert in analyzing Spring Boot application logs.
Write a report in English based on the log analysis data below.
Use markdown format with a concise, professional tone.`,
};


const PRESET_INSTRUCTIONS: Record<PresetType, Record<ReportLanguage, string>> = {
  incident: {
    ko: `다음 섹션 구조로 장애 보고서를 작성하세요:
# 장애 보고서
## 1. 장애 개요 (시간대, 영향 범위, 심각도 판단)
## 2. 에러 요약 (레벨별 건수)
## 3. 시간대별 추이 (패턴 분석)
## 4. 근본 원인 분석 (스택트레이스 기반 추론)
## 5. 조치 사항 및 권고`,
    en: `Write an incident report with the following section structure:
# Incident Report
## 1. Incident Overview (time range, impact scope, severity)
## 2. Error Summary (counts by level)
## 3. Hourly Trend (pattern analysis)
## 4. Root Cause Analysis (based on stack traces)
## 5. Actions and Recommendations`,
  },
  daily: {
    ko: `다음 섹션 구조로 일일 점검 보고서를 작성하세요:
# 일일 점검 보고서
## 1. 점검 요약 (전체 상태 평가)
## 2. 로그 레벨 분포
## 3. 주요 예외 현황
## 4. 시스템 안정성 평가 (ERROR/WARN 비율 기반)
## 5. 금일 조치 필요 항목`,
    en: `Write a daily health-check report with the following section structure:
# Daily Health Check
## 1. Check Summary (overall status)
## 2. Log Level Distribution
## 3. Top Exceptions
## 4. System Stability Assessment (by ERROR/WARN ratio)
## 5. Action Items for Today`,
  },
  devSummary: {
    ko: `다음 섹션 구조로 개발팀 공유 요약을 작성하세요:
# 개발팀 공유 요약
## 1. 핵심 이슈 (1-3줄 요약)
## 2. 에러 상세 (예외 클래스 + 스택트레이스 분석)
## 3. 코드 레벨 분석 (사용자 코드 프레임 기반 영향 범위)
## 4. 수정 우선순위 제안`,
    en: `Write a dev-team shared summary with the following section structure:
# Dev Team Summary
## 1. Key Issues (1-3 line summary)
## 2. Error Details (exception class + stack trace analysis)
## 3. Code-Level Analysis (impact scope based on user code frames)
## 4. Suggested Fix Priority`,
  },
};

/** buildPrompt 옵션 */
export interface BuildPromptOptions {
  language: ReportLanguage;
  wordStructureHint?: WordStructureHint;
}

/**
 * 프리셋과 분석 페이로드로 AI 프롬프트를 구성한다 (8차 확장)
 *
 * 80KB 토큰 가드:
 *   payload(JSON) 직렬화 크기 > 80,000자면 먼저 stackTraces/sourceCode를 drop한 복제본으로 시도.
 *   그래도 초과면 PAYLOAD_TOO_LARGE throw.
 */
export function buildPrompt(
  preset: PresetType,
  data: AnalysisPayload,
  options: BuildPromptOptions,
): { systemPrompt: string; userPrompt: string } {
  // 80KB 가드: 먼저 데이터 자체 크기 검증 → 초과면 drop 버전 시도
  const effectiveData = enforcePayloadBudget(data);

  // 기본 system prompt: 역할 + 프리셋 섹션 구조
  const baseSystem = `${SYSTEM_BASE[options.language]}\n\n${PRESET_INSTRUCTIONS[preset][options.language]}`;

  const systemPrompt = baseSystem;

  const userPrompt = buildUserPrompt(effectiveData, options);
  return { systemPrompt, userPrompt };
}

/**
 * payload 크기 검증 (pure)
 * 80KB 초과 시 stackTraces + sourceCode를 제거한 복제본 반환
 * 그래도 초과면 PAYLOAD_TOO_LARGE throw
 */
function enforcePayloadBudget(data: AnalysisPayload): AnalysisPayload {
  const originalSize = JSON.stringify(data).length;
  if (originalSize <= PAYLOAD_BYTE_LIMIT) return data;

  // 1단계 drop: stackTraces, sourceCode 제거
  const trimmed: AnalysisPayload = {
    ...data,
    stackTraces: undefined,
    sourceCode: undefined,
    meta: { ...data.meta, summaryMode: 'summary' },
  };
  delete trimmed.stackTraces;
  delete trimmed.sourceCode;
  const trimmedSize = JSON.stringify(trimmed).length;
  if (trimmedSize <= PAYLOAD_BYTE_LIMIT) return trimmed;

  // 2단계: 여전히 초과 → 사용자에게 에러
  throw new AiApiError(
    'PAYLOAD_TOO_LARGE',
    `Payload size ${trimmedSize} exceeds ${PAYLOAD_BYTE_LIMIT}`,
  );
}

function buildUserPrompt(
  data: AnalysisPayload,
  options: BuildPromptOptions,
): string {
  const lang = options.language;
  const lines: string[] = [];

  // 헤더 + summary
  const mb = (data.summary.fileSize / 1024 / 1024).toFixed(1);
  if (lang === 'ko') {
    lines.push('## 분석 데이터');
    lines.push('');
    lines.push(`**파일**: ${data.summary.fileName} (${mb} MB)`);
    lines.push(`**분석 시각**: ${data.summary.analyzedAt}`);
    lines.push(`**전체 로그 엔트리**: ${data.summary.totalCount.toLocaleString()}건`);
    lines.push(
      `**레벨 분포**: ERROR=${data.summary.errorCount}, WARN=${data.summary.warnCount}, INFO=${data.summary.infoCount}`,
    );
    lines.push(`**에러율**: ${(data.summary.errorRate * 100).toFixed(2)}%`);
    lines.push('');
  } else {
    lines.push('## Analysis Data');
    lines.push('');
    lines.push(`**File**: ${data.summary.fileName} (${mb} MB)`);
    lines.push(`**Analyzed at**: ${data.summary.analyzedAt}`);
    lines.push(`**Total entries**: ${data.summary.totalCount.toLocaleString()}`);
    lines.push(
      `**Level distribution**: ERROR=${data.summary.errorCount}, WARN=${data.summary.warnCount}, INFO=${data.summary.infoCount}`,
    );
    lines.push(`**Error rate**: ${(data.summary.errorRate * 100).toFixed(2)}%`);
    lines.push('');
  }

  // Top 예외 목록
  lines.push(lang === 'ko' ? '### Top 예외 목록' : '### Top Exceptions');
  if (data.topExceptions.length === 0) {
    lines.push(lang === 'ko' ? '(예외 없음)' : '(none)');
  } else {
    for (const e of data.topExceptions) {
      const firstLabel = lang === 'ko' ? '최초' : 'first';
      const lastLabel = lang === 'ko' ? '최종' : 'last';
      const countLabel = lang === 'ko' ? '건' : 'occurrences';
      lines.push(
        `${e.rank}. ${e.fullName} (${e.count} ${countLabel}, ${firstLabel}: ${e.firstOccurrence}, ${lastLabel}: ${e.lastOccurrence})`,
      );
    }
  }
  lines.push('');

  // 주요 스택트레이스 샘플
  if (data.stackTraces && data.stackTraces.length > 0) {
    lines.push(lang === 'ko' ? '### 주요 스택트레이스 샘플' : '### Stack Trace Samples');
    for (const s of data.stackTraces.slice(0, 5)) {
      lines.push(`[${s.timestamp}] ${s.exceptionClass}: ${s.message}`);
      for (const frame of s.frames.slice(0, 8)) {
        lines.push(`  ${frame}`);
      }
      lines.push('');
    }
  }

  // 관련 소스 코드
  if (data.sourceCode && data.sourceCode.files.length > 0) {
    lines.push(lang === 'ko' ? '### 관련 소스 코드' : '### Related Source Code');
    lines.push(
      lang === 'ko'
        ? '(스택트레이스에 나타난 사용자 코드 파일의 관련 부분)'
        : '(Relevant sections of user code files referenced by stack traces)',
    );
    lines.push('');
    for (const file of data.sourceCode.files) {
      lines.push(`**${file.path}**`);
      lines.push('```');
      for (const line of file.relevantLines) {
        lines.push(`${String(line.lineNumber).padStart(5, ' ')} | ${line.content}`);
      }
      lines.push('```');
      lines.push('');
    }
  }

  // 시간대별 추이
  if (data.hourlyDistribution.length > 0) {
    lines.push(lang === 'ko' ? '### 시간대별 추이' : '### Hourly Trend');
    for (const t of data.hourlyDistribution) {
      lines.push(`${t.hour}: ERROR=${t.error}, WARN=${t.warn}, INFO=${t.info}`);
    }
    lines.push('');
  }

  // Word 구조 힌트
  if (options.wordStructureHint && options.wordStructureHint.sections.length > 0) {
    lines.push(lang === 'ko' ? '### 출력 형식 지침' : '### Output Structure Guidance');
    lines.push(
      lang === 'ko'
        ? '아래 섹션 구조를 참고하여 보고서를 작성하세요:'
        : 'Use the following section structure as a guide:',
    );
    for (const section of options.wordStructureHint.sections) {
      const prefix = '#'.repeat(section.level);
      lines.push(`- ${prefix} ${section.title}`);
    }
    if (options.wordStructureHint.hasTables) {
      lines.push(
        lang === 'ko'
          ? '- 참고: 원본 템플릿에 표가 포함되어 있으므로 필요 시 표 형식을 사용하세요.'
          : '- Note: the original template contains tables; use tables where appropriate.',
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}
