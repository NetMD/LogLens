// AI 리포트 생성 오케스트레이션 (8차 재작성)
// logStore / exportStore / settingsStore 상태를 조합하여 AI 호출 → 문서 생성까지 파이프라인 실행

import { useSettingsStore } from '../../store/settingsStore';
import { useExportStore, getActiveExport } from '../../store/exportStore';
import { getAiProvider } from './providers';
import { buildPrompt } from './promptTemplates';
import { buildAnalysisData } from './dataBuilder';
import { extractStructure } from './wordTemplateParser';
import type { AiReportResponse } from './types';
import type { WordStructureHint } from './wordTemplateParser';
import { AiApiError } from './types';
import { getActiveApiKey, isLocalProvider } from '../../types/settings';

/** AI 리포트 생성 결과 — UI 레이어가 토큰 사용량까지 받아 비용 추정에 사용 */
export interface AiReportResult {
  content: string;
  tokensUsed: number | null;
}

/**
 * AI 리포트 생성 오케스트레이션 (8차)
 *
 * 단계:
 *   1. 사전 검증 (API 키)
 *   2. collecting → buildAnalysisData (dataBuilder 호출)
 *   3. analyzing-source (조건부: projectRoot 있음 && payload.sourceCode 있음)
 *   4. Word 템플릿 파싱 (inputMode=='upload')
 *   5. calling-ai → provider.send(onDelta 콜백으로 스트리밍)
 *   6. generating-doc → markdownToDocx (outputFormat=='docx'일 때)
 */
export async function generateAiReport(
  abortCheck: () => boolean,
  signal: AbortSignal,
): Promise<AiReportResult> {
  const store = useExportStore.getState();
  const exp = getActiveExport(); // 활성 탭 ExportState 스냅샷 (필드 읽기용)
  const settings = useSettingsStore.getState();

  // 1. 사전 검증
  //    - 클라우드: API 키 필수
  //    - 로컬 LLM: 모델명 필수 (API 키 불필요)
  const activeApiKey = getActiveApiKey(settings);
  if (!settings.aiProvider) {
    throw new AiApiError('API_KEY_NOT_CONFIGURED', '');
  }
  if (isLocalProvider(settings.aiProvider)) {
    if (!settings.localLlmModel.trim()) {
      throw new AiApiError('API_KEY_NOT_CONFIGURED', '로컬 LLM 모델명이 설정되지 않았습니다.');
    }
  } else if (!activeApiKey) {
    throw new AiApiError('API_KEY_NOT_CONFIGURED', '');
  }

  // 2. 데이터 수집 (collecting)
  store.setGenerationStatus('collecting');
  const payload = await buildAnalysisData({
    projectRoot: exp.projectRoot,
    language: exp.outputLanguage,
    abortSignal: signal,
  });
  if (abortCheck()) throw new AiApiError('ABORTED', '');

  // 3. 소스 분석 단계 (analyzing-source)
  //    dataBuilder 내부에서 이미 resolveSources가 실행되었으므로
  //    여기서는 시각적 단계 구분용으로만 상태를 전이한다.
  if (exp.projectRoot !== null && payload.sourceCode !== undefined) {
    store.setGenerationStatus('analyzing-source');
  }

  // 4. Word 템플릿 파싱 (inputMode=='upload')
  let wordHint: WordStructureHint | undefined;
  if (exp.inputMode === 'upload' && exp.uploadedFile) {
    try {
      wordHint = await extractStructure(exp.uploadedFile.arrayBuffer);
    } catch (e) {
      // extractStructure는 이미 AiApiError를 throw하므로 그대로 전파
      if (e instanceof AiApiError) throw e;
      throw new AiApiError(
        'WORD_TEMPLATE_PARSE_FAIL',
        'Failed to parse uploaded word template',
      );
    }
    if (abortCheck()) throw new AiApiError('ABORTED', '');
  }

  // 5. AI 호출 (calling-ai) — 스트리밍
  store.setGenerationStatus('calling-ai');
  store.resetStreamingBuffer();
  const { systemPrompt, userPrompt } = buildPrompt(exp.presetType, payload, {
    language: exp.outputLanguage,
    wordStructureHint: wordHint,
  });
  const provider = getAiProvider(settings.aiProvider);
  // aiModel이 비어있으면 프로바이더명 폴백 (프로바이더가 기본 모델 사용)
  // 로컬 LLM: localLlmModel 사용 (aiModel 이 빈 문자열일 수 있음)
  const model = isLocalProvider(settings.aiProvider)
    ? settings.localLlmModel
    : (settings.aiModel || settings.aiProvider);

  // --- 스트리밍 kill switch ---
  // Tauri plugin-http 2.5.8 이 SSE ReadableStream 을 실시간 전달하지 못해
  // OpenAI/Gemini 모두 200 OK 에도 empty accumulated buffer 를 반환하는 버그 존재.
  // 안전한 non-stream JSON 경로로 통일 (onDelta 미전달).
  // 나중에 plugin-http 업데이트 / 다른 해결책 찾으면 이 플래그만 true 로 되돌리면 됨.
  const ENABLE_STREAMING = false;

  if (import.meta.env.DEV) {
    console.log('[reportGenerator] calling provider.send', {
      provider: settings.aiProvider,
      model,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      maxTokens: 4096,
      streaming: ENABLE_STREAMING,
    });
  }

  const response: AiReportResponse = await provider.send(
    { systemPrompt, userPrompt, maxTokens: 4096 },
    isLocalProvider(settings.aiProvider) ? '' : activeApiKey,
    model,
    signal,
    // 스트리밍 활성화 시에만 onDelta 전달. 비활성화 시 provider 는 non-stream JSON 경로 사용.
    ENABLE_STREAMING
      ? (delta) => {
          const fid = useExportStore.getState().currentFileId;
          if (fid) useExportStore.getState().appendStreamingBuffer(fid, delta);
        }
      : undefined,
  );

  if (import.meta.env.DEV) {
    console.log('[reportGenerator] provider.send completed', {
      provider: settings.aiProvider,
      contentLength: response.content?.length ?? 0,
      tokensUsed: response.tokensUsed,
      firstChars: response.content?.slice(0, 100),
    });
  }

  if (abortCheck()) throw new AiApiError('ABORTED', '');

  // 응답이 비어있을 때 명시적 에러로 변환 — 빈 페이지 생성 방지
  if (!response.content || response.content.length === 0) {
    throw new AiApiError(
      'PARSE_ERROR',
      'AI 응답이 비어있습니다. 모델 호환성이나 스트리밍 파싱 문제일 수 있습니다. 다른 모델을 시도해 주세요.',
    );
  }

  // 6. 문서 생성 (generating-doc)
  store.setGenerationStatus('generating-doc');
  useExportStore.getState().setGeneratedContent(response.content);

  if (getActiveExport().outputFormat === 'docx') {
    try {
      const blob = await markdownToDocx(
        response.content,
        getActiveExport().title || payload.summary.fileName,
      );
      useExportStore.getState().setGeneratedBlob(blob);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'docx generation failed';
      throw new AiApiError('DOCX_GENERATION_FAIL', msg);
    }
  }

  useExportStore.getState().setGenerationStatus('done');
  return {
    content: response.content,
    tokensUsed: response.tokensUsed ?? null,
  };
}

/**
 * 마크다운 텍스트를 docx Blob으로 변환
 * 기본적인 헤딩/본문만 지원 (P1에서 표/목록 개선 예정)
 * export: 히스토리 재다운로드 흐름에서도 재사용한다.
 */
export async function markdownToDocx(markdown: string, title: string): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');

  // 마크다운을 줄 단위로 파싱하여 docx Paragraph로 변환
  const paragraphs: (typeof Paragraph.prototype)[] = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    if (line.startsWith('# ')) {
      paragraphs.push(new Paragraph({
        text: line.slice(2),
        heading: HeadingLevel.HEADING_1,
      }));
    } else if (line.startsWith('## ')) {
      paragraphs.push(new Paragraph({
        text: line.slice(3),
        heading: HeadingLevel.HEADING_2,
      }));
    } else if (line.startsWith('### ')) {
      paragraphs.push(new Paragraph({
        text: line.slice(4),
        heading: HeadingLevel.HEADING_3,
      }));
    } else if (line.trim()) {
      paragraphs.push(new Paragraph({
        children: [new TextRun(line)],
      }));
    } else {
      paragraphs.push(new Paragraph({ text: '' }));
    }
  }

  const doc = new Document({
    title,
    sections: [{ properties: {}, children: paragraphs }],
  });

  return await Packer.toBlob(doc);
}
