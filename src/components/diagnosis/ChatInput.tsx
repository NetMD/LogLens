// 채팅 입력 (Enter/Shift+Enter, textarea 자동 확장)

import { useState, useRef, useCallback, useEffect } from 'react';
import { Send } from 'lucide-react';
import { LoadingSpinner } from '../shared/LoadingSpinner';

interface Props {
  onSend: (content: string) => void;
  isStreaming: boolean;
  messageCount: number;
  canSendMessage: boolean;
}

const MAX_MESSAGES = 50;

export function ChatInput({ onSend, isStreaming, messageCount, canSendMessage }: Props) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isLimitReached = messageCount >= MAX_MESSAGES;

  // textarea 자동 높이 조절
  // display:none 안에서 마운트되면 scrollHeight=0 이라 height 가 0px 으로 적용되는 문제가 있음
  // 또한 text-sm(14px) + line-height 1.5 = 21px + padding-y 16px = 37px 이 1줄에 필요.
  // 최소 40px 보장해야 placeholder/텍스트가 textarea 박스 안에서 잘리지 않음.
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const computed = Math.max(40, Math.min(el.scrollHeight, 120));
    el.style.height = `${computed}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  // 탭 전환(display:none → flex) 후 layout 이 정해지면 height 재계산
  useEffect(() => {
    const raf = requestAnimationFrame(adjustHeight);
    return () => cancelAnimationFrame(raf);
  }, [adjustHeight]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || !canSendMessage || isStreaming || isLimitReached) return;
    onSend(trimmed);
    setInput('');
    // 높이 리셋
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, canSendMessage, isStreaming, isLimitReached, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const isDisabled = !canSendMessage || isStreaming || isLimitReached;
  const isSendDisabled = !canSendMessage || !input.trim() || isStreaming || isLimitReached;

  const placeholder = isStreaming
    ? 'AI가 응답 중입니다...'
    : isLimitReached
      ? '메시지 제한에 도달했습니다'
      : '질문을 입력하세요... (Shift+Enter로 줄바꿈)';

  return (
    <div className="flex-shrink-0 border-t border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-3 min-h-[72px]">
      {/* 50 메시지 경고 */}
      {isLimitReached && (
        <div className="mb-2 bg-[var(--color-status-warn-bg)] border border-[var(--color-status-warn-border)] rounded-lg px-3 py-2">
          <p className="text-xs text-[var(--color-status-warn-fg)]">
            최대 메시지 수(50)에 도달했습니다. 새 진단을 시작하세요.
          </p>
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          placeholder={placeholder}
          rows={1}
          className={`flex-1 bg-[var(--color-bg-input,var(--color-bg-elevated))] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-disabled)] resize-none focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-border-focus)]/30 transition-colors ${
            isDisabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          aria-label="채팅 메시지 입력"
        />
        <button
          onClick={handleSend}
          disabled={isSendDisabled}
          className={`flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-md transition-colors ${
            isSendDisabled
              ? 'bg-[var(--color-accent-primary-subtle-bg)] text-[var(--color-accent-primary)]/30 cursor-not-allowed'
              : 'bg-[var(--color-button-primary-bg)] hover:bg-[var(--color-button-primary-bg-hover)] text-white active:scale-95'
          }`}
          aria-label="메시지 전송"
        >
          {isStreaming ? (
            <LoadingSpinner size="sm" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
