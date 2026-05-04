// AI 진단 프롬프트 구성 함수

import type {
  DiagnosisInput,
  DiagnosisHistory,
  UnidirectionalResult,
  ExceptionDiagnosisInput,
  SingleDiagnosisInput,
} from '../../types/diagnosis';
import type { LogEntry, StackFrame } from '../../utils/logParser';
import { sanitizeLogContent } from './sanitize';

export interface DiagnosisPromptResult {
  systemPrompt: string;
  userPrompt: string;
}

// === 프롬프트 상수 ===

const UNIDIRECTIONAL_SYSTEM_PROMPT = `You are a senior Spring Boot error diagnosis expert. Analyze the provided error/exception and respond ONLY in valid JSON format.

## Response Format (STRICT JSON)
{
  "severity": "HIGH" | "MEDIUM" | "LOW",
  "severityReason": "1-2 sentence explanation of severity judgment",
  "rootCause": "2-3 sentence root cause analysis",
  "solution": {
    "description": "Step-by-step fix explanation",
    "codeExample": {
      "before": "problematic code snippet",
      "after": "fixed code snippet",
      "language": "java"
    }
  },
  "prevention": ["recommendation 1", "recommendation 2", "recommendation 3"],
  "relatedErrors": [
    { "exceptionClass": "related exception", "reason": "why it's related" }
  ]
}

## Rules
- Respond ONLY with the JSON object, no markdown fencing, no additional text
- severity: HIGH = data loss/security risk/service down, MEDIUM = degraded functionality, LOW = cosmetic/logging issue
- codeExample is optional - include only if a concrete fix is possible
- relatedErrors: check the provided log context for other exceptions that may be connected
- Respond in the same language as the user's log messages (Korean logs -> Korean explanations)`;

const CONVERSATIONAL_SYSTEM_PROMPT = `You are a senior Spring Boot error diagnosis expert assisting in an interactive conversation.

## Context
The developer is investigating a specific error in their Spring Boot application. Below is the error context and any previous analysis.

<LOG_CONTEXT>
{LOG_CONTEXT}
</LOG_CONTEXT>

Exception: {EXCEPTION_INFO}

## Guidelines
- Provide concise, actionable answers
- Include code examples when relevant (use markdown code blocks with language tags)
- Reference specific line numbers and classes from the stack trace
- If asked about prevention, suggest design patterns and best practices
- Respond in the same language as the user's messages`;

// === 직렬화 함수 ===

function formatStackFrames(frames: StackFrame[]): string {
  return frames.map(f =>
    `\tat ${f.className}.${f.methodName}(${f.fileName}:${f.lineNumber})`
  ).join('\n');
}

function serializeSelectedError(input: DiagnosisInput): string {
  if (input.type === 'exception') {
    const exc = input as ExceptionDiagnosisInput;
    const parts: string[] = [
      `Exception: ${exc.fullName} (${exc.count} occurrences)`,
      `First: ${exc.firstOccurrence}`,
      `Last: ${exc.lastOccurrence}`,
    ];

    // 스택트레이스 (최대 3개)
    exc.stackTraces.slice(0, 3).forEach((st, idx) => {
      parts.push(`\nStack trace #${idx + 1}:`);
      parts.push(formatStackFrames(st));
    });

    // 관련 로그 (최대 20줄)
    if (exc.relatedLogs.length > 0) {
      parts.push('\nRelated log entries:');
      exc.relatedLogs.slice(0, 20).forEach(log => {
        parts.push(`${log.timestamp} ${log.level} [${log.thread}] ${log.logger}: ${log.message}`);
      });
    }

    return parts.join('\n');
  }

  // single 타입
  const single = input as SingleDiagnosisInput;
  const parts: string[] = [
    `Exception: ${single.logEntry.exceptionClass ?? 'Unknown'}`,
    `Timestamp: ${single.logEntry.timestamp}`,
    `Logger: ${single.logEntry.logger}`,
    `Message: ${single.logEntry.message}`,
  ];

  if (single.stackTrace.length > 0) {
    parts.push('\nStack trace:');
    parts.push(formatStackFrames(single.stackTrace));
  }

  if (single.contextLogs.length > 0) {
    parts.push('\nContext logs:');
    single.contextLogs.forEach(log => {
      parts.push(`${log.timestamp} ${log.level} [${log.thread}] ${log.logger}: ${log.message}`);
    });
  }

  return parts.join('\n');
}

function serializeFullLog(logEntries: LogEntry[]): string {
  return logEntries.map(log =>
    `${log.timestamp} ${log.level} [${log.thread}] ${log.logger}: ${log.message}${
      log.exceptionClass ? `\n${log.exceptionClass}${log.exceptionMessage ? ': ' + log.exceptionMessage : ''}` : ''
    }${log.stacktrace.length > 0 ? '\n' + formatStackFrames(log.stacktrace) : ''}`
  ).join('\n');
}

function formatExceptionInfo(input: DiagnosisInput): string {
  if (input.type === 'exception') {
    return `${input.exceptionClass} (${input.fullName}) - ${input.count} occurrences`;
  }
  return `${input.logEntry.exceptionClass ?? 'Unknown'} (${input.logEntry.logger})`;
}

function summarizePreviousDiagnoses(diagnoses: DiagnosisHistory[]): string {
  return diagnoses.map((d, i) => {
    const parts: string[] = [`Diagnosis #${i + 1} (${d.savedAt}):`];
    if (d.unidirectional) {
      parts.push(`  Severity: ${d.unidirectional.severity}`);
      parts.push(`  Root cause: ${d.unidirectional.rootCause}`);
      if (d.unidirectional.solution) {
        parts.push(`  Solution: ${d.unidirectional.solution.description}`);
      }
    }
    return parts.join('\n');
  }).join('\n\n');
}

// === 공개 API ===

/** 단방향 분석 프롬프트 구성 */
export function buildUnidirectionalPrompt(
  input: DiagnosisInput,
  scope: 'selected' | 'full',
  logEntries: LogEntry[],
  previousDiagnoses?: DiagnosisHistory[],
): DiagnosisPromptResult {
  const sanitizedContext = sanitizeLogContent(
    scope === 'full'
      ? serializeFullLog(logEntries)
      : serializeSelectedError(input)
  );

  let systemPrompt = UNIDIRECTIONAL_SYSTEM_PROMPT;
  if (previousDiagnoses && previousDiagnoses.length > 0) {
    systemPrompt += `\n\n<PREVIOUS_DIAGNOSES>\n${summarizePreviousDiagnoses(previousDiagnoses)}\n</PREVIOUS_DIAGNOSES>`;
  }

  const exceptionClass = input.type === 'exception'
    ? input.exceptionClass
    : (input.logEntry.exceptionClass ?? 'Unknown');
  const fullName = input.type === 'exception'
    ? input.fullName
    : (input.logEntry.exceptionClass ?? 'Unknown');
  const count = input.type === 'exception' ? input.count : 1;
  const firstOccurrence = input.type === 'exception'
    ? input.firstOccurrence
    : input.logEntry.timestamp;
  const lastOccurrence = input.type === 'exception'
    ? input.lastOccurrence
    : input.logEntry.timestamp;

  // 스택트레이스 포맷팅
  let stackTraceText = '';
  if (input.type === 'exception' && input.stackTraces.length > 0) {
    stackTraceText = input.stackTraces.slice(0, 3)
      .map((st, i) => `Stack trace #${i + 1}:\n${formatStackFrames(st)}`)
      .join('\n\n');
  } else if (input.type === 'single' && input.stackTrace.length > 0) {
    stackTraceText = formatStackFrames(input.stackTrace);
  }

  const scopeNote = scope === 'full'
    ? 'Full log context is included above.'
    : 'Only the selected error context is provided.';

  const userPrompt = `Diagnose the following Spring Boot error:

<LOG_CONTEXT>
${sanitizedContext}
</LOG_CONTEXT>

Exception: ${exceptionClass} (${fullName})
Occurrences: ${count}
First: ${firstOccurrence}
Last: ${lastOccurrence}
Stack trace:
${stackTraceText}

${scopeNote}`;

  return { systemPrompt, userPrompt };
}

/** 대화형 분석 시스템 프롬프트 구성 */
export function buildConversationalSystemPrompt(
  input: DiagnosisInput,
  unidirectionalResult?: UnidirectionalResult | null,
): string {
  const sanitizedContext = sanitizeLogContent(serializeSelectedError(input));
  let prompt = CONVERSATIONAL_SYSTEM_PROMPT
    .replace('{LOG_CONTEXT}', sanitizedContext)
    .replace('{EXCEPTION_INFO}', formatExceptionInfo(input));

  if (unidirectionalResult) {
    prompt += `\n\n## Previous Analysis\n${JSON.stringify(unidirectionalResult)}`;
  }

  return prompt;
}
