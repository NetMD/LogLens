// AI가 생성한 마크다운을 인쇄 전용 컨테이너에 렌더링
// - 기존 printable-report-wrapper / printable-report 클래스 재사용 (@media print CSS 자동 적용)
// - 인라인 마크다운 파서 (# ## ### 헤딩, - 목록, >인용, ``` 코드 블록, **bold**, *italic*, `code`)
// - 외부 라이브러리 없음

import { Fragment, type ReactNode, useMemo } from 'react';
import { PRINT_BORDER, PRINT_SURFACE, PRINT_TEXT } from '../../constants/printColors';

interface Props {
  title: string;
  markdown: string;
  fileName: string;
  generatedAt: string; // ISO-8601
}

type Block =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'blockquote'; text: string }
  | { type: 'code'; lang: string; lines: string[] }
  | { type: 'empty' };

/**
 * 인라인 마크다운 파서 (pure)
 * 지원:
 *   - 블록: # / ## / ### 헤딩, - / * 목록, > 인용, ``` 코드 블록, 빈 줄, 본문
 *   - 인라인: **bold**, *italic*, `code`
 * 미지원 (P2): 표, 링크, 이미지, 중첩 리스트
 */
export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.split('\n');
  let listBuffer: string[] | null = null;
  let codeBlockBuffer: { lang: string; lines: string[] } | null = null;

  const flushList = () => {
    if (listBuffer && listBuffer.length > 0) {
      blocks.push({ type: 'ul', items: listBuffer });
    }
    listBuffer = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');

    // 코드 블록 내부 / 토글
    if (line.startsWith('```')) {
      if (codeBlockBuffer !== null) {
        // 종료
        blocks.push({ type: 'code', lang: codeBlockBuffer.lang, lines: codeBlockBuffer.lines });
        codeBlockBuffer = null;
      } else {
        // 시작
        flushList();
        codeBlockBuffer = { lang: line.slice(3).trim(), lines: [] };
      }
      continue;
    }
    if (codeBlockBuffer !== null) {
      codeBlockBuffer.lines.push(rawLine);
      continue;
    }

    if (line.startsWith('# ')) {
      flushList();
      blocks.push({ type: 'h1', text: line.slice(2).trim() });
    } else if (line.startsWith('## ')) {
      flushList();
      blocks.push({ type: 'h2', text: line.slice(3).trim() });
    } else if (line.startsWith('### ')) {
      flushList();
      blocks.push({ type: 'h3', text: line.slice(4).trim() });
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (listBuffer === null) listBuffer = [];
      listBuffer.push(line.slice(2).trim());
    } else if (line.startsWith('> ')) {
      flushList();
      blocks.push({ type: 'blockquote', text: line.slice(2).trim() });
    } else if (line.trim() === '') {
      flushList();
      blocks.push({ type: 'empty' });
    } else {
      flushList();
      blocks.push({ type: 'p', text: line });
    }
  }
  // 파일 끝에서 코드 블록이 열린 상태면 닫기
  if (codeBlockBuffer !== null) {
    blocks.push({ type: 'code', lang: codeBlockBuffer.lang, lines: codeBlockBuffer.lines });
  }
  flushList();
  return blocks;
}

/**
 * 인라인 포맷 렌더러 (pure, React 노드 반환)
 * 지원: **bold**, *italic*, `code`
 * 순서: code (백틱) → bold (**) → italic (*)
 * 단순 토큰 기반 — 중첩은 제한적 지원
 */
export function renderInline(text: string): ReactNode {
  // 1) 백틱 코드 먼저 분리 (내부 **, * 는 해석하지 않음)
  const parts: Array<{ kind: 'code' | 'text'; value: string }> = [];
  const codeRegex = /`([^`]+)`/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = codeRegex.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push({ kind: 'text', value: text.slice(lastIdx, m.index) });
    parts.push({ kind: 'code', value: m[1] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push({ kind: 'text', value: text.slice(lastIdx) });

  // 2) text 파트에 대해 **bold** 와 *italic* 순서로 분할
  return parts.map((part, i) => {
    if (part.kind === 'code') {
      return (
        <code
          key={i}
          style={{
            fontFamily: "'Courier New', monospace",
            fontSize: '0.92em',
            background: PRINT_SURFACE.muted,
            padding: '1px 4px',
            borderRadius: '3px',
          }}
        >
          {part.value}
        </code>
      );
    }
    return <Fragment key={i}>{renderBoldItalic(part.value)}</Fragment>;
  });
}

/**
 * **bold** / *italic* 처리. 단순 non-greedy 매칭.
 * 중첩 케이스(예: ***both***)는 bold 우선 처리 후 italic.
 */
function renderBoldItalic(text: string): ReactNode {
  // Step 1: **bold** 분할
  // 느슨한 매칭: `** text **`, `**text **`, `** text**` 같이 앞뒤 공백이 섞인 경우도 허용
  // (Gemini 등 일부 모델이 공백을 포함해 bold 를 생성하는 케이스 대응)
  // - \s* : 앞뒤 공백 허용 (캡처 외부)
  // - [^*\n]+? : 내부는 non-greedy, 개행/별표 금지 (단락 넘침 방지)
  const boldRegex = /\*\*\s*([^*\n]+?)\s*\*\*/g;
  const afterBold: Array<{ kind: 'bold' | 'text'; value: string }> = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = boldRegex.exec(text)) !== null) {
    if (m.index > lastIdx) afterBold.push({ kind: 'text', value: text.slice(lastIdx, m.index) });
    afterBold.push({ kind: 'bold', value: m[1] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) afterBold.push({ kind: 'text', value: text.slice(lastIdx) });

  // Step 2: 각 text 에서 *italic* 분할
  return afterBold.map((part, i) => {
    if (part.kind === 'bold') {
      return (
        <strong key={i} style={{ fontWeight: 700 }}>
          {splitItalic(part.value)}
        </strong>
      );
    }
    return <Fragment key={i}>{splitItalic(part.value)}</Fragment>;
  });
}

function splitItalic(text: string): ReactNode {
  const italicRegex = /\*([^*]+)\*/g;
  const out: ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = italicRegex.exec(text)) !== null) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index));
    out.push(<em key={i++}>{m[1]}</em>);
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  return out.length === 0 ? text : <>{out}</>;
}

/** ISO-8601 → "YYYY-MM-DD HH:mm" 형태 포맷 */
function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

export function PrintableAiReport({
  title,
  markdown,
  fileName,
  generatedAt,
}: Props) {
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);

  return (
    <div className="printable-report-wrapper">
      <div className="printable-report">
        {/* 헤더 */}
        <div
          style={{
            borderBottom: `2px solid ${PRINT_BORDER.strong}`,
            paddingBottom: '12px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <span
              style={{ fontSize: '12px', color: PRINT_TEXT.tertiary, fontWeight: 600 }}
            >
              LogLens AI Report
            </span>
            <span style={{ fontSize: '10px', color: PRINT_TEXT.tertiary }}>
              생성일: {formatDateTime(generatedAt)}
            </span>
          </div>
          <h1
            style={{
              fontSize: '20px',
              fontWeight: 700,
              marginTop: '4px',
              color: PRINT_TEXT.primary,
            }}
          >
            {title}
          </h1>
          {fileName && (
            <div style={{ fontSize: '11px', color: PRINT_TEXT.tertiary, marginTop: '4px' }}>
              파일: {fileName}
            </div>
          )}
        </div>

        {/* 본문 */}
        <div>
          {blocks.map((block, i) => {
            switch (block.type) {
              case 'h1':
                return (
                  <h1
                    key={i}
                    style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      color: PRINT_TEXT.primary,
                      marginTop: '20px',
                      marginBottom: '10px',
                      borderBottom: `2px solid ${PRINT_BORDER.default}`,
                      paddingBottom: '4px',
                    }}
                  >
                    {renderInline(block.text)}
                  </h1>
                );
              case 'h2':
                return (
                  <h2
                    key={i}
                    style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      color: PRINT_TEXT.secondary,
                      marginTop: '16px',
                      marginBottom: '8px',
                      borderBottom: `1px solid ${PRINT_BORDER.subtle}`,
                      paddingBottom: '3px',
                    }}
                  >
                    {renderInline(block.text)}
                  </h2>
                );
              case 'h3':
                return (
                  <h3
                    key={i}
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: PRINT_TEXT.secondary,
                      marginTop: '12px',
                      marginBottom: '6px',
                    }}
                  >
                    {renderInline(block.text)}
                  </h3>
                );
              case 'p':
                return (
                  <p
                    key={i}
                    style={{
                      fontSize: '12px',
                      color: PRINT_TEXT.primary,
                      lineHeight: 1.6,
                      margin: '6px 0',
                      wordBreak: 'normal',
                      overflowWrap: 'anywhere',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {renderInline(block.text)}
                  </p>
                );
              case 'ul':
                return (
                  <ul
                    key={i}
                    style={{
                      margin: '6px 0 6px 20px',
                      padding: 0,
                      fontSize: '12px',
                      color: PRINT_TEXT.primary,
                      lineHeight: 1.6,
                      listStyleType: 'disc',
                    }}
                  >
                    {block.items.map((item, j) => (
                      <li
                        key={j}
                        style={{
                          marginBottom: '3px',
                          wordBreak: 'normal',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {renderInline(item)}
                      </li>
                    ))}
                  </ul>
                );
              case 'blockquote':
                return (
                  <blockquote
                    key={i}
                    style={{
                      margin: '10px 0',
                      padding: '8px 12px',
                      borderLeft: `3px solid ${PRINT_BORDER.strong}`,
                      background: PRINT_SURFACE.muted,
                      color: PRINT_TEXT.primary,
                      fontSize: '12px',
                      lineHeight: 1.6,
                      wordBreak: 'normal',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {renderInline(block.text)}
                  </blockquote>
                );
              case 'code':
                return (
                  <pre
                    key={i}
                    style={{
                      margin: '8px 0',
                      padding: '10px 12px',
                      background: PRINT_SURFACE.muted,
                      border: `1px solid ${PRINT_BORDER.subtle}`,
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontFamily: "'Courier New', monospace",
                      color: PRINT_TEXT.primary,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {block.lines.join('\n')}
                  </pre>
                );
              case 'empty':
                return <div key={i} style={{ height: '6px' }} />;
              default:
                return null;
            }
          })}
        </div>

        {/* 푸터 */}
        <div
          style={{
            borderTop: `1px solid ${PRINT_BORDER.subtle}`,
            paddingTop: '8px',
            marginTop: '32px',
            fontSize: '10px',
            color: PRINT_TEXT.tertiary,
            textAlign: 'center',
          }}
        >
          LogLens · AI 기반 리포트
        </div>
      </div>
    </div>
  );
}
