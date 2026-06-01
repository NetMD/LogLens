// 멀티 AI 비교 생성 오케스트레이터 (Step 5)
// 여러 프로바이더에 동일 프롬프트를 병렬 전송, 각 결과를 콜백으로 독립 전달한다.
// 기존 generateAiReport 는 단일 생성 전용으로 그대로 유지.

import { getActiveExport } from '../../store/exportStore';
import { buildAnalysisData } from './dataBuilder';
import { buildPrompt } from './promptTemplates';
import { getAiProvider } from './providers';
import { estimateOutputCostUsd } from './pricing';
import { AiApiError } from './types';
import type { AiProvider } from '../../types/settings';
import type { PresetType } from '../../store/exportStore';
import type { AnalysisPayload } from './types';

/** 개별 프로바이더 호출 명세 */
export interface ComparisonTarget {
  provider: AiProvider;
  model: string;
  apiKey: string;
}

/** 각 프로바이더별 진행/완료 상태 */
export type ComparisonEntryStatus = 'pending' | 'preparing' | 'calling-ai' | 'done' | 'error';

/** 콜백으로 전달되는 개별 결과 */
export interface ComparisonEntry {
  provider: AiProvider;
  model: string;
  status: ComparisonEntryStatus;
  markdown: string | null;
  error: string | null;
  tokensUsed: number | null;
  estimatedCostUsd: number | null;
  startedAt: number | null;
  completedAt: number | null;
}

/** 상태 변경 콜백 — UI 가 개별 카드를 업데이트하는 데 사용 */
export type OnEntryUpdate = (provider: AiProvider, patch: Partial<ComparisonEntry>) => void;

/**
 * 멀티 AI 비교 생성
 *
 * 흐름:
 *   1. 데이터 수집 + 프롬프트 빌드 (1회, 공유)
 *   2. 각 target 에 대해 병렬로 provider.send() 호출
 *   3. 완료/에러마다 onUpdate 콜백으로 UI 에 전달
 *
 * @returns 전체 완료 시 resolve (개별 에러는 onUpdate 로만 전달, reject 안 함)
 */
export async function generateComparisonReports(params: {
  targets: ComparisonTarget[];
  presetType: PresetType;
  outputLanguage: 'ko' | 'en';
  signal: AbortSignal;
  onUpdate: OnEntryUpdate;
}): Promise<void> {
  const { targets, presetType, outputLanguage, signal, onUpdate } = params;

  // ── 1. 공유 데이터 준비 (1회) ──
  const exp = getActiveExport();
  const payload: AnalysisPayload = await buildAnalysisData({
    projectRoot: exp.projectRoot,
    language: outputLanguage,
    abortSignal: signal,
  });

  if (signal.aborted) return;

  const { systemPrompt, userPrompt } = buildPrompt(presetType, payload, {
    language: outputLanguage,
  });

  if (signal.aborted) return;

  // ── 2. 병렬 호출 ──
  const jobs = targets.map((t) =>
    callSingleProvider(t, systemPrompt, userPrompt, signal, onUpdate),
  );

  // 모든 job 을 기다림 (개별 에러는 내부 catch, 전체 reject 없음)
  await Promise.allSettled(jobs);
}

/** 개별 프로바이더 호출 — 실패해도 throw 안 하고 onUpdate 로 에러 전달 */
async function callSingleProvider(
  target: ComparisonTarget,
  systemPrompt: string,
  userPrompt: string,
  signal: AbortSignal,
  onUpdate: OnEntryUpdate,
): Promise<void> {
  const { provider, model, apiKey } = target;
  const startedAt = Date.now();

  onUpdate(provider, { status: 'calling-ai', startedAt });

  try {
    const adapter = getAiProvider(provider);
    const response = await adapter.send(
      { systemPrompt, userPrompt, maxTokens: 4096 },
      apiKey,
      model,
      signal,
    );

    if (signal.aborted) return;

    if (!response.content || response.content.length === 0) {
      throw new AiApiError('PARSE_ERROR', 'AI 응답이 비어있습니다.');
    }

    const tokensUsed = response.tokensUsed ?? null;
    const estimatedCost = estimateOutputCostUsd(provider, model, tokensUsed);

    onUpdate(provider, {
      status: 'done',
      markdown: response.content,
      tokensUsed,
      estimatedCostUsd: estimatedCost,
      completedAt: Date.now(),
    });
  } catch (e) {
    if (signal.aborted) return;

    const errorMsg =
      e instanceof AiApiError
        ? e.type === 'ABORTED'
          ? null
          : e.message || e.type
        : e instanceof Error
          ? e.message
          : '알 수 없는 오류';

    if (errorMsg === null) return; // abort

    onUpdate(provider, {
      status: 'error',
      error: errorMsg,
      completedAt: Date.now(),
    });
  }
}
