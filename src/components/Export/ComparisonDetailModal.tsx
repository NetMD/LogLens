// 멀티 AI 비교 — 풀 마크다운 상세 모달 (Step 5)
// PrintableAiReport 의 parseMarkdown / renderInline 을 재사용해 동일한 마크다운 렌더링을 제공한다.

import { Fragment, useId, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Download } from 'lucide-react';
import { AI_PROVIDER_LABELS } from '../../types/settings';
import { parseMarkdown, renderInline } from './PrintableAiReport';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { ComparisonEntry } from '../../services/ai/multiReportGenerator';

interface Props {
  entry: ComparisonEntry;
  onClose: () => void;
  onDownload: () => void;
}

export function ComparisonDetailModal({ entry, onClose, onDownload }: Props) {
  const { t } = useTranslation();
  const label = AI_PROVIDER_LABELS[entry.provider];
  const titleId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  useFocusTrap(containerRef, {
    enabled: true,
    onEscape: onClose,
  });

  const blocks = useMemo(
    () => (entry.markdown ? parseMarkdown(entry.markdown) : []),
    [entry.markdown],
  );

  // 메타 정보
  const metaParts: string[] = [label, entry.model];
  if (typeof entry.tokensUsed === 'number') {
    metaParts.push(t('pdf.tokensShort', { count: entry.tokensUsed.toLocaleString() }));
  }
  if (typeof entry.estimatedCostUsd === 'number') {
    metaParts.push(`~$${entry.estimatedCostUsd.toFixed(4)}`);
  }
  if (entry.startedAt !== null && entry.completedAt !== null) {
    const sec = ((entry.completedAt - entry.startedAt) / 1000).toFixed(1);
    metaParts.push(t('pdf.elapsedSecExact', { sec }));
  }

  return (
    // backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* 모달 */}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-2xl max-h-[85vh] mx-4 bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border-default)] flex-shrink-0">
          <div className="min-w-0">
            <p id={titleId} className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {label} · {entry.model}
            </p>
            <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
              {metaParts.join(' · ')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors flex-shrink-0"
            aria-label={t('pdf.closeButton')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 — 마크다운 렌더링 (스크롤)
            R2: 다크 테마 가독성 — p/li/code 는 text-primary, blockquote 는 text-secondary.
            renderInline 의 인쇄용 인라인 스타일(code background 등)은
            .comparison-detail-prose 의 CSS 오버라이드로 다크 모드 대응. */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="comparison-detail-prose space-y-3 text-sm text-[var(--color-text-primary)] leading-relaxed">
            {blocks.map((block, i) => {
              switch (block.type) {
                case 'h1':
                  return (
                    <h1
                      key={i}
                      className="text-lg font-bold mt-5 mb-2 text-[var(--color-text-primary)]"
                    >
                      {renderInline(block.text)}
                    </h1>
                  );
                case 'h2':
                  return (
                    <h2
                      key={i}
                      className="text-base font-semibold mt-4 mb-1.5 text-[var(--color-text-primary)]"
                    >
                      {renderInline(block.text)}
                    </h2>
                  );
                case 'h3':
                  return (
                    <h3
                      key={i}
                      className="text-sm font-semibold mt-3 mb-1 text-[var(--color-text-primary)]"
                    >
                      {renderInline(block.text)}
                    </h3>
                  );
                case 'p':
                  return (
                    <p key={i} className="text-sm text-[var(--color-text-primary)]">
                      {renderInline(block.text)}
                    </p>
                  );
                case 'ul':
                  return (
                    <ul key={i} className="list-disc pl-5 space-y-0.5">
                      {block.items.map((item, j) => (
                        <li
                          key={j}
                          className="text-sm text-[var(--color-text-primary)]"
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
                      className="border-l-2 border-[var(--color-border-default)] pl-3 text-sm text-[var(--color-text-secondary)] italic"
                    >
                      {renderInline(block.text)}
                    </blockquote>
                  );
                case 'code':
                  return (
                    <pre
                      key={i}
                      className="bg-[var(--color-bg-base)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 overflow-x-auto"
                    >
                      <code className="text-xs font-mono text-[var(--color-text-primary)]">
                        {block.lines.join('\n')}
                      </code>
                    </pre>
                  );
                case 'empty':
                  return <Fragment key={i} />;
                default:
                  return null;
              }
            })}
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-[var(--color-border-default)] flex-shrink-0">
          <button
            type="button"
            onClick={onDownload}
            className="px-4 py-2 text-sm font-medium bg-[var(--color-button-primary-bg)] hover:bg-[var(--color-button-primary-bg-hover)] text-white rounded-lg transition-colors inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            {t('pdf.downloadPdfShort')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] border border-[var(--color-border-default)] rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            {t('pdf.closeButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
