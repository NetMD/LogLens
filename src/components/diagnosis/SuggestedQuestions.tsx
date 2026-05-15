// 추천 질문 4개 버튼

import { useTranslation } from 'react-i18next';
import { SUGGESTED_QUESTION_KEYS } from '../../types/diagnosis';

interface Props {
  onSelect: (question: string) => void;
  isStreaming: boolean;
  hasSentFirstMessage: boolean;
}

export function SuggestedQuestions({ onSelect, isStreaming, hasSentFirstMessage }: Props) {
  const { t } = useTranslation();
  // 첫 메시지 전송 후 fade-out -> 제거
  if (hasSentFirstMessage) return null;

  return (
    <div
      className="grid grid-cols-2 gap-2 transition-opacity duration-200"
      style={{ opacity: hasSentFirstMessage ? 0 : 1 }}
    >
      {SUGGESTED_QUESTION_KEYS.map((key) => {
        const question = t(key);
        return (
          <button
            key={key}
            onClick={() => onSelect(question)}
            disabled={isStreaming}
            className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-secondary)] text-left hover:border-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary-subtle-bg)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed active:bg-[var(--color-accent-primary-subtle-bg)] active:scale-[0.98]"
            aria-label={question}
          >
            {question}
          </button>
        );
      })}
    </div>
  );
}
