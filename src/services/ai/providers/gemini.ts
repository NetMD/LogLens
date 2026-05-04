// Google Gemini AI 프로바이더 어댑터 (8차 스트리밍 확장)

import { fetch } from '@tauri-apps/plugin-http';
import type { AiProviderAdapter, AiReportRequest, AiReportResponse } from '../types';
import { AiApiError } from '../types';
import { readSseStream, type DeltaExtractor } from './sseReader';

/**
 * Gemini SSE delta 추출기
 *
 * streamGenerateContent?alt=sse SSE 구조:
 *   data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}
 */
const geminiExtractor: DeltaExtractor = (dataLine) => {
  try {
    const json = JSON.parse(dataLine);
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  }
};

/**
 * Gemini 에러 응답 바디 파서 (key 마스킹 적용).
 * 공식 포맷: { error: { code, message, status, details } }
 * 또는 safety block 시: { promptFeedback: { blockReason, safetyRatings } }
 */
async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return '';
    // URL/key 유출 방지 마스킹
    const masked = text.replace(/key=[^&\s"]+/g, 'key=***');
    try {
      const json = JSON.parse(masked);
      if (json?.error?.message && typeof json.error.message === 'string') {
        return `[${json.error.status ?? json.error.code ?? 'error'}] ${json.error.message}`.slice(0, 400);
      }
      if (json?.promptFeedback?.blockReason) {
        return `[safety] Blocked: ${json.promptFeedback.blockReason}`.slice(0, 400);
      }
    } catch {
      // raw text
    }
    return masked.slice(0, 300);
  } catch {
    return '';
  }
}

export class GeminiProvider implements AiProviderAdapter {
  async send(
    request: AiReportRequest,
    apiKey: string,
    model: string,
    signal?: AbortSignal,
    onDelta?: (delta: string) => void,
  ): Promise<AiReportResponse> {
    const isStreaming = onDelta !== undefined;

    // 스트리밍 여부에 따라 엔드포인트 분기
    // 주의: API 키가 URL 파라미터로 포함되므로 에러 메시지에서 URL 노출 금지
    const endpoint = isStreaming
      ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`
      : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // role: 'user' 를 명시 — v1beta 는 단일 turn 에서도 role 누락 시 400 가능
          contents: [
            {
              role: 'user',
              parts: [{ text: request.userPrompt }],
            },
          ],
          // systemInstruction 에도 role 명시 (parts 배열만 넣으면 v1beta 에서 거부되는 케이스 보고 있음)
          systemInstruction: {
            role: 'system',
            parts: [{ text: request.systemPrompt }],
          },
          generationConfig: {
            maxOutputTokens: request.maxTokens,
          },
          // 로그 내용이 "harmful" 로 잘못 분류되는 것 방지 — 서버 에러/빈 응답 원인 제거
          // (에러 스택, 예외 메시지 등이 Gemini 기본 safety 에 걸리는 사례 있음)
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw new AiApiError('ABORTED', '');
      // URL에 API 키가 포함되므로 원본 에러 메시지를 그대로 노출하지 않음
      const msg = e instanceof Error ? e.message : 'Network error';
      // 혹시 메시지에 URL이 포함되어 있다면 key 파라미터 제거
      const sanitized = msg.replace(/key=[^&\s]+/g, 'key=***');
      throw new AiApiError('NETWORK_ERROR', sanitized);
    }

    if (signal?.aborted) throw new AiApiError('ABORTED', '');

    if (!response.ok) {
      const errorBody = await readErrorBody(response);
      if (import.meta.env.DEV) {
        console.error(
          '[Gemini] HTTP',
          response.status,
          response.statusText,
          '\nrequest:',
          { model, isStreaming, maxTokens: request.maxTokens },
          '\nresponse body:',
          errorBody,
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new AiApiError(
          'INVALID_API_KEY',
          `Invalid API key (${response.status})${errorBody ? ` — ${errorBody}` : ''}`,
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
      // 400, 404 등 — Gemini는 잘못된 요청 포맷/모델명에 400 반환
      throw new AiApiError(
        'SERVER_ERROR',
        `HTTP ${response.status}${errorBody ? ` — ${errorBody}` : ''}`,
      );
    }

    // 스트리밍 경로
    if (isStreaming && onDelta) {
      const content = await readSseStream(response, geminiExtractor, onDelta, signal);
      return { content };
    }

    // Non-stream 경로 (하위 호환)
    try {
      const json = await response.json();
      return {
        content: json.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
        tokensUsed: json.usageMetadata?.candidatesTokenCount,
      };
    } catch {
      throw new AiApiError('PARSE_ERROR', 'Failed to parse response');
    }
  }

  /**
   * GET /v1beta/models?key=... 로 실제 사용 가능한 Gemini 모델 목록 조회
   * 응답 포맷: { models: [{ name: 'models/gemini-xxx', displayName, supportedGenerationMethods: [...], ... }] }
   *
   * generateContent 를 지원하는 모델만 필터링하고, 'models/' prefix 는 제거하여 short ID 반환.
   * 임베딩/tts 등은 자동 제외됨.
   */
  async listModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'GET',
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw new AiApiError('ABORTED', '');
      const msg = e instanceof Error ? e.message : 'Network error';
      const sanitized = msg.replace(/key=[^&\s]+/g, 'key=***');
      throw new AiApiError('NETWORK_ERROR', sanitized);
    }

    if (!response.ok) {
      const errorBody = await readErrorBody(response);
      if (import.meta.env.DEV) {
        console.error('[Gemini] listModels HTTP', response.status, errorBody);
      }
      if (response.status === 401 || response.status === 403) {
        throw new AiApiError(
          'INVALID_API_KEY',
          `Invalid API key (${response.status})${errorBody ? ` — ${errorBody}` : ''}`,
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
      const models = Array.isArray(json?.models) ? json.models : [];
      return models
        .filter((m: { supportedGenerationMethods?: unknown }) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent'),
        )
        .map((m: { name?: unknown }) => {
          if (typeof m.name !== 'string') return '';
          // 'models/gemini-2.5-flash' → 'gemini-2.5-flash'
          return m.name.replace(/^models\//, '');
        })
        .filter((id: string) => id.length > 0)
        .sort();
    } catch {
      throw new AiApiError('PARSE_ERROR', 'Failed to parse models response');
    }
  }
}
