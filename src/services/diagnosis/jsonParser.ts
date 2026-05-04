// AI 응답 JSON 3단계 파싱 + fallback

import type { UnidirectionalResult } from '../../types/diagnosis';

export interface ParseResult {
  success: boolean;
  result: UnidirectionalResult | null;
  partial: boolean;        // 필수 필드 일부 누락
  rawResponse: string;
}

const REQUIRED_FIELDS = ['severity', 'rootCause', 'solution', 'prevention', 'relatedErrors'] as const;
const VALID_SEVERITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;

function tryParse(text: string): unknown | null {
  try { return JSON.parse(text); } catch { return null; }
}

function validateAndReturn(parsed: unknown, rawResponse: string): ParseResult {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { success: false, result: null, partial: false, rawResponse };
  }

  const obj = parsed as Record<string, unknown>;
  const present = REQUIRED_FIELDS.filter(k => obj[k] !== undefined);

  if (present.length === REQUIRED_FIELDS.length) {
    // severity 값 교정
    const severity = (VALID_SEVERITIES as readonly string[]).includes(obj.severity as string)
      ? obj.severity as 'HIGH' | 'MEDIUM' | 'LOW'
      : 'MEDIUM';

    return {
      success: true,
      result: { ...obj, severity } as unknown as UnidirectionalResult,
      partial: false,
      rawResponse,
    };
  }

  if (present.length > 0) {
    // 부분 파싱 — 존재하는 필드만 사용
    const severity = (VALID_SEVERITIES as readonly string[]).includes(obj.severity as string)
      ? obj.severity as 'HIGH' | 'MEDIUM' | 'LOW'
      : 'MEDIUM';

    return {
      success: true,
      result: { ...obj, severity } as unknown as UnidirectionalResult,
      partial: true,
      rawResponse,
    };
  }

  return { success: false, result: null, partial: false, rawResponse };
}

/**
 * AI 응답을 3단계로 파싱하여 UnidirectionalResult를 추출한다.
 * 1. ```json ... ``` fence 추출
 * 2. 최외곽 { ... } 추출
 * 3. 전체 텍스트 JSON.parse
 * 모두 실패 시 fallback (rawResponse만 반환)
 */
export function parseDiagnosisResponse(response: string): ParseResult {
  const rawResponse = response;

  // 단계 1: ```json ... ``` fence 추출
  const fenceMatch = response.match(/```json\s*([\s\S]*?)```/);
  if (fenceMatch) {
    const parsed = tryParse(fenceMatch[1]);
    if (parsed) return validateAndReturn(parsed, rawResponse);
  }

  // 단계 2: 최외곽 { ... } 추출
  const braceStart = response.indexOf('{');
  const braceEnd = response.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    const parsed = tryParse(response.slice(braceStart, braceEnd + 1));
    if (parsed) return validateAndReturn(parsed, rawResponse);
  }

  // 단계 3: 전체 텍스트 JSON.parse
  const parsed = tryParse(response);
  if (parsed) return validateAndReturn(parsed, rawResponse);

  // fallback: 파싱 완전 실패
  return { success: false, result: null, partial: false, rawResponse };
}
