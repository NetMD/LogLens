// SSE (Server-Sent Events) 공통 리더
// Claude / OpenAI / Gemini 3 프로바이더 스트리밍 공유 유틸
// R-01 검증: Tauri plugin-http 2.5.8은 response.body를 표준 ReadableStream으로 제공

import { AiApiError } from '../types';

/**
 * 프로바이더별 청크 파서
 * - dataLine: "data: " 접두어가 제거된 JSON 문자열 또는 "[DONE]"
 * - 반환: delta 텍스트(있을 때) 또는 null (keep-alive/무시 대상)
 */
export type DeltaExtractor = (dataLine: string) => string | null;

/**
 * SSE 버퍼에서 완전한 라인만 추출 (pure, 단위 테스트 대상)
 * 개행 문자 기준으로 split 하되, 마지막 미완성 라인은 remainder로 반환.
 *
 * SSE 스펙: 라인 구분자는 LF / CRLF / CR 모두 허용.
 * 본 구현은 LF/CRLF 중심으로 처리 (대부분 API).
 *
 * @example
 *   parseSseLines('data: a\n\ndata: b\n')
 *   // → { lines: ['data: a', ''], remainder: 'data: b\n' }
 */
export function parseSseLines(buffer: string): {
  lines: string[];
  remainder: string;
} {
  // 버퍼에 개행이 없으면 전체가 미완성
  const lastNewlineIdx = buffer.lastIndexOf('\n');
  if (lastNewlineIdx === -1) {
    return { lines: [], remainder: buffer };
  }
  // 마지막 개행 이전까지는 완성된 라인들, 이후는 remainder
  const completed = buffer.slice(0, lastNewlineIdx);
  const remainder = buffer.slice(lastNewlineIdx + 1);
  // CRLF 정규화 후 LF split
  const lines = completed.replace(/\r\n/g, '\n').split('\n');
  return { lines, remainder };
}

/**
 * Response body (ReadableStream<Uint8Array>)를 SSE 파싱하여 delta를 onDelta로 방출
 *
 * Path A (정상): response.body.getReader() 스트리밍
 * Path B (fallback): response.body === null이면 response.text()로 일괄 수신 후 onDelta 1회 호출
 *
 * @param response  @tauri-apps/plugin-http fetch 응답
 * @param extractor 프로바이더별 data 라인 파서
 * @param onDelta   delta 텍스트 콜백 (exportStore.appendStreamingBuffer 연결용)
 * @param signal    AbortSignal (reader.cancel() 연결)
 * @returns 누적 응답 전체 텍스트
 */
export async function readSseStream(
  response: Response,
  extractor: DeltaExtractor,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  // Path B: response.body가 없으면 일괄 텍스트 fallback
  if (!response.body) {
    try {
      const text = await response.text();
      // 비스트리밍 경로에서는 SSE 라인 파싱을 시도하여 delta만 추출
      // (extractor가 처리 가능한 경우), 실패하면 전체를 1회 delta로 처리
      const accumulated = parseSseBufferOnce(text, extractor);
      if (accumulated !== null && accumulated.length > 0) {
        onDelta(accumulated);
        return accumulated;
      }
      // 파싱 불가 → 전체 텍스트 그대로 반환 (non-SSE JSON 응답 가능성)
      return text;
    } catch (e) {
      if (e instanceof AiApiError) throw e;
      throw new AiApiError('PARSE_ERROR', 'Failed to read response body');
    }
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulated = '';
  // 개발 모드 진단용 통계 (청크/라인/delta 카운트)
  let chunkCount = 0;
  let dataLineCount = 0;
  let deltaCount = 0;

  // abort 시 reader.cancel() 전파
  const onAbort = (): void => {
    void reader.cancel().catch(() => undefined);
  };
  if (signal) {
    if (signal.aborted) {
      onAbort();
      throw new AiApiError('ABORTED', '');
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    while (true) {
      // abort 체크 (read 사이)
      if (signal?.aborted) {
        throw new AiApiError('ABORTED', '');
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunkCount++;

      buffer += decoder.decode(value, { stream: true });
      const { lines, remainder } = parseSseLines(buffer);
      buffer = remainder;

      for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        // 빈 라인은 이벤트 구분자 — 무시
        if (line.length === 0) continue;
        // `data: ` 접두어만 처리 (id:, event:, retry: 등은 무시)
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data.length === 0) continue;
        dataLineCount++;
        if (data === '[DONE]') {
          // SSE 스트림 종료
          if (import.meta.env.DEV) {
            console.log(
              '[sseReader] stream DONE',
              { chunkCount, dataLineCount, deltaCount, accumulatedLength: accumulated.length },
            );
          }
          return accumulated;
        }
        const delta = extractor(data);
        if (delta !== null && delta.length > 0) {
          accumulated += delta;
          deltaCount++;
          onDelta(delta);
        }
      }
    }

    // 마지막 remainder가 `data:`로 시작하면 처리 (개행 없이 스트림 종료된 경우)
    const tail = buffer.trim();
    if (tail.startsWith('data:')) {
      const data = tail.slice(5).trim();
      if (data.length > 0 && data !== '[DONE]') {
        const delta = extractor(data);
        if (delta !== null && delta.length > 0) {
          accumulated += delta;
          deltaCount++;
          onDelta(delta);
        }
      }
    }

    // [DONE] 없이 스트림이 조용히 끝난 경우 — empty page 원인 진단
    if (import.meta.env.DEV) {
      if (accumulated.length === 0) {
        console.warn(
          '[sseReader] stream ended with EMPTY accumulated buffer — possible SSE format mismatch',
          {
            chunkCount,
            dataLineCount,
            deltaCount,
            bufferRemainder: buffer.slice(0, 500),
          },
        );
      } else {
        console.log(
          '[sseReader] stream ended (no [DONE] sentinel)',
          { chunkCount, dataLineCount, deltaCount, accumulatedLength: accumulated.length },
        );
      }
    }

    return accumulated;
  } catch (e) {
    // AbortError / signal.aborted 판정
    if (signal?.aborted || (e instanceof Error && e.name === 'AbortError')) {
      throw new AiApiError('ABORTED', '');
    }
    if (e instanceof AiApiError) throw e;
    // 파싱/read 오류는 PARSE_ERROR로 래핑 (메시지에 입력값/key 포함 금지)
    throw new AiApiError('PARSE_ERROR', 'Failed to parse SSE stream');
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
    try {
      reader.releaseLock();
    } catch {
      // 이미 cancel/close 된 경우 무시
    }
  }
}

/**
 * 비스트리밍 fallback 전용: 전체 텍스트 버퍼에서 한 번에 SSE delta를 추출
 * Path B에서만 사용. extractor가 유효한 delta를 하나라도 반환하면 누적 텍스트를 돌려준다.
 */
function parseSseBufferOnce(text: string, extractor: DeltaExtractor): string | null {
  const { lines } = parseSseLines(text + '\n');
  let accumulated = '';
  let sawAny = false;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data.length === 0 || data === '[DONE]') continue;
    sawAny = true;
    const delta = extractor(data);
    if (delta !== null && delta.length > 0) {
      accumulated += delta;
    }
  }
  return sawAny ? accumulated : null;
}
