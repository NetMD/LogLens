// OpenAI AI 프로바이더 어댑터 (8차 스트리밍 확장)

import { fetch } from '@tauri-apps/plugin-http';
import type { AiProviderAdapter, AiReportRequest, AiReportResponse } from '../types';
import { AiApiError } from '../types';
import { readSseStream, type DeltaExtractor } from './sseReader';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MODELS_ENDPOINT = 'https://api.openai.com/v1/models';

/**
 * Reasoning 모델 판정 (max_completion_tokens 사용 여부).
 * OpenAI 의 reasoning 모델 (o1/o3/o4/gpt-5/gpt-5.x) 은
 * `max_tokens` 파라미터 대신 `max_completion_tokens` 를 요구하며,
 * 일부는 `stream` 지원이 제한될 수 있음.
 *
 * 패턴:
 *  - o1, o1-*, o1-pro, o1-preview
 *  - o3, o3-*, o3-mini
 *  - o4, o4-mini
 *  - gpt-5, gpt-5-*, gpt-5.1, gpt-5.2, gpt-5.3, gpt-5.4 ...
 *    (단 gpt-5-chat-latest / gpt-5.1-chat-latest 같은 chat variant 는 reasoning 취급 X)
 */
function isReasoningModel(model: string): boolean {
  // o-series
  if (/^o\d+(-|$)/.test(model)) return true;
  // gpt-5 / gpt-5.x 계열 (단 -chat-latest 는 제외)
  if (/^gpt-5(\.\d+)?(-|$)/.test(model)) {
    if (model.includes('-chat-latest')) return false;
    return true;
  }
  return false;
}

/**
 * OpenAI 에러 응답 바디 파서.
 * 공식 포맷: { error: { message, type, code } }
 */
async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return '';
    try {
      const json = JSON.parse(text);
      if (json?.error?.message && typeof json.error.message === 'string') {
        const code = json.error.code ? ` (${json.error.code})` : '';
        return `[${json.error.type ?? 'error'}${code}] ${json.error.message}`.slice(0, 400);
      }
    } catch {
      // raw text
    }
    return text.slice(0, 300);
  } catch {
    return '';
  }
}

/**
 * OpenAI SSE delta 추출기
 *
 * Chat Completions API SSE 구조:
 *   data: {"choices":[{"delta":{"content":"Hello"}}]}
 *   data: [DONE]
 *
 * - choices[0].delta.content에서 delta 추출
 * - include_usage=true일 때 usage 청크는 choices=[] → null 반환
 */
const openaiExtractor: DeltaExtractor = (dataLine) => {
  try {
    const json = JSON.parse(dataLine);
    const content = json.choices?.[0]?.delta?.content;
    return typeof content === 'string' ? content : null;
  } catch {
    return null;
  }
};

export class OpenAiProvider implements AiProviderAdapter {
  async send(
    request: AiReportRequest,
    apiKey: string,
    model: string,
    signal?: AbortSignal,
    onDelta?: (delta: string) => void,
  ): Promise<AiReportResponse> {
    const isStreaming = onDelta !== undefined;

    // Reasoning 모델 (o-series, gpt-5.x) 은 파라미터 구조가 다름
    const reasoning = isReasoningModel(model);
    // reasoning 모델: max_completion_tokens, 나머지: max_tokens
    const tokenParam = reasoning
      ? { max_completion_tokens: request.maxTokens }
      : { max_tokens: request.maxTokens };

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          ...tokenParam,
          messages: [
            // reasoning 모델은 일부 버전에서 system role 대신 developer role 을 사용하지만,
            // 현재 OpenAI API 는 system 도 계속 허용하므로 system 유지.
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          stream: isStreaming,
          ...(isStreaming ? { stream_options: { include_usage: true } } : {}),
        }),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw new AiApiError('ABORTED', '');
      const msg = e instanceof Error ? e.message : 'Network error';
      throw new AiApiError('NETWORK_ERROR', msg);
    }

    if (signal?.aborted) throw new AiApiError('ABORTED', '');

    if (!response.ok) {
      const errorBody = await readErrorBody(response);
      if (import.meta.env.DEV) {
        console.error(
          '[OpenAI] HTTP',
          response.status,
          response.statusText,
          '\nrequest:',
          { model, isStreaming, maxTokens: request.maxTokens },
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
      // 400, 404 등
      throw new AiApiError(
        'SERVER_ERROR',
        `HTTP ${response.status}${errorBody ? ` — ${errorBody}` : ''}`,
      );
    }

    if (import.meta.env.DEV) {
      console.log('[OpenAI] response OK', {
        status: response.status,
        hasBody: response.body !== null,
        contentType: response.headers.get('content-type'),
      });
    }

    // 스트리밍 경로
    if (isStreaming && onDelta) {
      const content = await readSseStream(response, openaiExtractor, onDelta, signal);
      if (import.meta.env.DEV) {
        console.log('[OpenAI] stream complete', {
          contentLength: content.length,
          firstChars: content.slice(0, 100),
        });
      }
      return { content };
    }

    // Non-stream 경로 (하위 호환)
    try {
      const json = await response.json();
      const content = json.choices?.[0]?.message?.content ?? '';
      if (import.meta.env.DEV) {
        console.log('[OpenAI] non-stream complete', {
          contentLength: content.length,
          finishReason: json.choices?.[0]?.finish_reason,
        });
      }
      return {
        content,
        tokensUsed: json.usage?.completion_tokens,
      };
    } catch {
      throw new AiApiError('PARSE_ERROR', 'Failed to parse response');
    }
  }

  /**
   * GET /v1/models 로 실제 사용 가능한 OpenAI 모델 목록을 조회
   * 응답 포맷: { data: [{ id, object, created, owned_by }], object: 'list' }
   *
   * OpenAI 는 chat 모델 전용 엔드포인트가 없으므로, id 접두어로 필터링.
   * gpt-* / o1* / o3* / o4* 등 Chat Completions 지원 모델만 반환.
   */
  async listModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
    let response: Response;
    try {
      response = await fetch(MODELS_ENDPOINT, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
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
        console.error('[OpenAI] listModels HTTP', response.status, errorBody);
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
      // Chat Completions 지원 모델만 필터링 (gpt-*, o1*, o3*, o4*, chatgpt-*)
      // embedding / tts / whisper / dall-e / moderation 등은 제외
      const chatModelPattern = /^(gpt-|o1|o3|o4|chatgpt-)/;
      return data
        .map((m: { id?: unknown }) => (typeof m.id === 'string' ? m.id : ''))
        .filter((id: string) => id.length > 0 && chatModelPattern.test(id))
        .sort();
    } catch {
      throw new AiApiError('PARSE_ERROR', 'Failed to parse models response');
    }
  }
}
