// AI 응답 스트리밍 실시간 미리보기
// exportStore.streamingBuffer를 구독하여 <pre> 내부에 렌더 + 자동 스크롤
// aria-live="polite"로 스크린리더 알림

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveExportField } from '../../store/exportStore';

interface Props {
  visible: boolean;
}

export function StreamingPreview({ visible }: Props) {
  const { t } = useTranslation();
  const buffer = useActiveExportField('streamingBuffer');
  const preRef = useRef<HTMLPreElement>(null);

  // 버퍼 갱신 시 자동 스크롤 (맨 아래로)
  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [buffer]);

  // 스트리밍이 비활성화된 상태(buffer 가 비어있음)에서는 렌더하지 않음.
  // non-stream 경로에서는 응답 완료 후 한 번에 표시되므로 미리보기 영역이 무의미.
  if (!visible || buffer.length === 0) return null;

  return (
    <div className="mt-4 text-left">
      <div className="text-xs text-[var(--color-text-tertiary)] mb-1.5">
        {t('pdf.streamingPreview')}
      </div>
      <pre
        ref={preRef}
        className="whitespace-pre-wrap break-words max-h-96 overflow-auto text-xs font-mono bg-[var(--color-bg-base)] border border-[var(--color-border-default)] p-3 rounded text-[var(--color-text-secondary)]"
        aria-live="polite"
        aria-atomic="false"
      >
        {buffer}
      </pre>
    </div>
  );
}
