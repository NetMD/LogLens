// Word 템플릿 파서 (8차 신규)
// mammoth로 .docx → HTML 추출 후 DOMParser로 섹션 구조(h1/h2/h3) 분석
// mammoth는 dynamic import (초기 번들 제외, ~320KB gzipped)

import { AiApiError } from './types';

/** 파싱 결과: AI 프롬프트에 "이 섹션 구조를 따라라" 힌트로 주입 */
export interface WordStructureHint {
  sections: Array<{
    level: 1 | 2 | 3;
    title: string;
  }>;
  hasTables: boolean;         // 표 존재 여부 (AI에 표 사용 권장)
  approximateWordCount: number; // 본문 단어 수 (리포트 분량 힌트)
}

/**
 * docx ArrayBuffer를 파싱하여 섹션 구조 힌트를 추출한다
 *
 * 실패 케이스:
 *   - mammoth load 실패 / convertToHtml 실패 → WORD_TEMPLATE_PARSE_FAIL throw
 *   - 유효 섹션 0개 → sections: [] 반환 (에러 아님, AI는 프리셋 구조 사용)
 */
export async function extractStructure(
  arrayBuffer: ArrayBuffer,
): Promise<WordStructureHint> {
  // vite 정적 분석 호환: 문자열 리터럴로 dynamic import
  // mammoth/mammoth.browser는 browser 전용 번들 (node 의존 제외)
  let mammoth: typeof import('mammoth');
  try {
    // @ts-expect-error -- mammoth는 선택적 의존성. package.json에 아직 추가되지 않은
    // 환경에서도 타입 오류 없이 컴파일되도록 에러 주석 처리
    mammoth = await import('mammoth/mammoth.browser');
  } catch {
    throw new AiApiError(
      'WORD_TEMPLATE_PARSE_FAIL',
      'Failed to load word template parser',
    );
  }

  let html: string;
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer });
    html = result.value;
  } catch {
    throw new AiApiError(
      'WORD_TEMPLATE_PARSE_FAIL',
      'Failed to convert docx to html',
    );
  }

  try {
    return parseHtmlToStructure(html);
  } catch {
    throw new AiApiError(
      'WORD_TEMPLATE_PARSE_FAIL',
      'Failed to parse html structure',
    );
  }
}

/**
 * 추출된 HTML을 WordStructureHint로 변환 (pure, 단위 테스트 대상)
 *
 * - h1/h2/h3 순회 → sections 배열
 * - table 태그 존재 여부 → hasTables
 * - body 텍스트 split(\s+) → approximateWordCount
 *
 * DOMParser는 브라우저 표준 (Tauri webview 포함)이므로 별도 polyfill 불필요.
 */
export function parseHtmlToStructure(html: string): WordStructureHint {
  // DOMParser는 최상위 html/body 태그 없이도 동작
  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    'text/html',
  );

  const sections: WordStructureHint['sections'] = [];
  const headingNodes = doc.querySelectorAll('h1, h2, h3');
  headingNodes.forEach((node) => {
    const tag = node.tagName.toLowerCase();
    const level: 1 | 2 | 3 =
      tag === 'h1' ? 1 : tag === 'h2' ? 2 : 3;
    const title = (node.textContent ?? '').trim();
    if (title.length === 0) return;
    sections.push({ level, title });
  });

  const hasTables = doc.querySelector('table') !== null;
  const bodyText = doc.body?.textContent ?? '';
  const approximateWordCount =
    bodyText.trim().length === 0
      ? 0
      : bodyText.trim().split(/\s+/).length;

  return { sections, hasTables, approximateWordCount };
}
