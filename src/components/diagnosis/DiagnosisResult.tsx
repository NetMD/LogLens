// 단방향 분석 결과 카드 5개 + 액션 버튼

import { MessageSquare, Save, RefreshCw, Check } from 'lucide-react';
import { useState } from 'react';
import type { UnidirectionalResult } from '../../types/diagnosis';
import { SeverityBadge } from './SeverityBadge';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// PrismLight 언어 등록 (Java/JSON/TS/XML 4개만)
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('xml', markup);

interface Props {
  result: UnidirectionalResult | null;
  rawResponse: string;
  onContinueChat: () => void;
  onSave: () => Promise<void>;
  onRetry: () => void;
  canStartDiagnosis: boolean;
  isAnalyzing: boolean;
}

const SEVERITY_CARD_STYLES: Record<string, string> = {
  HIGH: 'bg-[var(--color-status-error-bg)] border-[var(--color-status-error-border)]/40',
  MEDIUM: 'bg-[var(--color-status-warn-bg)] border-[var(--color-status-warn-border)]',
  LOW: 'bg-[var(--color-status-success-bg)] border-[var(--color-status-success-border)]',
};

const CARD_ANIMATION_STYLE = `
  @keyframes cardAppear {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

export function DiagnosisResult({
  result,
  rawResponse,
  onContinueChat,
  onSave,
  onRetry,
  canStartDiagnosis,
  isAnalyzing,
}: Props) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  // JSON 파싱 완전 실패 — 원문 텍스트 fallback
  if (!result) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <style>{CARD_ANIMATION_STYLE}</style>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-status-warn-fg)] mb-2">
            구조화된 분석에 실패했습니다. 대화형으로 추가 질문해보세요.
          </p>
          <pre className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed font-mono text-xs">
            {rawResponse}
          </pre>
        </div>

        {/* 액션 버튼 */}
        <div className="flex justify-center gap-3 mt-6">
          <button
            onClick={onContinueChat}
            className="flex items-center gap-1.5 bg-[var(--color-button-primary-bg)] hover:bg-[var(--color-button-primary-bg-hover)] text-white rounded-lg px-4 py-2 text-xs transition-colors"
            aria-label="대화형으로 이어서 분석"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            대화형으로 이어서
          </button>
          <button
            onClick={onRetry}
            disabled={!canStartDiagnosis}
            className="flex items-center gap-1.5 bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] border border-[var(--color-border-default)] rounded-lg px-4 py-2 text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="재분석"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            재분석
          </button>
        </div>
      </div>
    );
  }

  const severityStyle = SEVERITY_CARD_STYLES[result.severity] ?? SEVERITY_CARD_STYLES.MEDIUM;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <style>{CARD_ANIMATION_STYLE}</style>

      {/* 1. 심각도 카드 */}
      <div
        className={`border rounded-lg p-4 ${severityStyle}`}
        style={{ animation: 'cardAppear 300ms ease-out forwards', animationDelay: '0ms' }}
      >
        <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
          심각도
        </h3>
        <div className="flex items-center gap-2 mb-2">
          <SeverityBadge severity={result.severity} />
          <span className="text-sm text-[var(--color-text-primary)]">
            {result.severity === 'HIGH' ? '높은 심각도' : result.severity === 'MEDIUM' ? '보통 심각도' : '낮은 심각도'}
          </span>
        </div>
        {result.severityReason && (
          <p className="text-sm text-[var(--color-text-primary)] leading-relaxed">
            {result.severityReason}
          </p>
        )}
      </div>

      {/* 2. 근본 원인 카드 */}
      {result.rootCause ? (
        <div
          className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg p-4"
          style={{ animation: 'cardAppear 300ms ease-out forwards', animationDelay: '100ms', opacity: 0 }}
        >
          <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
            근본 원인
          </h3>
          <p className="text-sm text-[var(--color-text-primary)] leading-relaxed">
            {result.rootCause}
          </p>
        </div>
      ) : (
        <div
          className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg p-4"
          style={{ animation: 'cardAppear 300ms ease-out forwards', animationDelay: '100ms', opacity: 0 }}
        >
          <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
            근본 원인
          </h3>
          <p className="text-xs text-[var(--color-text-disabled)]">AI가 이 항목을 분석하지 못했습니다</p>
        </div>
      )}

      {/* 3. 해결 방법 카드 */}
      {result.solution ? (
        <div
          className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg p-4"
          style={{ animation: 'cardAppear 300ms ease-out forwards', animationDelay: '200ms', opacity: 0 }}
        >
          <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
            해결 방법
          </h3>
          <p className="text-sm text-[var(--color-text-primary)] leading-relaxed mb-3">
            {result.solution.description}
          </p>
          {result.solution.codeExample && (
            <div className="space-y-3">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-status-error-fg)] font-semibold">Before</span>
                <div className="mt-1 bg-[var(--color-status-error-bg)] border border-[var(--color-status-error-border)]/30 rounded-lg overflow-hidden">
                  <SyntaxHighlighter
                    language={result.solution.codeExample.language || 'java'}
                    style={vscDarkPlus}
                    customStyle={{ margin: 0, padding: '0.75rem', fontSize: '0.75rem', background: 'transparent' }}
                  >
                    {result.solution.codeExample.before}
                  </SyntaxHighlighter>
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-status-success-fg)] font-semibold">After</span>
                <div className="mt-1 bg-[var(--color-status-success-bg)] border border-[var(--color-status-success-border)] rounded-lg overflow-hidden">
                  <SyntaxHighlighter
                    language={result.solution.codeExample.language || 'java'}
                    style={vscDarkPlus}
                    customStyle={{ margin: 0, padding: '0.75rem', fontSize: '0.75rem', background: 'transparent' }}
                  >
                    {result.solution.codeExample.after}
                  </SyntaxHighlighter>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg p-4"
          style={{ animation: 'cardAppear 300ms ease-out forwards', animationDelay: '200ms', opacity: 0 }}
        >
          <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
            해결 방법
          </h3>
          <p className="text-xs text-[var(--color-text-disabled)]">AI가 이 항목을 분석하지 못했습니다</p>
        </div>
      )}

      {/* 4. 재발 방지 카드 */}
      {result.prevention && result.prevention.length > 0 ? (
        <div
          className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg p-4"
          style={{ animation: 'cardAppear 300ms ease-out forwards', animationDelay: '300ms', opacity: 0 }}
        >
          <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
            재발 방지
          </h3>
          <ol className="space-y-1.5">
            {result.prevention.map((item, i) => (
              <li key={i} className="text-sm text-[var(--color-text-primary)] leading-relaxed flex gap-2">
                <span className="text-[var(--color-text-tertiary)] flex-shrink-0">{i + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div
          className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg p-4"
          style={{ animation: 'cardAppear 300ms ease-out forwards', animationDelay: '300ms', opacity: 0 }}
        >
          <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
            재발 방지
          </h3>
          <p className="text-xs text-[var(--color-text-disabled)]">AI가 이 항목을 분석하지 못했습니다</p>
        </div>
      )}

      {/* 5. 연관 에러 카드 */}
      {result.relatedErrors && result.relatedErrors.length > 0 ? (
        <div
          className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg p-4"
          style={{ animation: 'cardAppear 300ms ease-out forwards', animationDelay: '400ms', opacity: 0 }}
        >
          <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
            연관 에러
          </h3>
          <ul className="space-y-2">
            {result.relatedErrors.map((err, i) => (
              <li key={i} className="text-sm text-[var(--color-text-primary)] leading-relaxed">
                <span className="font-mono text-[var(--color-status-error-fg)]">{err.exceptionClass}</span>
                <span className="text-[var(--color-text-tertiary)]"> — </span>
                <span>{err.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div
          className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg p-4"
          style={{ animation: 'cardAppear 300ms ease-out forwards', animationDelay: '400ms', opacity: 0 }}
        >
          <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
            연관 에러
          </h3>
          <p className="text-xs text-[var(--color-text-disabled)]">AI가 이 항목을 분석하지 못했습니다</p>
        </div>
      )}

      {/* 액션 버튼 그룹 */}
      <div className="flex justify-center gap-3 mt-6">
        <button
          onClick={onContinueChat}
          disabled={isAnalyzing}
          className="flex items-center gap-1.5 bg-[var(--color-button-primary-bg)] hover:bg-[var(--color-button-primary-bg-hover)] text-white rounded-lg px-4 py-2 text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="대화형으로 이어서 분석"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          대화형으로 이어서
        </button>
        <button
          onClick={handleSave}
          disabled={isAnalyzing || saving}
          className={`flex items-center gap-1.5 bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] border border-[var(--color-border-default)] rounded-lg px-4 py-2 text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
            saved ? 'text-[var(--color-status-success-fg)]' : ''
          }`}
          aria-label="진단 저장"
        >
          {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {saved ? '저장 완료' : '진단 저장'}
        </button>
        <button
          onClick={onRetry}
          disabled={!canStartDiagnosis}
          className="flex items-center gap-1.5 bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] border border-[var(--color-border-default)] rounded-lg px-4 py-2 text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="재분석"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          재분석
        </button>
      </div>
    </div>
  );
}
