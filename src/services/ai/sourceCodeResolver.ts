// 소스 코드 리졸버 (8차 신규)
// 스택트레이스의 사용자 코드 프레임을 기반으로 projectRoot 하위에서 실제 .java/.kt 파일을 찾고
// 해당 라인 ±contextLines 범위를 잘라 AnalysisPayload.sourceCode.files로 반환한다.

import type { AnalysisPayload } from './types';
import { AiApiError } from './types';

/** resolveSources 옵션 */
export interface ResolveOptions {
  maxFiles?: number;      // default 5
  contextLines?: number;  // default 10
  abortSignal?: AbortSignal;
}

/** 수집 결과 */
export interface ResolveResult {
  files: NonNullable<AnalysisPayload['sourceCode']>['files'];
  truncated: boolean;     // maxFiles 제한에 걸려 잘렸는지
}

// 스택 프레임 텍스트에서 className, fileName, lineNumber 추출
// 예: "at com.example.Foo.bar(Foo.java:42)"
const FRAME_PATTERN =
  /at\s+([\w.$]+)\.([\w$<>]+)\(([\w$]+\.(?:java|kt)):(\d+)\)/;

/**
 * FQN(className) → 상대 경로 후보 목록 (pure, 단위 테스트 대상)
 *
 * 전략 (순서대로 시도, 첫 매치 사용):
 *   a) {root}/src/main/java/{className.replace('.','/')}.java
 *   b) {root}/src/main/kotlin/{className.replace('.','/')}.kt
 *   c) {root}/src/test/java/{className.replace('.','/')}.java
 *   d) {root}/src/test/kotlin/{className.replace('.','/')}.kt
 *
 * 보안: glob scan 금지, 정규식 fallback 없음.
 */
export function buildPathCandidates(className: string, root: string): string[] {
  // 내부 클래스($) 처리: 외부 클래스 파일로 매핑
  // 예: com.example.Foo$Inner → com/example/Foo
  const topLevel = className.split('$')[0];
  const relPath = topLevel.replace(/\./g, '/');
  const normalizedRoot = root.replace(/[\\/]+$/, '');
  // Windows/Unix 경로 구분자 모두 지원 (plugin-fs가 OS별로 처리)
  const sep = normalizedRoot.includes('\\') && !normalizedRoot.includes('/') ? '\\' : '/';
  const join = (...parts: string[]): string => parts.join(sep);
  return [
    join(normalizedRoot, 'src', 'main', 'java', `${relPath}.java`),
    join(normalizedRoot, 'src', 'main', 'kotlin', `${relPath}.kt`),
    join(normalizedRoot, 'src', 'test', 'java', `${relPath}.java`),
    join(normalizedRoot, 'src', 'test', 'kotlin', `${relPath}.kt`),
  ];
}

/**
 * 파일 내용에서 targetLine 주변 ±contextLines 슬라이스 (pure, 단위 테스트 대상)
 *
 * - lineNumber는 1-based
 * - 파일 경계 (1, EOF)는 자동 clamp
 */
export function sliceContext(
  fileContent: string,
  targetLine: number,
  contextLines: number,
): Array<{ lineNumber: number; content: string }> {
  const allLines = fileContent.split('\n');
  const total = allLines.length;
  if (total === 0 || targetLine < 1) return [];
  const start = Math.max(1, targetLine - contextLines);
  const end = Math.min(total, targetLine + contextLines);
  const result: Array<{ lineNumber: number; content: string }> = [];
  for (let i = start; i <= end; i++) {
    result.push({ lineNumber: i, content: allLines[i - 1] ?? '' });
  }
  return result;
}

/**
 * 스택트레이스 프레임 텍스트 파싱 (내부 헬퍼)
 * 첫 사용자 코드(=파일명+.java/.kt 매치) 프레임에서 className/lineNumber 추출
 *
 * frames는 원본 문자열 배열 ("at com.example.Foo.bar(Foo.java:42)" 등)로 가정.
 */
function extractFirstUserFrame(frames: string[]): {
  className: string;
  lineNumber: number;
} | null {
  for (const frame of frames) {
    const m = frame.match(FRAME_PATTERN);
    if (!m) continue;
    const className = m[1];
    const lineNumber = parseInt(m[4], 10);
    if (!Number.isFinite(lineNumber) || lineNumber < 1) continue;
    // 프레임워크 패키지 제외 (사용자 코드 필터)
    if (isFrameworkClass(className)) continue;
    return { className, lineNumber };
  }
  return null;
}

// logParser.ts의 FRAMEWORK_PREFIXES와 동일 철학 (중복 허용 — 느슨한 결합 유지)
const FRAMEWORK_PREFIXES = [
  'java.',
  'javax.',
  'jakarta.',
  'sun.',
  'com.sun.',
  'jdk.',
  'org.springframework.',
  'org.apache.',
  'ch.qos.',
  'io.netty.',
  'reactor.',
  'com.zaxxer.',
  'org.hibernate.',
  'net.sf.cglib.',
  'org.objenesis.',
];

function isFrameworkClass(className: string): boolean {
  return FRAMEWORK_PREFIXES.some((p) => className.startsWith(p));
}

/**
 * 스택트레이스 배열에서 소스 파일을 찾아 컨텍스트 라인을 수집한다
 *
 * 동작:
 * 1. 각 stackTrace에서 첫 사용자 프레임 파싱
 * 2. 동일 className 중복 제거
 * 3. 최대 maxFiles까지 수집 (그 이상은 truncated=true)
 * 4. plugin-fs exists() → readTextFile() 순서로 후보 경로 시도
 * 5. scope denied → FILE_SCOPE_DENIED 즉시 throw (1차 파일에서 발생 시 abort)
 * 6. 1개 파일 없어도 다른 파일 수집 계속 (graceful)
 */
export async function resolveSources(
  stackTraces: NonNullable<AnalysisPayload['stackTraces']>,
  projectRoot: string,
  options: ResolveOptions = {},
): Promise<ResolveResult> {
  const maxFiles = options.maxFiles ?? 5;
  const contextLines = options.contextLines ?? 10;
  const signal = options.abortSignal;

  // plugin-fs dynamic import (CLAUDE.md 동적 import 패턴)
  const { exists, readTextFile } = await import('@tauri-apps/plugin-fs');

  const seenClasses = new Set<string>();
  const files: ResolveResult['files'] = [];
  let truncated = false;

  for (const trace of stackTraces) {
    if (signal?.aborted) break;
    if (files.length >= maxFiles) {
      truncated = true;
      break;
    }
    const userFrame = extractFirstUserFrame(trace.frames);
    if (!userFrame) continue;
    if (seenClasses.has(userFrame.className)) continue;
    seenClasses.add(userFrame.className);

    const candidates = buildPathCandidates(userFrame.className, projectRoot);
    let matchedPath: string | null = null;
    let content: string | null = null;

    for (const candidate of candidates) {
      if (signal?.aborted) break;
      let fileExists = false;
      try {
        fileExists = await exists(candidate);
      } catch (e) {
        // scope denied는 즉시 abort
        if (isScopeError(e)) {
          throw new AiApiError(
            'FILE_SCOPE_DENIED',
            'Project root is outside allowed file system scope',
          );
        }
        // 그 외 (파일 I/O 오류)는 무시하고 다음 후보 시도
        continue;
      }
      if (!fileExists) continue;
      try {
        content = await readTextFile(candidate);
        matchedPath = candidate;
        break;
      } catch (e) {
        if (isScopeError(e)) {
          throw new AiApiError(
            'FILE_SCOPE_DENIED',
            'Project root is outside allowed file system scope',
          );
        }
        // 다음 후보 시도
        continue;
      }
    }

    if (matchedPath === null || content === null) {
      // 후보 전부 실패 → 이 trace만 skip (graceful)
      continue;
    }

    const relevantLines = sliceContext(content, userFrame.lineNumber, contextLines);
    // projectRoot 기준 상대 경로 (보안: 전체 절대 경로 로그 금지)
    const relativePath = toRelativePath(matchedPath, projectRoot);
    files.push({ path: relativePath, relevantLines });
  }

  return { files, truncated };
}

/**
 * 전달될 소스 파일 목록을 미리 조회 (확인 모달용).
 * 실제 파일 내용은 읽지 않고 존재 여부만 확인하여 경로 목록을 반환한다.
 */
export async function previewSourceFiles(
  stackTraces: NonNullable<AnalysisPayload['stackTraces']>,
  projectRoot: string,
  maxFiles: number = 5,
): Promise<string[]> {
  const { exists } = await import('@tauri-apps/plugin-fs');
  const seenClasses = new Set<string>();
  const matchedPaths: string[] = [];

  for (const trace of stackTraces) {
    if (matchedPaths.length >= maxFiles) break;
    const userFrame = extractFirstUserFrame(trace.frames);
    if (!userFrame) continue;
    if (seenClasses.has(userFrame.className)) continue;
    seenClasses.add(userFrame.className);

    const candidates = buildPathCandidates(userFrame.className, projectRoot);
    for (const candidate of candidates) {
      try {
        if (await exists(candidate)) {
          matchedPaths.push(toRelativePath(candidate, projectRoot));
          break;
        }
      } catch {
        continue;
      }
    }
  }

  return matchedPaths;
}

/**
 * plugin-fs가 반환하는 에러에서 scope denied 판정
 * Tauri v2 plugin-fs는 scope 밖 접근 시 "forbidden path" 또는
 * "not allowed" 텍스트를 포함하는 에러를 throw한다.
 */
function isScopeError(e: unknown): boolean {
  if (!e) return false;
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  return (
    lower.includes('forbidden') ||
    lower.includes('not allowed') ||
    lower.includes('scope') ||
    lower.includes('permission denied')
  );
}

/**
 * 절대 경로를 projectRoot 기준 상대 경로로 변환 (pure)
 * projectRoot와 prefix가 일치하지 않으면 fileName만 반환 (보안: 절대 경로 유출 금지)
 */
function toRelativePath(absolutePath: string, projectRoot: string): string {
  const normalizedRoot = projectRoot.replace(/[\\/]+$/, '');
  if (absolutePath.startsWith(normalizedRoot)) {
    const rel = absolutePath.slice(normalizedRoot.length).replace(/^[\\/]+/, '');
    return rel;
  }
  // 매칭 실패 시 마지막 세그먼트만 노출
  const parts = absolutePath.split(/[\\/]/);
  return parts[parts.length - 1] ?? absolutePath;
}
