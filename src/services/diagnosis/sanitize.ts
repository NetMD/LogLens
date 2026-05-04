// 프롬프트 보안: sanitize + API 키 노출 차단

import type { AiApiKeys } from '../../types/settings';

/**
 * 로그 콘텐츠 sanitize: 제어 문자 escape + 연속 개행 압축
 * - TAB(0x09), LF(0x0A), CR(0x0D)는 유지
 * - U+0000~U+001F(위 3개 제외), U+007F~U+009F 제어 문자를 \uXXXX로 escape
 * - 연속 개행 3회 이상 -> 단일 개행으로 압축
 */
export function sanitizeLogContent(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g,
      (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .replace(/\n{3,}/g, '\n');
}

/**
 * 프롬프트 텍스트에 API 키가 포함되어 있는지 런타임 assert
 * 키 길이 8자 이상인 경우만 검사 (짧은 키는 오탐 가능)
 */
export function assertNoApiKeyInPrompt(prompt: string, apiKeys: AiApiKeys): void {
  for (const [provider, key] of Object.entries(apiKeys)) {
    if (key && key.length > 8 && prompt.includes(key)) {
      throw new Error(`SECURITY: API key for ${provider} detected in prompt text`);
    }
  }
}
