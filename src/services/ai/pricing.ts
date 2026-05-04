// AI 모델 가격표 (USD per 1M output tokens, 추정값)
// - 각 provider 의 공식 가격 페이지 기준 대략값
// - 가격은 자주 바뀌므로 표시할 때 "추정" 임을 명시할 것
// - response.tokensUsed 는 대부분 완성(output) 토큰만 포함하므로 input 가격은 생략

import type { AiProvider } from '../../types/settings';

/**
 * 모델별 Output 토큰 1M 당 가격 (USD).
 * 매칭되는 키가 없으면 undefined 를 반환하고, 호출부는 "알 수 없음" 으로 처리.
 *
 * 참조 (2026-04 기준 대략값):
 *  - Claude: https://www.anthropic.com/pricing
 *  - OpenAI: https://openai.com/api/pricing/
 *  - Gemini: https://ai.google.dev/pricing
 */
const OUTPUT_PRICE_PER_1M_USD: Record<string, number> = {
  // --- Claude ---
  'claude-opus-4-6': 75,
  'claude-sonnet-4-6': 15,
  'claude-haiku-4-5': 5,
  'claude-haiku-4-5-20251001': 5,
  'claude-opus-4-5': 75,
  'claude-opus-4-5-20251101': 75,
  'claude-sonnet-4-5': 15,
  'claude-sonnet-4-5-20250929': 15,
  'claude-opus-4-1': 75,
  'claude-opus-4-1-20250805': 75,
  'claude-opus-4-0': 75,
  'claude-opus-4-20250514': 75,
  'claude-sonnet-4-0': 15,
  'claude-sonnet-4-20250514': 15,
  'claude-3-5-sonnet-20241022': 15,
  'claude-3-5-haiku-20241022': 5,
  'claude-3-opus-20240229': 75,

  // --- OpenAI ---
  'gpt-4o': 10,
  'gpt-4o-mini': 0.6,
  'gpt-4.1': 8,
  'gpt-4.1-mini': 1.6,
  'gpt-4.1-nano': 0.4,
  'gpt-4-turbo': 30,
  'gpt-4': 60,
  // GPT-5 시리즈 (추정치 — 정확한 공식 가격 확인 필요)
  'gpt-5': 60,
  'gpt-5-mini': 2,
  'gpt-5-nano': 0.4,
  'gpt-5-pro': 120,
  'gpt-5.1': 60,
  'gpt-5.1-mini': 2,
  'gpt-5.1-codex': 60,
  'gpt-5.2': 60,
  'gpt-5.2-pro': 120,
  // o-series
  'o1': 60,
  'o1-pro': 600,
  'o3': 60,
  'o3-mini': 4.4,
  'o4-mini': 4.4,
  // Legacy
  'gpt-3.5-turbo': 1.5,

  // --- Gemini ---
  'gemini-2.5-flash': 2.5,
  'gemini-2.5-flash-lite': 0.4,
  'gemini-2.5-pro': 10,
  'gemini-2.0-flash': 0.4,
  'gemini-2.0-flash-001': 0.4,
  'gemini-2.0-flash-lite': 0.3,
  'gemini-2.0-flash-lite-001': 0.3,
  'gemini-1.5-flash': 0.3,
  'gemini-1.5-flash-8b': 0.15,
  'gemini-1.5-pro': 5,
  // Gemini 3.x (사용자 키 접근 가능 — 가격 미공개, flash-lite 보수 추정)
  'gemini-3.1-pro-preview': 15,
  'gemini-3.1-flash-lite-preview': 0.4,
  'gemini-3-pro-preview': 15,
  'gemini-3-flash-preview': 2.5,
};

/**
 * 주어진 (provider, model, outputTokens) 로 예상 출력 비용 (USD) 계산.
 * - 가격표에 모델이 없으면 null 반환 (UI 에서 비용 표시 생략)
 * - outputTokens 가 null/undefined 면 null 반환
 */
export function estimateOutputCostUsd(
  provider: AiProvider | null,
  model: string,
  outputTokens: number | null | undefined,
): number | null {
  if (provider === null) return null;
  if (typeof outputTokens !== 'number' || outputTokens <= 0) return null;
  const pricePer1M = OUTPUT_PRICE_PER_1M_USD[model];
  if (typeof pricePer1M !== 'number') return null;
  return (outputTokens / 1_000_000) * pricePer1M;
}
