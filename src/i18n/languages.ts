// 지원 언어 상수 + 타입 가드. i18n 인프라 단일 진실 출처.
// 매직 스트링 회귀 방지 — 'ko'/'en' 리터럴은 본 파일을 통해서만 사용해야 한다 (EXT-003 회귀 가드).

export const SUPPORTED_LANGUAGES = ['ko', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'ko';

/** raw 값이 지원 언어인지 판별 + 타입 좁히기 */
export function isSupportedLanguage(raw: unknown): raw is Language {
  return typeof raw === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(raw);
}
