// AI 프로바이더 팩토리 함수

import type { AiProviderAdapter } from '../types';
import type { AiProvider as AiProviderType } from '../../../types/settings';
import { ClaudeProvider } from './claude';
import { OpenAiProvider } from './openai';
import { GeminiProvider } from './gemini';
import { LocalProvider } from './local';

// 싱글턴 프로바이더 인스턴스
const providers: Record<AiProviderType, AiProviderAdapter> = {
  claude: new ClaudeProvider(),
  openai: new OpenAiProvider(),
  gemini: new GeminiProvider(),
  local: new LocalProvider(),
};

/** 프로바이더 타입에 해당하는 어댑터 반환 */
export function getAiProvider(type: AiProviderType): AiProviderAdapter {
  return providers[type];
}
