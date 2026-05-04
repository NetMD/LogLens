// 로컬 LLM 프로바이더 (Ollama / LM Studio — OpenAI 호환 API)
// Tauri WebView 에서 localhost 요청 시 브라우저 fetch 는 CORS 제한에 걸리므로
// 반드시 @tauri-apps/plugin-http 의 fetch 를 사용해야 한다.

import { fetch } from '@tauri-apps/plugin-http';
import type { AiProviderAdapter, AiReportRequest, AiReportResponse } from '../types';
import { AiApiError } from '../types';
import { useSettingsStore } from '../../../store/settingsStore';

/**
 * 로컬 LLM 엔드포인트 + 모델명을 settingsStore 에서 읽어온다.
 * provider.send() 의 apiKey/model 파라미터 대신 여기서 가져오는 이유:
 * - 로컬 LLM 은 API 키가 없고, 모델명/엔드포인트가 설정에 저장됨
 */
function getLocalConfig(): { endpoint: string; model: string } {
  const s = useSettingsStore.getState();
  return {
    endpoint: s.localLlmEndpoint || 'http://localhost:11434',
    model: s.localLlmModel || '',
  };
}

/**
 * 연결 테스트 — Ollama (GET /api/tags) 와 LM Studio (GET /v1/models) 를
 * 둘 다 시도해서 하나라도 성공하면 연결됨으로 판정.
 *
 * @returns 연결된 경우 { ok: true, modelInfo: string }, 실패 시 { ok: false, error: string }
 */
export async function testLocalConnection(
  endpoint: string,
): Promise<{ ok: true; modelInfo: string } | { ok: false; error: string }> {
  const trimmed = endpoint.replace(/\/+$/, '');

  // Ollama: GET /api/tags
  const tryOllama = async (): Promise<string | null> => {
    try {
      const res = await fetch(`${trimmed}/api/tags`, {
        method: 'GET',
        connectTimeout: 5000,
      });
      if (!res.ok) return null;
      const json = await res.json();
      const models = Array.isArray(json?.models) ? json.models : [];
      if (models.length === 0) return null;
      return `Ollama (${models.length}개 모델)`;
    } catch {
      return null;
    }
  };

  // LM Studio / OpenAI 호환: GET /v1/models
  const tryOpenAiCompat = async (): Promise<string | null> => {
    try {
      const res = await fetch(`${trimmed}/v1/models`, {
        method: 'GET',
        connectTimeout: 5000,
      });
      if (!res.ok) return null;
      const json = await res.json();
      const data = Array.isArray(json?.data) ? json.data : [];
      if (data.length === 0) return '연결됨 (모델 없음)';
      return `연결됨 (${data.length}개 모델)`;
    } catch {
      return null;
    }
  };

  const [ollamaResult, openaiResult] = await Promise.all([tryOllama(), tryOpenAiCompat()]);

  if (ollamaResult) return { ok: true, modelInfo: ollamaResult };
  if (openaiResult) return { ok: true, modelInfo: openaiResult };
  return { ok: false, error: '연결 실패 — Ollama 또는 LM Studio가 실행 중인지 확인하세요' };
}

export class LocalProvider implements AiProviderAdapter {
  async send(
    request: AiReportRequest,
    _apiKey: string,
    _model: string,
    signal?: AbortSignal,
    _onDelta?: (delta: string) => void,
  ): Promise<AiReportResponse> {
    const { endpoint, model } = getLocalConfig();

    if (!model) {
      throw new AiApiError('API_KEY_NOT_CONFIGURED', '로컬 LLM 모델명이 설정되지 않았습니다. 설정에서 모델명을 입력해 주세요.');
    }

    const url = `${endpoint.replace(/\/+$/, '')}/v1/chat/completions`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          max_tokens: request.maxTokens,
          stream: false,
        }),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw new AiApiError('ABORTED', '');
      const msg = e instanceof Error ? e.message : 'Network error';
      throw new AiApiError('NETWORK_ERROR', `로컬 LLM 연결 실패: ${msg}`);
    }

    if (signal?.aborted) throw new AiApiError('ABORTED', '');

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = (await response.text()).slice(0, 300);
      } catch { /* ignore */ }

      if (response.status >= 500) {
        throw new AiApiError('SERVER_ERROR', `로컬 LLM 서버 오류 ${response.status}${errorBody ? ` — ${errorBody}` : ''}`);
      }
      throw new AiApiError('SERVER_ERROR', `HTTP ${response.status}${errorBody ? ` — ${errorBody}` : ''}`);
    }

    try {
      const json = await response.json();
      const content = json.choices?.[0]?.message?.content ?? '';
      return {
        content,
        tokensUsed: json.usage?.completion_tokens,
      };
    } catch {
      throw new AiApiError('PARSE_ERROR', '로컬 LLM 응답 파싱 실패');
    }
  }

  /**
   * 로컬 LLM 모델 목록 조회
   * Ollama: GET /api/tags → models[].name
   * OpenAI 호환: GET /v1/models → data[].id
   */
  async listModels(_apiKey: string, signal?: AbortSignal): Promise<string[]> {
    const { endpoint } = getLocalConfig();
    const trimmed = endpoint.replace(/\/+$/, '');
    const models: string[] = [];

    // Ollama
    try {
      const res = await fetch(`${trimmed}/api/tags`, { method: 'GET', signal });
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json?.models) ? json.models : [];
        for (const m of list) {
          if (typeof m.name === 'string') models.push(m.name);
        }
      }
    } catch { /* ignore */ }

    // OpenAI 호환
    if (models.length === 0) {
      try {
        const res = await fetch(`${trimmed}/v1/models`, { method: 'GET', signal });
        if (res.ok) {
          const json = await res.json();
          const data = Array.isArray(json?.data) ? json.data : [];
          for (const m of data) {
            if (typeof m.id === 'string') models.push(m.id);
          }
        }
      } catch { /* ignore */ }
    }

    if (models.length === 0) {
      throw new AiApiError('NETWORK_ERROR', '로컬 LLM에서 모델 목록을 가져올 수 없습니다. 서버가 실행 중인지 확인하세요.');
    }

    return models.sort();
  }
}
