// Spring Boot 표준 로그 파싱 유틸리티
// 배치 파싱 방식: Rust Channel에서 500라인씩 수신하여 처리

export type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

export interface StackFrame {
  raw: string;
  isUserCode: boolean;
  className: string;
  methodName: string;
  fileName: string;
  lineNumber: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;       // 정규화 형식 "2024-01-15 14:23:45.123" — 입력 ISO-8601(2024-01-15T14:23:45.123+09:00) 도 동일 형식으로 변환됨 (T→스페이스, 타임존 오프셋 제거)
  level: LogLevel;
  pid: number;
  thread: string;          // [main]
  logger: string;          // c.example.MyClass
  message: string;
  exceptionClass?: string; // java.lang.NullPointerException
  exceptionMessage?: string;
  stacktrace: StackFrame[];
  rawLines: string[];
}

// 모듈 레벨 상수 (정규식 컴파일 오버헤드 방지)
// 타임스탬프는 구 표준(스페이스 구분, 타임존 없음)과 신 표준(ISO-8601 'T' 구분, 선택적 타임존 오프셋) 둘 다 매칭한다.
// 타임존(Z / +09:00 / +0900)은 캡처 그룹 1 밖에서 흡수해 다운스트림(slice 13자 hourKey 등)이 동일 형식을 받게 한다.
const SPRING_LOG_PATTERN =
  /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}[.,]\d{3})(?:Z|[+-]\d{2}:?\d{2})?\s+(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\s+(\d+)\s+---\s+\[([^\]]+)\]\s+(\S+)\s*:\s*(.*)$/;

// Exception 클래스명 라인 (콜론+메시지 없이 단독으로 오는 경우 포함)
const EXCEPTION_LINE_PATTERN =
  /^([\w.$]+(?:Exception|Error|Throwable))(?::\s*(.*))?$/;

// 스택 프레임: 탭 1개 또는 스페이스 2개 이상 + at
// Native Method / Unknown Source 프레임도 수집
const STACKFRAME_PATTERN =
  /^(\t| {2,})at\s+([\w.$]+)\.([\w$<>]+)\(([^)]+)\)$/;

const STACKFRAME_JAVA_PATTERN =
  /^(\t| {2,})at\s+([\w.$]+)\.([\w$<>]+)\(([^:)]+\.java):(\d+)\)$/;

const CAUSED_BY_PATTERN = /^(?:Caused by:|Suppressed:)\s/;

// "... 23 more" / "... 5 common frames omitted" 스택트레이스 축약 라인
// 앞에 탭/스페이스 조합이 올 수 있음 (hexdump: \t + space + ...)
const ELLIPSIS_MORE_PATTERN = /^[\t ]*\.\.\.\s+\d+\s+(more|common frames omitted)/;

// 로깅 프레임워크 내부 메시지 (Spring 로그 형식이 아닌 자체 출력)
const LOGGING_FRAMEWORK_PATTERN = /^(?:(?:ERROR|WARN) in ch\.qos\.logback|SLF4J:|log4j:)/;

// Spring Boot 배너 라인 (ASCII 아트) — parseFailCount 에서 제외해야 하는 비로그 라인
const SPRING_BANNER_PATTERN = /^[\s]*(?:::.*Spring Boot|={5,}|[/\\(){}'|_]+\s*$|\.\s+____)/;

const FRAMEWORK_PREFIXES = [
  "java.",
  "javax.",
  "jakarta.",
  "sun.",
  "com.sun.",
  "jdk.",
  "org.springframework.",
  "org.apache.",
  "ch.qos.",
  "io.netty.",
  "reactor.",
  "com.zaxxer.",
  "org.hibernate.",
  "net.sf.cglib.",
  "org.objenesis.",
];

let entryCounter = 0;

// 동시 파싱(다중 탭) 시 id 전역 유니크 보장을 위한 fileId salt (§3.4).
// 빈 문자열이면 기존 동작과 동일.
function makeId(timestamp: string, fileIdSalt = ""): string {
  const salt = fileIdSalt ? `${fileIdSalt.slice(0, 8)}-` : "";
  return `${salt}${timestamp.replace(/[^0-9]/g, "")}-${(++entryCounter).toString(36)}`;
}

function isUserCode(className: string): boolean {
  return !FRAMEWORK_PREFIXES.some((p) => className.startsWith(p));
}

function parseStackFrame(line: string): StackFrame | null {
  // 먼저 표준 .java:N 패턴 시도 (그룹1=들여쓰기, 2=클래스, 3=메서드, 4=파일, 5=라인)
  const full = line.match(STACKFRAME_JAVA_PATTERN);
  if (full) {
    return {
      raw: line.trimStart(),
      isUserCode: isUserCode(full[2]),
      className: full[2],
      methodName: full[3],
      fileName: full[4],
      lineNumber: parseInt(full[5], 10),
    };
  }
  // Native Method / Unknown Source 등 파일 정보 없는 프레임 (그룹1=들여쓰기, 2=클래스, 3=메서드, 4=소스)
  const generic = line.match(STACKFRAME_PATTERN);
  if (generic) {
    return {
      raw: line.trimStart(),
      isUserCode: isUserCode(generic[2]),
      className: generic[2],
      methodName: generic[3],
      fileName: generic[4],
      lineNumber: 0,
    };
  }
  return null;
}

function finalizeEntry(partial: Partial<LogEntry>, fileIdSalt = ""): LogEntry {
  return {
    id: makeId(partial.timestamp ?? "", fileIdSalt),
    timestamp: partial.timestamp ?? "",
    level: partial.level ?? "INFO",
    pid: partial.pid ?? 0,
    thread: partial.thread ?? "",
    logger: partial.logger ?? "",
    message: partial.message ?? "",
    exceptionClass: partial.exceptionClass,
    exceptionMessage: partial.exceptionMessage,
    stacktrace: partial.stacktrace ?? [],
    rawLines: partial.rawLines ?? [],
  };
}

export interface ParseBatchResult {
  entries: LogEntry[];
  pending: Partial<LogEntry> | null;
  parseFailCount: number;
}

export interface ParseBatchOptions {
  /** A안 Raw 보기 — 정규화된 모든 라인을 순서대로 수집 (§5.1). Raw 보기 연 탭만 전달. */
  rawSink?: (line: string) => void;
  /** 동시 파싱 시 id 전역 유니크용 fileId salt (§3.4) */
  fileIdSalt?: string;
}

/**
 * 500라인 배치를 파싱하여 LogEntry[]를 반환한다.
 * 배치 경계에서 잘린 멀티라인 엔트리는 pending으로 반환하여
 * 다음 배치 호출 시 첫 번째 인자로 전달한다.
 */
export function parseBatch(
  lines: string[],
  pending: Partial<LogEntry> | null,
  options?: ParseBatchOptions
): ParseBatchResult {
  const entries: LogEntry[] = [];
  let current = pending;
  let parseFailCount = 0;
  const rawSink = options?.rawSink;
  const salt = options?.fileIdSalt ?? "";

  for (let line of lines) {
    line = line.replace(/\r$/, ""); // CRLF → LF 정규화
    // ★ A안: 고아·표준·멀티라인 전부 순서대로 수집 (빈 라인 스킵 전 — 원본 보존)
    rawSink?.(line);
    if (!line.trim()) continue; // 빈 라인 스킵
    if (LOGGING_FRAMEWORK_PATTERN.test(line)) continue; // 로깅 프레임워크 내부 메시지 무시
    if (SPRING_BANNER_PATTERN.test(line)) continue; // Spring Boot 배너 (ASCII 아트) 무시

    const match = line.match(SPRING_LOG_PATTERN);

    if (match) {
      // 새 로그 라인 시작 — pending flush
      if (current?.timestamp) {
        entries.push(finalizeEntry(current, salt));
      }
      current = {
        timestamp: match[1].replace("T", " ").replace(",", "."),
        level: match[2] as LogLevel,
        pid: parseInt(match[3], 10),
        thread: match[4].trim(),
        logger: match[5],
        message: match[6],
        stacktrace: [],
        rawLines: [line],
      };
    } else {
      // 멀티라인 처리 (Exception / 스택트레이스 / Caused by)
      // current가 없어도 인식된 패턴은 parseFailCount에서 제외

      // 스택 프레임
      // 멀티라인 누적은 push 로 in-place mutate (스택트레이스 N 라인일 때 spread 누적은 O(N²) → push 로 O(N))
      const frame = parseStackFrame(line);
      if (frame) {
        if (current) {
          (current.rawLines ??= []).push(line);
          (current.stacktrace ??= []).push(frame);
        }
        continue;
      }

      // "... N more" 축약 라인
      if (ELLIPSIS_MORE_PATTERN.test(line)) {
        if (current) {
          (current.rawLines ??= []).push(line);
        }
        continue;
      }

      // Caused by / Suppressed 라인
      if (CAUSED_BY_PATTERN.test(line)) {
        if (current) {
          (current.rawLines ??= []).push(line);
        }
        continue;
      }

      // Exception 클래스 라인
      const exMatch = line.match(EXCEPTION_LINE_PATTERN);
      if (exMatch) {
        if (current) {
          (current.rawLines ??= []).push(line);
          if (!current.exceptionClass) {
            current.exceptionClass = exMatch[1];
            current.exceptionMessage = exMatch[2];
          }
        }
        continue;
      }

      // 인식되지 않는 라인
      if (current) {
        (current.rawLines ??= []).push(line);
      } else {
        parseFailCount++;
      }
    }
  }

  return { entries, pending: current, parseFailCount };
}

/** 마지막 pending 엔트리를 flush한다 (파싱 완료 시 호출) */
export function flushPending(
  pending: Partial<LogEntry> | null,
  fileIdSalt = ""
): LogEntry[] {
  if (!pending?.timestamp) return [];
  return [finalizeEntry(pending, fileIdSalt)];
}

/** 파서 카운터 리셋 (새 파일 로딩 시 호출) */
export function resetParser(): void {
  entryCounter = 0;
}

// ── CSV 전처리 (Docker/컨테이너 로그 내보내기 지원) ──

/**
 * 첫 배치의 앞부분을 보고 CSV 형식인지 감지한다.
 * Docker Desktop / Synology 등의 컨테이너 로그 CSV 내보내기 형식:
 *   [app-name]        ← 선택적 첫 줄 (비CSV)
 *   date,stream,content
 *   2026/04/13 12:00:00,stdout,"2026-04-13T03:00:00.173Z  INFO ..."
 */
export function detectCsvFormat(firstLines: string[]): boolean {
  for (let i = 0; i < Math.min(3, firstLines.length); i++) {
    const line = firstLines[i].trim();
    if (line === 'date,stream,content') return true;
    if (/^[^,]+,stream,content$/.test(line)) return true;
  }
  return false;
}

/**
 * CSV 행에서 content 컬럼을 추출하여 일반 로그 라인으로 변환한다.
 * - 헤더 행과 앱 이름 행은 건너뜀
 * - content 필드의 따옴표와 끝 개행 제거
 * - 빈 content 는 빈 문자열로 유지 (멀티라인 구분자 역할)
 */
export function preprocessCsvLines(lines: string[], isFirstBatch: boolean): string[] {
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 첫 배치에서 헤더/앱이름 건너뛰기
    if (isFirstBatch && i < 3) {
      if (trimmed === '' || trimmed === 'date,stream,content' || /^[^,]+,stream,content$/.test(trimmed)) continue;
      if (i === 0 && !trimmed.includes(',')) continue;
    }

    // 따옴표 잔해 제거 (CSV quoted field 의 줄바꿈으로 분리된 닫는 따옴표)
    if (trimmed === '"' || trimmed === '') continue;

    // CSV 행에서 content 추출: "date,stream,content" 에서 두 번째 콤마 이후가 content
    const firstComma = line.indexOf(',');
    if (firstComma === -1) {
      // CSV 행이 아닌 라인 (순수 스택프레임 등) → 그대로 유지하되 jar 접미사 정리
      result.push(stripJarSuffix(line));
      continue;
    }
    const secondComma = line.indexOf(',', firstComma + 1);
    if (secondComma === -1) {
      result.push(stripJarSuffix(line));
      continue;
    }

    let content = line.slice(secondComma + 1);

    // 따옴표 제거 + 내부 이스케이프 처리
    if (content.startsWith('"')) {
      content = content.slice(1);
      const endQuote = content.lastIndexOf('"');
      if (endQuote >= 0) {
        content = content.slice(0, endQuote);
      }
      content = content.replace(/""/g, '"');
    }

    // 후행 \n \r 제거
    content = content.replace(/[\r\n]+$/, '');

    if (content.trim() === '') continue;

    // 스택프레임 jar 접미사 제거: `~[tomcat-embed-core-11.0.18.jar:11.0.18]` → 제거
    result.push(stripJarSuffix(content));
  }
  return result;
}

/** 스택프레임 끝의 `~[jar:version]` 접미사 제거 (Spring Boot DevTools 형식) */
function stripJarSuffix(line: string): string {
  // `at com.example.Foo.bar(Foo.java:42) ~[classes/:0.0.1-SNAPSHOT]` → `at com.example.Foo.bar(Foo.java:42)`
  return line.replace(/\s+~\[[^\]]*\]$/, '');
}
