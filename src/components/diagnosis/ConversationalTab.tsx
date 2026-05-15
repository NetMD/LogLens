// 대화형 분석 탭 (채팅 UI + 스트리밍 + 추천 질문)

import { useRef, useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DiagnosisInput, ChatMessageData } from '../../types/diagnosis';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { SuggestedQuestions } from './SuggestedQuestions';
import { useSettingsStore } from '../../store/settingsStore';
import { getActiveApiKey, isLocalProvider } from '../../types/settings';

interface Props {
  input: DiagnosisInput;
  messages: ChatMessageData[];
  isStreaming: boolean;
  streamingContent: string;
  onSendMessage: (content: string) => Promise<void>;
  onCancelStreaming: () => void;
}

export function ConversationalTab({
  input,
  messages,
  isStreaming,
  streamingContent,
  onSendMessage,
  onCancelStreaming: _onCancelStreaming,
}: Props) {
  const { t } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);

  const exceptionClass = input.type === 'exception'
    ? input.exceptionClass
    : (input.logEntry.exceptionClass?.split('.').pop() ?? t('aiDiagnosis.unknownClass'));

  const count = input.type === 'exception' ? input.count : 1;

  // 소스 위치 (single 타입일 때)
  const sourceLocation = input.type === 'single' && input.stackTrace.length > 0
    ? `${input.stackTrace[0].className}.${input.stackTrace[0].methodName}(${input.stackTrace[0].fileName}:${input.stackTrace[0].lineNumber})`
    : null;

  const firstOccurrence = input.type === 'exception' ? input.firstOccurrence : input.logEntry.timestamp;
  const lastOccurrence = input.type === 'exception' ? input.lastOccurrence : input.logEntry.timestamp;

  const hasSentFirstMessage = messages.some(m => m.role === 'user');

  // canSendMessage 계산
  const canSendMessage = (() => {
    const s = useSettingsStore.getState();
    if (!s.aiProvider) return false;
    const hasValidCredentials = isLocalProvider(s.aiProvider)
      ? s.localLlmEndpoint.trim() !== ''
      : getActiveApiKey(s) !== '';
    return hasValidCredentials && !isStreaming && messages.length < 50;
  })();

  // 자동 스크롤
  useEffect(() => {
    if (isAutoScrolling && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, streamingContent, isAutoScrolling]);

  // 스크롤 감지: 사용자가 위로 스크롤하면 자동 스크롤 중단
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setIsAutoScrolling(isAtBottom);
  }, []);

  const handleSend = useCallback(async (content: string) => {
    setIsAutoScrolling(true);
    await onSendMessage(content);
  }, [onSendMessage]);

  return (
    // ChatInput 을 absolute bottom-0 으로 못박고, 메시지 영역은 absolute inset-0 으로 부모 전체 차지.
    // 메시지 영역 하단에 padding-bottom: 80px 줘서 ChatInput 에 가려지지 않게.
    // → flex/grid 분배 문제 + focus 시 자동 scrollIntoView 둘 다 회피.
    <div className="relative h-full min-h-0 overflow-hidden">
      {/* 메시지 영역 — absolute 로 부모 영역 채우고 자체 스크롤 */}
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-y-auto p-4 pb-[96px] space-y-3"
        onScroll={handleScroll}
      >
        {/* 에러 컨텍스트 요약 카드 */}
        <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg p-3 mb-4">
          <p className="text-sm font-semibold text-[var(--color-status-error-fg)] font-mono">{exceptionClass} ({t('aiDiagnosis.occurrenceCount', { count })})</p>
          {sourceLocation && (
            <p className="text-xs text-[var(--color-text-tertiary)] font-mono mt-0.5">{sourceLocation}</p>
          )}
          <p className="text-xs text-[var(--color-text-disabled)] mt-1">
            {input.type === 'exception'
              ? `${t('aiDiagnosis.firstAt')}: ${firstOccurrence} | ${t('aiDiagnosis.lastAt')}: ${lastOccurrence}`
              : `${t('aiDiagnosis.atTime')}: ${firstOccurrence}`
            }
          </p>
        </div>

        {/* 추천 질문 (첫 메시지 전송 전에만 표시) */}
        <SuggestedQuestions
          onSelect={handleSend}
          isStreaming={isStreaming}
          hasSentFirstMessage={hasSentFirstMessage}
        />

        {/* 메시지 목록 */}
        {messages.map((msg, i) => (
          <ChatMessage key={i} data={msg} />
        ))}

        {/* 스트리밍 중인 AI 응답 */}
        {isStreaming && streamingContent && (
          <ChatMessage
            data={{
              role: 'assistant',
              content: '',
              timestamp: new Date().toISOString(),
            }}
            isStreamingMessage={true}
            streamingContent={streamingContent}
          />
        )}

        {/* 스크롤 앵커 */}
        <div ref={messagesEndRef} />
      </div>

      {/* ChatInput 을 부모 bottom 에 절대 고정 — focus 시 자동 scroll 영향 차단 */}
      <div className="absolute bottom-0 left-0 right-0">
        {!isAutoScrolling && (isStreaming || messages.length > 0) && (
          <div className="flex justify-center pb-1">
            <button
              onClick={() => {
                setIsAutoScrolling(true);
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-[10px] text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-full px-3 py-1"
            >
              {t('aiDiagnosis.newMessageJump')}
            </button>
          </div>
        )}

        <ChatInput
          onSend={handleSend}
          isStreaming={isStreaming}
          messageCount={messages.length}
          canSendMessage={canSendMessage}
        />
      </div>
    </div>
  );
}
