// 멀티 AI 비교 생성 — 프로바이더 선택 + 병렬 생성 + 결과 그리드 (Step 5)

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Sparkles, Settings, History, Download } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import { useUiStore } from '../../store/uiStore';
import { getActiveFile, useActiveFileName } from '../../store/activeFileSelectors';
import type { AiProvider } from '../../types/settings';
import {
  AI_PROVIDERS,
  AI_PROVIDER_LABELS,
  AI_DEFAULT_MODELS,
  AI_MODEL_OPTIONS,
  isLocalProvider,
} from '../../types/settings';
import type { PresetType } from '../../store/exportStore';
import { useExportStore, useActiveExportField } from '../../store/exportStore';
import { ProjectRootPicker } from './ProjectRootPicker';
import { SourceFileConfirmDialog } from './SourceFileConfirmDialog';
import {
  generateComparisonReports,
  type ComparisonEntry,
  type ComparisonTarget,
  type OnEntryUpdate,
} from '../../services/ai/multiReportGenerator';
import { useAiReportHistory } from '../../hooks/useAiReportHistory';
import { useAiReportHistoryStore } from '../../store/aiReportHistoryStore';
import type { AiReportHistoryEntry, ComparisonHistoryResult } from '../../types/aiReportHistory';
import { isSingleEntry } from '../../types/aiReportHistory';
import { ComparisonCard } from './ComparisonCard';
import { ComparisonDetailModal } from './ComparisonDetailModal';
import { PrintableAiReport } from './PrintableAiReport';

// 프리셋 정의 (AiReportTab 과 동일 — 추후 공유 상수로 추출 가능). 라벨 i18n key.
const PRESETS: { type: PresetType; labelKey: string }[] = [
  { type: 'incident', labelKey: 'pdf.presetIncident' },
  { type: 'daily', labelKey: 'pdf.presetDaily' },
  { type: 'devSummary', labelKey: 'pdf.presetDevSummary' },
];

/** 비어있는 ComparisonEntry 초기값 */
function emptyEntry(provider: AiProvider, model: string): ComparisonEntry {
  return {
    provider,
    model,
    status: 'pending',
    markdown: null,
    error: null,
    tokensUsed: null,
    estimatedCostUsd: null,
    startedAt: null,
    completedAt: null,
  };
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${pad(d.getDate())}`;
}

function formatRelativeTime(iso: string, t: (k: string, opts?: Record<string, unknown>) => string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return t('pdf.justNow');
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return t('pdf.justNow');
  const min = Math.floor(sec / 60);
  if (min < 60) return t('pdf.minutesAgo', { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('pdf.hoursAgo', { count: hr });
  const day = Math.floor(hr / 24);
  if (day < 7) return t('pdf.daysAgo', { count: day });
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function MultiAiComparison() {
  const { t } = useTranslation();
  const aiApiKeys = useSettingsStore((s) => s.aiApiKeys);

  const localLlmModel = useSettingsStore((s) => s.localLlmModel);
  const localLlmEndpoint = useSettingsStore((s) => s.localLlmEndpoint);
  const openSettingsModal = useUiStore((s) => s.openSettingsModal);
  const fileName = useActiveFileName();
  const projectRoot = useActiveExportField('projectRoot');
  const setProjectRoot = useExportStore((s) => s.setProjectRoot);

  // 히스토리
  const { add: addAiReportHistory } = useAiReportHistory();
  const aiReportHistoryEntries = useAiReportHistoryStore((s) => s.entries);

  // ── 프로바이더별 선택/모델 상태 ──
  /** 프로바이더별 사용 가능 여부 (클라우드: 키 등록, 로컬: 모델명 입력) */
  function isProviderReady(p: AiProvider): boolean {
    if (isLocalProvider(p)) return localLlmModel.trim() !== '';
    return (aiApiKeys[p] ?? '') !== '';
  }

  const [selected, setSelected] = useState<Record<AiProvider, boolean>>(() => {
    const init: Record<AiProvider, boolean> = { claude: false, openai: false, gemini: false, local: false };
    for (const p of AI_PROVIDERS) {
      if (isLocalProvider(p)) {
        if (localLlmModel.trim() !== '') init[p] = true;
      } else if ((aiApiKeys[p] ?? '') !== '') {
        init[p] = true;
      }
    }
    return init;
  });
  const [models, setModels] = useState<Record<AiProvider, string>>(() => ({
    claude: AI_DEFAULT_MODELS.claude,
    openai: AI_DEFAULT_MODELS.openai,
    gemini: AI_DEFAULT_MODELS.gemini,
    local: localLlmModel || '',
  }));
  const [presetType, setPresetType] = useState<PresetType>('incident');
  const [outputLanguage, setOutputLanguage] = useState<'ko' | 'en'>('ko');

  // ── 생성 상태 ──
  const [isRunning, setIsRunning] = useState(false);
  const [entries, setEntries] = useState<Record<string, ComparisonEntry>>({});
  const abortRef = useRef<AbortController | null>(null);

  // ── 모달 ──
  const [detailProvider, setDetailProvider] = useState<AiProvider | null>(null);
  const [showPrintable, setShowPrintable] = useState<AiProvider | null>(null);

  // ── 이력 ──
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [historyPrintTarget, setHistoryPrintTarget] = useState<ComparisonHistoryResult | null>(null);
  const comparisonHistoryEntries = aiReportHistoryEntries.filter((e) => !isSingleEntry(e));

  // 소스 코드 전송 확인 모달
  const [sourceConfirmOpen, setSourceConfirmOpen] = useState(false);
  const [sourceConfirmFiles, setSourceConfirmFiles] = useState<string[]>([]);
  const [sourceConfirmLoading, setSourceConfirmLoading] = useState(false);

  const selectedCount = AI_PROVIDERS.filter((p) => selected[p]).length;
  const hasAnyKey = AI_PROVIDERS.some((p) => isProviderReady(p));

  function toggleProvider(p: AiProvider) {
    setSelected((prev) => ({ ...prev, [p]: !prev[p] }));
  }

  function setModel(p: AiProvider, model: string) {
    setModels((prev) => ({ ...prev, [p]: model }));
  }

  // ── 생성 버튼 클릭 → 소스 확인 모달 or 즉시 생성 ──
  async function handleGenerateClick(): Promise<void> {
    if (selectedCount < 2) return;

    if (projectRoot) {
      setSourceConfirmLoading(true);
      setSourceConfirmFiles([]);
      setSourceConfirmOpen(true);
      try {
        const { previewSourceFiles } = await import('../../services/ai/sourceCodeResolver');
        const entries = getActiveFile()?.entries ?? [];
        const errorEntries = entries
          .filter((e) => e.level === 'ERROR' || e.level === 'FATAL')
          .slice(0, 5);
        const traces = errorEntries
          .filter((e) => e.stacktrace.length > 0)
          .map((e) => ({
            level: e.level,
            timestamp: e.timestamp,
            logger: e.logger,
            message: e.message,
            exceptionClass: e.exceptionClass ?? '',
            frames: e.stacktrace.map(
              (f) => `at ${f.className}.${f.methodName}(${f.fileName}:${f.lineNumber})`,
            ),
          }));
        const files = await previewSourceFiles(traces, projectRoot);
        setSourceConfirmFiles(files);
      } catch {
        setSourceConfirmFiles([]);
      } finally {
        setSourceConfirmLoading(false);
      }
      return;
    }

    await handleGenerate();
  }

  // ── 실제 생성 핸들러 ──
  const handleGenerate = useCallback(async () => {
    const targets: ComparisonTarget[] = AI_PROVIDERS
      .filter((p) => selected[p] && isProviderReady(p))
      .map((p) => ({
        provider: p,
        model: isLocalProvider(p) ? localLlmModel : models[p],
        apiKey: isLocalProvider(p) ? '' : aiApiKeys[p]!,
      }));

    if (targets.length < 2) return;

    // 초기 상태 세팅
    const initial: Record<string, ComparisonEntry> = {};
    for (const t of targets) {
      initial[t.provider] = emptyEntry(t.provider, t.model);
    }
    setEntries(initial);
    setIsRunning(true);
    setDetailProvider(null);

    abortRef.current = new AbortController();

    // ref 로 최종 결과 수집 (React state 배칭과 무관하게 최신값 보장)
    const collected: Record<string, ComparisonEntry> = { ...initial };

    const onUpdate: OnEntryUpdate = (provider, patch) => {
      collected[provider] = { ...collected[provider], ...patch };
      setEntries((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], ...patch },
      }));
    };

    try {
      await generateComparisonReports({
        targets,
        presetType,
        outputLanguage,
        signal: abortRef.current.signal,
        onUpdate,
      });
    } finally {
      setIsRunning(false);
      // 전체 완료 후 비교 세션을 하나의 히스토리 항목으로 저장
      const results: ComparisonHistoryResult[] = Object.values(collected)
        .filter((e) => e.status === 'done' || e.status === 'error')
        .map((e) => ({
          provider: e.provider,
          model: e.model,
          status: e.status === 'done' ? 'done' as const : 'error' as const,
          tokensUsed: e.tokensUsed,
          estimatedCostUsd: e.estimatedCostUsd,
          markdown: e.markdown,
          error: e.error,
          elapsedSec:
            e.startedAt !== null && e.completedAt !== null
              ? (e.completedAt - e.startedAt) / 1000
              : null,
        }));
      if (results.length > 0) {
        const firstProvider = targets[0].provider;
        const entry: AiReportHistoryEntry = {
          id: crypto.randomUUID(),
          generatedAt: new Date().toISOString(),
          sourceFileName: getActiveFile()?.fileName ?? '(unknown)',
          sourceFileSize: getActiveFile()?.fileSize ?? 0,
          presetType,
          inputMode: 'preset',
          uploadedFileName: null,
          outputLanguage,
          outputFormat: 'pdf',
          provider: firstProvider,
          model: '',
          tokensUsed: null,
          estimatedCostUsd: null,
          markdown: '',
          comparisonResults: results,
        };
        void addAiReportHistory(entry).catch((e) =>
          console.warn('[MultiAiComparison] 히스토리 저장 실패:', e),
        );
      }
    }
  }, [selected, models, aiApiKeys, presetType, outputLanguage, localLlmModel]);

  function handleCancel() {
    abortRef.current?.abort();
    setIsRunning(false);
  }

  function handleRemoveCard(p: AiProvider) {
    setEntries((prev) => {
      const next = { ...prev };
      delete next[p];
      return next;
    });
  }

  /** 이력에서 개별 결과 다운로드 (ComparisonHistoryResult → PDF 인쇄) */
  async function handleDownloadFromHistory(r: ComparisonHistoryResult) {
    if (!r.markdown) return;
    setHistoryPrintTarget(r);

    // macOS: OS 저장 다이얼로그 디렉토리를 다운로드 폴더로 리셋
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('reset_save_directory');
    } catch { /* non-critical */ }

    const originalTitle = document.title;
    const label = AI_PROVIDER_LABELS[r.provider];
    document.title = t('pdf.comparisonReportTitle', { label, model: r.model });

    const afterPrint = () => {
      setHistoryPrintTarget(null);
      document.title = originalTitle;
      window.removeEventListener('afterprint', afterPrint);
    };
    window.addEventListener('afterprint', afterPrint);

    setTimeout(() => {
      try {
        window.print();
      } catch {
        setHistoryPrintTarget(null);
        document.title = originalTitle;
        window.removeEventListener('afterprint', afterPrint);
      }
    }, 300);
  }

  /** 전체 결과를 ZIP 으로 다운로드 (각 결과를 .md 파일로 묶음) */
  async function handleDownloadZip(): Promise<void> {
    const doneEntries = Object.values(entries).filter(
      (e) => e.status === 'done' && e.markdown,
    );
    if (doneEntries.length === 0) return;

    try {
      const { zipSync } = await import('fflate');
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeFile } = await import('@tauri-apps/plugin-fs');

      const encoder = new TextEncoder();
      const files: Record<string, Uint8Array> = {};
      for (const e of doneEntries) {
        const label = AI_PROVIDER_LABELS[e.provider];
        const safeName = `${label} (${e.model}).md`
          .replace(/[\\/:*?"<>|]/g, '_');
        files[safeName] = encoder.encode(e.markdown!);
      }

      const zipData = zipSync(files, { level: 6 });

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      // 파일명 베이스는 i18n 키에서 가져온 라벨에 timestamp + provider/model placeholders 제거
      const baseLabel = t('pdf.comparisonReportTitle', { label: '', model: '' }).replace(/[\s\-()]+$/, '').trim();
      const defaultName = `${baseLabel} - ${ts}.zip`;

      const path = await save({
        defaultPath: defaultName,
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      });

      if (path) {
        await writeFile(path, zipData);
      }
    } catch (e) {
      console.warn('[MultiAiComparison] ZIP 다운로드 실패:', e);
    }
  }

  // ── PDF 다운로드 (개별 카드) ──
  async function handleDownload(p: AiProvider) {
    const entry = entries[p];
    if (!entry?.markdown) return;

    setShowPrintable(p);

    // macOS: OS 저장 다이얼로그 디렉토리를 다운로드 폴더로 리셋
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('reset_save_directory');
    } catch { /* non-critical */ }

    const originalTitle = document.title;
    const label = AI_PROVIDER_LABELS[p];
    document.title = t('pdf.comparisonReportTitle', { label, model: entry.model });

    const afterPrint = () => {
      setShowPrintable(null);
      document.title = originalTitle;
      window.removeEventListener('afterprint', afterPrint);
    };
    window.addEventListener('afterprint', afterPrint);

    setTimeout(() => {
      try {
        window.print();
      } catch {
        setShowPrintable(null);
        document.title = originalTitle;
        window.removeEventListener('afterprint', afterPrint);
      }
    }, 300);
  }

  const entryList = Object.values(entries);
  const hasResults = entryList.length > 0;
  const detailEntry = detailProvider !== null ? entries[detailProvider] : null;
  const printEntry = showPrintable !== null ? entries[showPrintable] : null;

  // ── 키 미등록 ──
  if (!hasAnyKey) {
    return (
      <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-xl p-6 text-center">
        <Sparkles className="w-8 h-8 text-[var(--color-text-disabled)] mx-auto mb-3" />
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('pdf.noKeysForComparison')}
        </p>
        <button
          onClick={() => openSettingsModal('ai')}
          className="mt-4 px-4 py-2 text-sm rounded-lg border border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] transition-colors inline-flex items-center gap-2"
        >
          <Settings className="w-4 h-4" />
          {t('pdf.aiSettings')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── 프로바이더 선택 (체크박스 + 모델 드롭다운) ── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs text-[var(--color-text-tertiary)]">
            {t('pdf.compareSelectLabel')}
          </label>
          <button
            type="button"
            onClick={() => openSettingsModal('ai')}
            className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] inline-flex items-center gap-1 transition-colors"
          >
            <Settings className="w-3 h-3" />
            {t('pdf.manageInSettings')}
          </button>
        </div>
        <div className="space-y-2">
          {AI_PROVIDERS.map((p) => {
            const isLocal = isLocalProvider(p);
            const ready = isProviderReady(p);
            const checked = selected[p];
            return (
              <div
                key={p}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  checked && ready
                    ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary-subtle-bg)]/20'
                    : 'border-[var(--color-border-default)] bg-[var(--color-bg-elevated)]'
                } ${!ready ? 'opacity-40' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked && ready}
                  disabled={!ready}
                  onChange={() => toggleProvider(p)}
                  className="accent-blue-500 flex-shrink-0"
                />
                <span className="text-sm text-[var(--color-text-primary)] w-16 flex-shrink-0">
                  {isLocal ? t('pdf.localLabel') : AI_PROVIDER_LABELS[p]}
                </span>
                {ready ? (
                  isLocal ? (
                    <span className="flex-1 min-w-0 text-xs text-[var(--color-text-secondary)] font-mono truncate">
                      {localLlmModel}
                      <span className="text-[var(--color-text-disabled)] ml-1.5">
                        ({localLlmEndpoint})
                      </span>
                    </span>
                  ) : (
                    <select
                      value={models[p]}
                      onChange={(e) => setModel(p, e.target.value)}
                      disabled={!checked}
                      className="flex-1 min-w-0 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-2 py-1 text-xs text-[var(--color-text-primary)] disabled:opacity-40"
                    >
                      {AI_MODEL_OPTIONS[p].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      {!AI_MODEL_OPTIONS[p].includes(models[p]) && (
                        <option value={models[p]}>{models[p]}</option>
                      )}
                    </select>
                  )
                ) : (
                  <span className="text-[11px] text-[var(--color-text-disabled)]">
                    {isLocal ? t('pdf.modelNotSetShort') : t('pdf.apiKeyNotSet')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 프리셋 + 언어 ── */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">{t('pdf.presetLabel')}</label>
          <select
            value={presetType}
            onChange={(e) => setPresetType(e.target.value as PresetType)}
            disabled={isRunning}
            className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)]"
          >
            {PRESETS.map((p) => (
              <option key={p.type} value={p.type}>
                {t(p.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">{t('pdf.outputLanguageLabel')}</label>
          <select
            value={outputLanguage}
            onChange={(e) => setOutputLanguage(e.target.value as 'ko' | 'en')}
            disabled={isRunning}
            className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)]"
          >
            <option value="ko">{t('pdf.ko')}</option>
            <option value="en">{t('pdf.en')}</option>
          </select>
        </div>
      </div>

      {/* ── 프로젝트 루트 (단일 생성과 공유) ── */}
      <div>
        <label className="block text-xs text-[var(--color-text-tertiary)] mb-1.5">
          {t('pdf.projectRootLabel')}
        </label>
        <ProjectRootPicker
          projectRoot={projectRoot}
          onChange={setProjectRoot}
          disabled={isRunning}
        />
        <p className="text-xs text-[var(--color-text-disabled)] mt-1.5">
          {t('pdf.projectRootCompactHelp')}
        </p>
      </div>

      {/* ── 비교 생성 / 취소 버튼 ── */}
      {isRunning ? (
        <button
          onClick={handleCancel}
          className="w-full py-2.5 text-sm font-medium border border-[var(--color-border-default)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] rounded-lg transition-colors"
        >
          {t('pdf.cancel')}
        </button>
      ) : (
        <button
          onClick={handleGenerateClick}
          disabled={selectedCount < 2}
          className="w-full py-2.5 text-sm font-medium bg-[var(--color-status-success-fg)] hover:bg-[var(--color-status-success-fg)] text-white rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-status-success-fg)]"
        >
          <Sparkles className="w-4 h-4" />
          {t('pdf.comparisonGenerateCount', { count: selectedCount })}
        </button>
      )}
      {selectedCount < 2 && !isRunning && (
        <p className="text-xs text-[var(--color-text-tertiary)] -mt-3">
          {t('pdf.comparisonHint')}
        </p>
      )}

      {/* ── 결과 카드 그리드 ── */}
      {hasResults && (
        <div className="pt-3 border-t border-[var(--color-border-default)]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {t('pdf.resultProgress', { done: entryList.filter((e) => e.status === 'done').length, total: entryList.length })}
            </p>
            {!isRunning && (
              <button
                type="button"
                onClick={() => setEntries({})}
                className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                {t('pdf.closeButton')}
              </button>
            )}
          </div>
          <div
            className={`grid gap-3 ${
              entryList.length === 2
                ? 'grid-cols-2'
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {entryList.map((e) => (
              <ComparisonCard
                key={e.provider}
                entry={e}
                onViewDetail={() => setDetailProvider(e.provider)}
                onDownload={() => handleDownload(e.provider)}
                onRemove={() => handleRemoveCard(e.provider)}
              />
            ))}
          </div>

          {/* 전체 다운로드 (ZIP) — 2개 이상 성공 결과가 있을 때만 표시 */}
          {!isRunning && entryList.filter((e) => e.status === 'done' && e.markdown).length >= 2 && (
            <button
              type="button"
              onClick={handleDownloadZip}
              className="mt-3 w-full py-2.5 text-sm font-medium border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              {t('pdf.downloadZip')}
            </button>
          )}
        </div>
      )}

      {/* ── 비교 세션 이력 ── */}
      {comparisonHistoryEntries.length > 0 && (
        <div className="pt-3 border-t border-[var(--color-border-default)]">
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] mb-2">
            <History className="w-3.5 h-3.5" />
            <span>{t('pdf.comparisonHistoryTitle', { count: comparisonHistoryEntries.length })}</span>
          </div>
          <ul className="space-y-1.5">
            {comparisonHistoryEntries.slice(0, 5).map((h) => {
              const results = h.comparisonResults!;
              const doneCount = results.filter((r) => r.status === 'done').length;
              const errorCount = results.filter((r) => r.status === 'error').length;
              const isExpanded = expandedHistoryId === h.id;
              const dateStr = formatShortDate(h.generatedAt);

              return (
                <li
                  key={h.id}
                  className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg overflow-hidden"
                >
                  {/* 요약 행 — 클릭으로 펼침 */}
                  <button
                    type="button"
                    onClick={() => setExpandedHistoryId(isExpanded ? null : h.id)}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--color-bg-hover)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[var(--color-text-primary)] truncate">
                        {t('pdf.comparisonSummary', { date: dateStr, file: h.sourceFileName })}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-disabled)] flex-shrink-0">
                        {formatRelativeTime(h.generatedAt, t)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                      {errorCount > 0
                        ? t('pdf.comparisonAttemptsWithFail', { total: results.length, done: doneCount, fail: errorCount })
                        : t('pdf.comparisonAttempts', { total: results.length, done: doneCount })}
                    </p>
                  </button>

                  {/* 펼침: 개별 결과 + 다운로드 */}
                  {isExpanded && (
                    <div className="border-t border-[var(--color-border-default)] px-3 py-2 space-y-1.5">
                      {results.map((r) => (
                        <div
                          key={r.provider}
                          className="flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                r.status === 'done' ? 'bg-[var(--color-status-success-fg)]' : 'bg-[var(--color-status-error-fg)]'
                              }`}
                            />
                            <span className="text-xs text-[var(--color-text-primary)]">
                              {AI_PROVIDER_LABELS[r.provider]}
                            </span>
                            <span className="text-[10px] text-[var(--color-text-tertiary)] truncate">
                              {r.model}
                            </span>
                          </div>
                          {r.status === 'done' && r.markdown ? (
                            <button
                              type="button"
                              onClick={() => handleDownloadFromHistory(r)}
                              className="text-[10px] text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary)] flex-shrink-0 transition-colors"
                            >
                              {t('pdf.downloadShort')}
                            </button>
                          ) : (
                            <span className="text-[10px] text-[var(--color-status-error-fg)] flex-shrink-0">{t('pdf.failedShort')}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── 상세 모달 ── */}
      {detailEntry && detailEntry.status === 'done' && detailEntry.markdown && (
        <ComparisonDetailModal
          entry={detailEntry}
          onClose={() => setDetailProvider(null)}
          onDownload={() => {
            setDetailProvider(null);
            handleDownload(detailEntry.provider);
          }}
        />
      )}

      {/* ── PDF 인쇄 Portal (현재 세션 카드) ── */}
      {printEntry && printEntry.markdown &&
        createPortal(
          <PrintableAiReport
            title={t('pdf.comparisonReportTitle', { label: AI_PROVIDER_LABELS[printEntry.provider], model: printEntry.model })}
            markdown={printEntry.markdown}
            fileName={fileName ?? ''}
            generatedAt={new Date().toISOString()}
          />,
          document.body,
        )}

      {/* ── PDF 인쇄 Portal (이력에서 다운로드) ── */}
      {historyPrintTarget && historyPrintTarget.markdown &&
        createPortal(
          <PrintableAiReport
            title={t('pdf.comparisonReportTitle', { label: AI_PROVIDER_LABELS[historyPrintTarget.provider], model: historyPrintTarget.model })}
            markdown={historyPrintTarget.markdown}
            fileName={fileName ?? ''}
            generatedAt={new Date().toISOString()}
          />,
          document.body,
        )}

      {/* 소스 코드 전송 확인 다이얼로그 */}
      <SourceFileConfirmDialog
        open={sourceConfirmOpen}
        files={sourceConfirmFiles}
        loading={sourceConfirmLoading}
        provider={null}
        onConfirm={() => {
          setSourceConfirmOpen(false);
          void handleGenerate();
        }}
        onCancel={() => setSourceConfirmOpen(false)}
      />
    </div>
  );
}
