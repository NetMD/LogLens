// Claude (Anthropic) AI 프로바이더 어댑터 (8차 스트리밍 확장)

import { fetch } from '@tauri-apps/plugin-http';
import type { AiProviderAdapter, AiReportRequest, AiReportResponse } from '../types';
import { AiApiError } from '../types';
import { readSseStream, type DeltaExtractor } from './sseReader';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODELS_ENDPOINT = 'https://api.anthropic.com/v1/models';
const API_VERSION = '2023-06-01';

/**
 * 에러 응답 바디를 최대한 짧게 읽어 사람이 읽을 수 있는 문자열로 반환.
 * Anthropic 공식 에러 포맷: { type: "error", error: { type: "...", message: "..." } }
 * 파싱 실패 시 raw text 를 길이 제한(300자)해서 반환.
 * 키/토큰 노출 방지를 위해 `key=...` 패턴은 마스킹.
 */
async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return '';
    // JSON 시도
    try {
      const json = JSON.parse(text);
      if (json?.error?.message && typeof json.error.message === 'string') {
        return `[${json.error.type ?? 'error'}] ${json.error.message}`.slice(0, 400);
      }
    } catch {
      // JSON이 아니면 raw text 사용
    }
    const masked = text.replace(/key=[^&\s"]+/g, 'key=***');
    return masked.slice(0, 300);
  } catch {
    return '';
  }
}

/**
 * 개발 모드용 API 키 메타데이터 진단 로그
 * 키 자체는 노출하지 않고 길이/접두사/접미사/공백·비ASCII 포함 여부만 출력.
 * 사용자가 "키가 잘못됐다" 는 에러를 받을 때 입력값 이상(trailing 공백, BOM 등) 감지용.
 */
function logKeyDiagnostics(
  context: string,
  apiKey: string,
  originalKey: string,
): void {
  if (!import.meta.env.DEV) return;
  const hasWhitespaceOriginal = /\s/.test(originalKey);
  const hasNonAsciiOriginal = /[^\x20-\x7e]/.test(originalKey);
  const charCodes = Array.from(originalKey.slice(-5))
    .map((c) => c.charCodeAt(0))
    .join(',');
  console.log(`[Claude] ${context} key diagnostics`, {
    originalLength: originalKey.length,
    trimmedLength: apiKey.length,
    trimmedPrefix: apiKey.slice(0, 14),
    trimmedSuffix: apiKey.slice(-4),
    hasWhitespaceInOriginal: hasWhitespaceOriginal,
    hasNonAsciiInOriginal: hasNonAsciiOriginal,
    lastFiveCharCodes: charCodes,
    trimApplied: originalKey.length !== apiKey.length,
  });
}

/**
 * Claude SSE delta 추출기
 *
 * Anthropic Messages API SSE 이벤트 구조:
 *   event: content_block_delta
 *   data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}
 *
 * content_block_delta + text_delta 조합에서만 text를 추출.
 * message_start/message_stop/ping 등 다른 이벤트는 null 반환.
 */
const claudeExtractor: DeltaExtractor = (dataLine) => {
  try {
    const json = JSON.parse(dataLine);
    if (
      json.type === 'content_block_delta' &&
      json.delta?.type === 'text_delta' &&
      typeof json.delta.text === 'string'
    ) {
      return json.delta.text;
    }
    return null;
  } catch {
    return null;
  }
};

export class ClaudeProvider implements AiProviderAdapter {
  async send(
    request: AiReportRequest,
    apiKey: string,
    model: string,
    signal?: AbortSignal,
    onDelta?: (delta: string) => void,
  ): Promise<AiReportResponse> {
    const isStreaming = onDelta !== undefined;

    // Defensive trim: sanitizeApiKeys 에서 이미 trim 되지만, 혹시 run-time setSettings 로
    // 우회 주입되거나 legacy 값이 살아있는 경우 대비
    const cleanKey = apiKey.trim();
    logKeyDiagnostics('send', cleanKey, apiKey);

    const requestHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': cleanKey,
      'anthropic-version': API_VERSION,
      // Anthropic 이 브라우저/WebView 컨텍스트에서의 직접 호출을 기본 차단하기 때문에
      // 명시적으로 "나는 이 위험을 알고 있다" opt-in 헤더를 달아야 한다.
      // Tauri 데스크탑 앱은 키가 로컬에만 있으므로 실질적 위험은 없음.
      // https://docs.anthropic.com/en/api/client-sdks#browser-compat
      'anthropic-dangerous-direct-browser-access': 'true',
    };

    if (import.meta.env.DEV) {
      console.log('[Claude] send request', {
        url: ENDPOINT,
        method: 'POST',
        model,
        headerKeys: Object.keys(requestHeaders),
        xApiKeyHeaderLength: requestHeaders['x-api-key'].length,
        xApiKeyHeaderFirst14: requestHeaders['x-api-key'].slice(0, 14),
      });
    }

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          model,
          max_tokens: request.maxTokens,
          system: request.systemPrompt,
          messages: [{ role: 'user', content: request.userPrompt }],
          stream: isStreaming,
        }),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw new AiApiError('ABORTED', '');
      const msg = e instanceof Error ? e.message : 'Network error';
      throw new AiApiError('NETWORK_ERROR', msg);
    }

    if (signal?.aborted) throw new AiApiError('ABORTED', '');

    // 에러 응답 바디를 한 번만 읽어 개발 모드 로깅 및 에러 메시지에 포함
    // 정상 응답(!response.ok === false) 시에만 읽음 — 정상 스트리밍 본문은 건드리지 않음
    if (!response.ok) {
      const errorBody = await readErrorBody(response);
      if (import.meta.env.DEV) {
        console.error(
          '[Claude] HTTP',
          response.status,
          response.statusText,
          '\nrequest:',
          { model, isStreaming, hasSystem: !!request.systemPrompt },
          '\nresponse body:',
          errorBody,
        );
      }
      if (response.status === 401) {
        throw new AiApiError(
          'INVALID_API_KEY',
          `Invalid API key (401)${errorBody ? ` — ${errorBody}` : ''}`,
        );
      }
      if (response.status === 429) {
        throw new AiApiError(
          'RATE_LIMIT',
          `Rate limit exceeded${errorBody ? ` — ${errorBody}` : ''}`,
        );
      }
      if (response.status >= 500) {
        throw new AiApiError(
          'SERVER_ERROR',
          `Server error ${response.status}${errorBody ? ` — ${errorBody}` : ''}`,
        );
      }
      // 400, 404 등 — Claude는 존재하지 않는 모델/잘못된 요청에 400 반환
      throw new AiApiError(
        'SERVER_ERROR',
        `HTTP ${response.status}${errorBody ? ` — ${errorBody}` : ''}`,
      );
    }

    // 스트리밍 경로
    if (isStreaming && onDelta) {
      const content = await readSseStream(response, claudeExtractor, onDelta, signal);
      return { content };
    }

    // Non-stream 경로 (하위 호환)
    try {
      const json = await response.json();
      return {
        content: json.content?.[0]?.text ?? '',
        tokensUsed: json.usage?.output_tokens,
      };
    } catch {
      throw new AiApiError('PARSE_ERROR', 'Failed to parse response');
    }
  }

  /**
   * GET /v1/models 로 실제 사용 가능한 Claude 모델 목록을 조회
   * 응답 포맷: { data: [{ id, display_name, created_at, type }], has_more, first_id, last_id }
   */
  async listModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
    const cleanKey = apiKey.trim();
    logKeyDiagnostics('listModels', cleanKey, apiKey);

    const requestHeaders = {
      'x-api-key': cleanKey,
      'anthropic-version': API_VERSION,
      // 브라우저/WebView 호출 opt-in (send() 와 동일 사유)
      'anthropic-dangerous-direct-browser-access': 'true',
    };

    if (import.meta.env.DEV) {
      console.log('[Claude] listModels request', {
        url: MODELS_ENDPOINT,
        method: 'GET',
        // 헤더 key 만 로깅 (값은 logKeyDiagnostics 에서 메타데이터로 이미 기록)
        headerKeys: Object.keys(requestHeaders),
        xApiKeyHeaderLength: requestHeaders['x-api-key'].length,
        xApiKeyHeaderFirst14: requestHeaders['x-api-key'].slice(0, 14),
      });
    }

    let response: Response;
    try {
      response = await fetch(MODELS_ENDPOINT, {
        method: 'GET',
        headers: requestHeaders,
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw new AiApiError('ABORTED', '');
      const msg = e instanceof Error ? e.message : 'Network error';
      throw new AiApiError('NETWORK_ERROR', msg);
    }

    if (!response.ok) {
      const errorBody = await readErrorBody(response);
      if (import.meta.env.DEV) {
        console.error('[Claude] listModels HTTP', response.status, errorBody);
      }
      if (response.status === 401) {
        throw new AiApiError(
          'INVALID_API_KEY',
          `Invalid API key${errorBody ? ` — ${errorBody}` : ''}`,
        );
      }
      if (response.status === 429) {
        throw new AiApiError('RATE_LIMIT', `Rate limit exceeded${errorBody ? ` — ${errorBody}` : ''}`);
      }
      throw new AiApiError(
        'SERVER_ERROR',
        `HTTP ${response.status}${errorBody ? ` — ${errorBody}` : ''}`,
      );
    }

    try {
      const json = await response.json();
      const data = Array.isArray(json?.data) ? json.data : [];
      return data
        .map((m: { id?: unknown }) => (typeof m.id === 'string' ? m.id : ''))
        .filter((id: string) => id.length > 0);
    } catch {
      throw new AiApiError('PARSE_ERROR', 'Failed to parse models response');
    }
  }
}
