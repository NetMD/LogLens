// 채팅 메시지 버블 (react-markdown + 구문 강조)

import ReactMarkdown from 'react-markdown';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { ChatMessageData, UnidirectionalResult } from '../../types/diagnosis';
import { useState } from 'react';

SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('xml', markup);

interface Props {
  data: ChatMessageData;
  isStreamingMessage?: boolean;
  streamingContent?: string;
}

export function ChatMessage({ data, isStreamingMessage, streamingContent }: Props) {
  const [showFullResult, setShowFullResult] = useState(false);

  const content = isStreamingMessage ? (streamingContent ?? '') : data.content;
  const timestamp = new Date(data.timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // system 메시지 (이전 분석 결과)
  if (data.role === 'system') {
    let parsedResult: UnidirectionalResult | null = null;
    try {
      parsedResult = JSON.parse(data.content) as UnidirectionalResult;
    } catch { /* 무시 */ }

    return (
      <div className="mr-auto max-w-[80%] bg-[var(--color-accent-primary-subtle-bg)] border border-[var(--color-accent-primary)] rounded-lg rounded-bl-sm px-3 py-2">
        <p className="text-xs text-[var(--color-accent-primary)] font-medium mb-1">이전 단방향 분석 결과를 참고합니다.</p>
        {parsedResult && (
          <button
            onClick={() => setShowFullResult(!showFullResult)}
            className="text-xs text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary)] underline"
          >
            {showFullResult ? '요약 보기' : '전체 결과 보기'}
          </button>
        )}
        {showFullResult && parsedResult && (
          <div className="mt-2 text-xs text-[var(--color-text-secondary)] space-y-1">
            <p>심각도: {parsedResult.severity} - {parsedResult.severityReason}</p>
            <p>원인: {parsedResult.rootCause}</p>
            <p>해결: {parsedResult.solution?.description}</p>
          </div>
        )}
        <span className="text-[10px] text-[var(--color-text-disabled)] block mt-1">{timestamp}</span>
      </div>
    );
  }

  // 사용자 메시지
  if (data.role === 'user') {
    return (
      <div className="ml-auto max-w-[80%] bg-[var(--color-button-primary-bg)]/20 border border-[var(--color-accent-primary)]/30 rounded-lg rounded-br-sm px-3 py-2">
        <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">{content}</p>
        <span className="text-[10px] text-[var(--color-text-disabled)] block mt-1 text-right">{timestamp}</span>
      </div>
    );
  }

  // AI 응답 메시지
  return (
    <div className="mr-auto max-w-[80%] bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg rounded-bl-sm px-3 py-2">
      <div className="text-sm text-[var(--color-text-primary)] leading-relaxed prose-sm">
        <ReactMarkdown
          components={{
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              const codeContent = String(children).replace(/\n$/, '');

              if (match) {
                return (
                  <div className="my-2 rounded-md overflow-hidden border border-[var(--color-border-default)]">
                    <SyntaxHighlighter
                      language={match[1]}
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0,
                        padding: '0.75rem',
                        fontSize: '0.75rem',
                        background: 'var(--color-bg-base)',
                      }}
                    >
                      {codeContent}
                    </SyntaxHighlighter>
                  </div>
                );
              }

              // 인라인 코드
              return (
                <code className="bg-[var(--color-bg-base)] px-1 py-0.5 rounded text-xs font-mono" {...props}>
                  {children}
                </code>
              );
            },
            p({ children }) {
              return <p className="mb-2 last:mb-0">{children}</p>;
            },
            ul({ children }) {
              return <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>;
            },
            ol({ children }) {
              return <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>;
            },
            strong({ children }) {
              return <strong className="font-semibold">{children}</strong>;
            },
          }}
        >
          {content}
        </ReactMarkdown>
        {isStreamingMessage && (
          <span className="inline-block animate-pulse text-[var(--color-accent-primary)]">&#9610;</span>
        )}
      </div>
      <span className="text-[10px] text-[var(--color-text-disabled)] block mt-1">{timestamp}</span>
    </div>
  );
}
