// AI 리포트 생성 상태 UI (진행 중 / 완료 / 에러)
// 8차: 소스 분석 단계 추가 → 3단계 / 4단계 동적 표시 + StreamingPreview 통합

import { useState } from 'react';
import { CheckCircle, AlertTriangle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { GenerationStatus } from '../../store/exportStore';
import { isGenerating, progressPercent, progressMessage } from '../../store/exportStore';
import { StreamingPreview } from './StreamingPreview';

interface Props {
  status: GenerationStatus;
  error: string | null;
  outputFormat: 'pdf' | 'docx';
  hasSourceAnalysis: boolean;
  outputLanguage: 'ko' | 'en';
  onRetry: () => void;
  onCancel: () => void;
  onDownload: (format: 'pdf' | 'docx') => void;
  onReset: () => void;
  /** 완료 화면에 함께 표시되는 사용량/비용 메타 (선택) */
  tokensUsed?: number | null;
  estimatedCostUsd?: number | null;
  /** 완료 화면에 함께 표시되는 프로바이더 라벨 / 모델명 (선택) */
  providerLabel?: string | null;
  modelName?: string | null;
  /** done 화면이 "방금 생성 완료(fresh)" 인지 "히스토리에서 복원(restored)" 인지 구분.
   *  restored 일 때는 제목/안내 문구가 달라지고, API 재호출/비용이 없음을 명시한다. */
  source?: 'fresh' | 'restored';
}

type StepKey = 'collecting' | 'analyzing-source' | 'calling-ai' | 'generating-doc';

// 3단계 스텝 정의 (소스 분석 없음)
const STEPS_3: ReadonlyArray<{
  key: StepKey;
  label: { ko: string; en: string };
}> = [
  { key: 'collecting', label: { ko: '데이터 수집', en: 'Collecting' } },
  { key: 'calling-ai', label: { ko: 'AI 분석', en: 'AI analysis' } },
  { key: 'generating-doc', label: { ko: '문서 생성', en: 'Generating' } },
];

// 4단계 스텝 정의 (소스 분석 포함)
const STEPS_4: ReadonlyArray<{
  key: StepKey;
  label: { ko: string; en: string };
}> = [
  { key: 'collecting', label: { ko: '데이터 수집', en: 'Collecting' } },
  { key: 'analyzing-source', label: { ko: '소스 분석', en: 'Source analysis' } },
  { key: 'calling-ai', label: { ko: 'AI 분석', en: 'AI analysis' } },
  { key: 'generating-doc', label: { ko: '문서 생성', en: 'Generating' } },
];

export function AiGenerationStatus({
  status,
  error,
  outputFormat,
  hasSourceAnalysis,
  outputLanguage,
  onRetry,
  onCancel,
  onDownload,
  onReset,
  tokensUsed,
  estimatedCostUsd,
  providerLabel,
  modelName,
  source = 'fresh',
}: Props) {
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  // 생성 중 (collecting | analyzing-source | calling-ai | generating-doc)
  if (isGenerating(status)) {
    const STEPS = hasSourceAnalysis ? STEPS_4 : STEPS_3;
    const currentIndex = STEPS.findIndex((s) => s.key === status);
    // calling-ai 상태일 때만 스트리밍 프리뷰 표시
    const showStreaming = status === 'calling-ai';

    return (
      <div
        className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-xl p-8 text-center"
        // 주의: StreamingPreview 내부에 aria-live="polite"가 있으므로 여기에는 설정하지 않음 (중첩 live region 방지)
      >
        {/* 스피너 */}
        <div className="w-8 h-8 mx-auto border-2 border-[var(--color-accent-primary)] border-t-transparent rounded-full animate-spin" />

        {/* 진행 메시지 */}
        <p className="text-sm text-[var(--color-text-secondary)] mt-3">
          {progressMessage(status)}
        </p>

        {/* 진행률 바 */}
        <div className="h-1.5 bg-[var(--color-border-default)] rounded-full overflow-hidden mt-4 mx-8">
          <div
            className="h-full bg-[var(--color-accent-primary)] rounded-full transition-all duration-500"
            style={{ width: `${progressPercent(status)}%` }}
          />
        </div>

        {/* 스텝 인디케이터 (3 또는 4단계 동적) */}
        <div className="flex justify-center flex-wrap gap-x-6 gap-y-1 mt-4 text-xs">
          {STEPS.map((step, i) => (
            <span
              key={step.key}
              className={
                currentIndex >= 0 && i < currentIndex
                  ? 'text-[var(--color-status-success-fg)]'
                  : i === currentIndex
                  ? 'text-[var(--color-accent-primary)] font-medium'
                  : 'text-[var(--color-text-disabled)]'
              }
            >
              {currentIndex >= 0 && i < currentIndex ? '\u2713 ' : ''}
              {step.label[outputLanguage]}
            </span>
          ))}
        </div>

        {/* 스트리밍 미리보기 — 버퍼가 비어있으면 StreamingPreview 내부에서 null 반환 */}
        {showStreaming && <StreamingPreview visible={true} />}

        {/* 비스트리밍 모드 안내 (calling-ai 단계에서 대기 시간 체감 완화) */}
        {status === 'calling-ai' && (
          <p className="mt-4 text-xs text-[var(--color-text-disabled)]">
            {outputLanguage === 'ko'
              ? 'AI가 전체 보고서를 작성 중입니다.'
              : 'AI is writing the full report.'}
          </p>
        )}

        {/* 취소 버튼 */}
        <button
          onClick={onCancel}
          className="mt-6 px-4 py-2 text-sm rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] transition-colors"
        >
          취소
        </button>
      </div>
    );
  }

  // 완료 (done)
  if (status === 'done') {
    const isRestored = source === 'restored';
    // 메타 라인을 [프로바이더, 모델, 토큰, 비용] 순으로 조립
    // 복원 모드에서는 토큰/비용 뒤에 "(저장 시점)" 힌트를 붙여 "지금 쓴 비용" 으로 오해하지 않게 한다.
    const savedSuffix = outputLanguage === 'ko' ? ' (저장 시점)' : ' (when saved)';
    const metaParts: string[] = [];
    if (providerLabel) metaParts.push(providerLabel);
    if (modelName) metaParts.push(modelName);
    if (typeof tokensUsed === 'number') {
      const base =
        outputLanguage === 'ko'
          ? `${tokensUsed.toLocaleString()} 토큰`
          : `${tokensUsed.toLocaleString()} tokens`;
      metaParts.push(isRestored ? base + savedSuffix : base);
    }
    if (typeof estimatedCostUsd === 'number') {
      const base =
        outputLanguage === 'ko'
          ? `예상 비용 ~$${estimatedCostUsd.toFixed(4)}`
          : `est. ~$${estimatedCostUsd.toFixed(4)}`;
      metaParts.push(isRestored ? base + savedSuffix : base);
    }
    return (
      <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-xl p-8 text-center">
        {/* 체크 아이콘 — 복원 모드는 emerald 대신 blue 로 톤 전환 */}
        <CheckCircle
          className={`w-10 h-10 mx-auto ${
            isRestored ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-status-success-fg)]'
          }`}
        />
        <p className="text-base font-medium text-[var(--color-text-primary)] mt-3">
          {isRestored
            ? outputLanguage === 'ko'
              ? '저장된 리포트를 불러왔습니다'
              : 'Loaded a saved report'
            : outputLanguage === 'ko'
              ? '리포트가 생성되었습니다'
              : 'Report generated'}
        </p>

        {/* 메타 라인: 프로바이더 · 모델 · 토큰 · 예상 비용 */}
        {metaParts.length > 0 && (
          <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1.5">
            {metaParts.map((part, i) => (
              <span key={i}>
                {i > 0 && (
                  <span className="mx-2 text-sm leading-none text-[var(--color-text-tertiary)]">·</span>
                )}
                {part}
              </span>
            ))}
          </p>
        )}

        {/* 복원 모드 전용 안내: 추가 AI 호출/비용이 없음을 명시 */}
        {isRestored && (
          <div
            className="mt-3 mx-auto max-w-md flex items-start gap-2 bg-[var(--color-accent-primary-subtle-bg)] dark:bg-[var(--color-accent-primary-subtle-bg)]/30 border border-[var(--color-accent-primary)] dark:border-[var(--color-accent-primary)] text-[var(--color-accent-primary)] dark:text-[var(--color-accent-primary)] text-[11px] rounded-lg px-3 py-2 text-left"
            role="note"
          >
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span className="leading-relaxed">
              {outputLanguage === 'ko'
                ? '재분석 없이 저장된 결과물을 그대로 다시 출력합니다. AI API 호출이 발생하지 않으며 추가 비용도 없습니다.'
                : 'Re-exporting the saved result locally. No AI API call and no additional cost.'}
            </span>
          </div>
        )}

        {/* 다운로드 버튼 */}
        <button
          onClick={() => onDownload(outputFormat)}
          className="mt-4 px-6 py-2.5 text-sm font-medium bg-[var(--color-button-primary-bg)] hover:bg-[var(--color-button-primary-bg-hover)] text-white rounded-lg transition-colors"
        >
          다운로드 ({outputFormat === 'pdf' ? 'PDF' : 'Word'})
        </button>

        {/* 닫기: idle(옵션 선택 화면)로 복귀 — 사용자 요청으로 "다시 생성" 을 "닫기" 로 변경 */}
        <button
          onClick={onReset}
          className="block mx-auto mt-3 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] underline transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none rounded px-1"
        >
          닫기
        </button>
      </div>
    );
  }

  // 에러 (error)
  if (status === 'error') {
    // 에러 메시지를 "사용자 메시지" 와 "상세 원본" 으로 분리
    // AI_ERROR_MESSAGES 의 한국어/영어 메시지 뒤에 " — {원본}" 형태로 붙은 케이스를 분리
    const errorStr = error ?? '';
    const dashIdx = errorStr.indexOf(' — ');
    const primaryMessage = dashIdx > 0 ? errorStr.slice(0, dashIdx) : errorStr;
    const detailMessage = dashIdx > 0 ? errorStr.slice(dashIdx + 3) : '';

    return (
      <div
        className="bg-[var(--color-status-error-bg)] border border-[var(--color-status-error-border)] rounded-xl p-8 text-center"
        role="alert"
      >
        {/* 경고 아이콘 */}
        <AlertTriangle className="w-10 h-10 text-[var(--color-status-error-fg)] dark:text-[var(--color-status-error-fg)] mx-auto" />
        <p className="text-sm text-[var(--color-status-error-fg)] dark:text-[var(--color-status-error-fg)] mt-3">{primaryMessage}</p>

        {/* 상세 원본 메시지 토글 (있을 때만) */}
        {detailMessage && (
          <div className="mt-4 max-w-md mx-auto">
            <button
              type="button"
              onClick={() => setShowErrorDetail((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--color-status-error-fg)]/70 hover:text-[var(--color-status-error-fg)] transition-colors"
            >
              {showErrorDetail ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  상세 정보 숨기기
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  상세 정보 보기
                </>
              )}
            </button>
            {showErrorDetail && (
              <div className="mt-2 bg-black/30 border border-[var(--color-status-error-border)] rounded-md px-3 py-2 text-left">
                <p className="text-[11px] text-[var(--color-status-error-fg)]/80 font-mono break-all whitespace-pre-wrap">
                  {detailMessage}
                </p>
              </div>
            )}
          </div>
        )}

        {/* 다시 시도 버튼 */}
        <button
          onClick={onRetry}
          className="mt-4 px-6 py-2.5 text-sm font-medium bg-[var(--color-button-danger-bg)] hover:bg-[var(--color-button-danger-bg-hover)] text-white rounded-lg transition-colors"
        >
          다시 시도
        </button>

        {/* 옵션으로 돌아가기 */}
        <button
          onClick={onReset}
          className="block mx-auto mt-3 text-xs text-[var(--color-text-tertiary)] underline"
        >
          옵션으로 돌아가기
        </button>
      </div>
    );
  }

  // idle -> 이 컴포넌트는 표시하지 않음
  return null;
}
