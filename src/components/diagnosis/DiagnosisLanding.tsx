import { Sparkles, FileSearch, Clock } from 'lucide-react';
import { useLogStore } from '../../store/logStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUiStore } from '../../store/uiStore';
import type { ExceptionDiagnosisInput } from '../../types/diagnosis';
import type { LogEntry } from '../../utils/logParser';
import { loadDiagnosisHistories } from '../../hooks/useDiagnosisHistory';
import { useEffect, useState } from 'react';
import type { DiagnosisHistory } from '../../types/diagnosis';

/**
 * AI 진단 사이드바 클릭 시 표시되는 랜딩 화면.
 * - 로그 미로드: 안내 메시지
 * - 로그 로드: 에러 목록 + [AI 진단 시작] 버튼
 */
export function DiagnosisLanding() {
  const entries = useLogStore((s) => s.entries);
  const analysis = useLogStore((s) => s.analysis);
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const openDiagnosis = useUiStore((s) => s.openDiagnosis);

  const hasData = entries.length > 0;
  const topErrors = analysis?.topErrors ?? [];

  // 이전 진단 히스토리 로드
  const [historyClasses, setHistoryClasses] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const items: DiagnosisHistory[] = await loadDiagnosisHistories();
      const classes = new Set(items.map((h) => h.fullName));
      setHistoryClasses(classes);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDiagnose = (err: typeof topErrors[0]) => {
    const matchingEntries = entries.filter(
      (entry) => entry.exceptionClass === err.exceptionClass
    );

    const relatedLogs: LogEntry[] = [];
    const addedIds = new Set<string>();
    for (const entry of matchingEntries) {
      const idx = entries.indexOf(entry);
      const start = Math.max(0, idx - 5);
      const end = Math.min(entries.length, idx + 6);
      for (let i = start; i < end; i++) {
        if (!addedIds.has(entries[i].id)) {
          addedIds.add(entries[i].id);
          relatedLogs.push(entries[i]);
        }
      }
    }

    const stackTraces = matchingEntries
      .filter((entry) => entry.stacktrace.length > 0)
      .map((entry) => entry.stacktrace);

    const timestamps = matchingEntries.map((e) => e.timestamp).sort();
    const firstOccurrence = timestamps[0] ?? '';
    const lastOccurrence = timestamps[timestamps.length - 1] ?? '';

    const input: ExceptionDiagnosisInput = {
      type: 'exception',
      exceptionClass: err.exceptionClass.split('.').pop() ?? err.exceptionClass,
      fullName: err.exceptionClass,
      count: err.count,
      stackTraces,
      firstOccurrence,
      lastOccurrence,
      relatedLogs: relatedLogs.slice(0, 50),
    };

    openDiagnosis(input, 'landing');
  };

  // 타임스탬프 포맷: "2024-01-15 14:23:45.123" → "01-15 14:23"
  const formatTime = (ts: string) => {
    if (!ts) return '';
    const match = ts.match(/\d{4}-(\d{2}-\d{2})\s+(\d{2}:\d{2})/);
    return match ? `${match[1]} ${match[2]}` : ts.slice(0, 16);
  };

  // 미로드 상태
  if (!hasData) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-[var(--color-accent-primary-subtle-bg)] border border-[var(--color-accent-primary)] flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-[var(--color-accent-primary)]" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-3">
            AI 진단
          </h2>
          <p className="text-sm text-[var(--color-text-tertiary)] leading-relaxed">
            로그 파일을 먼저 분석해주세요.
          </p>
          <p className="text-sm text-[var(--color-text-tertiary)] leading-relaxed mt-1">
            파일 분석 후 에러를 선택하여
            <br />
            AI 진단을 시작할 수 있습니다.
          </p>
          <button
            onClick={() => {
              useUiStore.getState().setActiveToolTab(null);
              useUiStore.getState().requestModeChange({ appMode: 'file', mainView: 'stacktrace' });
            }}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            <FileSearch className="w-4 h-4" />
            파일 분석으로 이동
          </button>
        </div>
      </div>
    );
  }

  // 로드 상태 — 에러 없음
  if (topErrors.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-[var(--color-status-success-bg)] border border-[var(--color-status-success-border)] flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-[var(--color-status-success-fg)]" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-3">
            에러가 없습니다
          </h2>
          <p className="text-sm text-[var(--color-text-tertiary)] leading-relaxed">
            현재 로그 파일에서 예외가 감지되지 않았습니다.
            <br />
            에러가 포함된 로그를 분석해주세요.
          </p>
        </div>
      </div>
    );
  }

  // 로드 상태 — 에러 목록 표시
  const maxCount = topErrors[0].count;

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* 헤더 */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-accent-primary-subtle-bg)] border border-[var(--color-accent-primary)] flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-[var(--color-accent-primary)]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              AI 진단
            </h2>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              분석할 에러를 선택하세요
            </p>
          </div>
        </div>
        {!aiProvider && (
          <div className="mt-3 bg-[var(--color-status-warn-bg)] border border-[var(--color-status-warn-border)] rounded-lg px-3 py-2">
            <p className="text-xs text-[var(--color-status-warn-fg)]">
              AI 프로바이더가 설정되지 않았습니다.{' '}
              <button
                onClick={() => useUiStore.getState().openSettingsModal()}
                className="underline hover:text-[var(--color-status-warn-fg)]"
              >
                설정에서 변경
              </button>
            </p>
          </div>
        )}
      </div>

      {/* 에러 목록 */}
      <div className="space-y-3">
        {topErrors.map((err, i) => {
          const shortName = err.exceptionClass.split('.').pop() ?? err.exceptionClass;
          const hasHistory = historyClasses.has(err.exceptionClass);

          return (
            <div
              key={err.exceptionClass}
              className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-xl p-4 hover:border-[var(--color-accent-primary)] transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* 예외명 + 히스토리 아이콘 */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-status-error-bg)] text-[var(--color-status-error-fg)] text-[10px] font-bold flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-[var(--color-status-error-fg)] truncate">
                      {shortName}
                    </span>
                    {hasHistory && (
                      <span title="이전 진단 기록 있음" className="flex-shrink-0">
                        <Clock className="w-3.5 h-3.5 text-[var(--color-accent-primary)]" />
                      </span>
                    )}
                    <span className="ml-auto flex-shrink-0 text-xs font-semibold text-[var(--color-text-secondary)] bg-[var(--color-status-error-bg)] px-2 py-0.5 rounded-full">
                      {err.count}건
                    </span>
                  </div>

                  {/* 풀 패키지명 */}
                  <p className="text-[10px] text-[var(--color-text-disabled)] font-mono truncate ml-7" title={err.exceptionClass}>
                    {err.exceptionClass}
                  </p>

                  {/* 발생 시간 + 바 */}
                  <div className="flex items-center gap-3 mt-2 ml-7">
                    <span className="text-[10px] text-[var(--color-text-disabled)]">
                      최초 {formatTime(err.firstOccurrence)} · 최종 {formatTime(err.lastOccurrence)}
                    </span>
                  </div>

                  {/* 카운트 바 */}
                  <div className="mt-2 ml-7 h-1 bg-[var(--color-border-default)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-status-error-fg)] rounded-full"
                      style={{ width: `${(err.count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>

                {/* AI 진단 시작 버튼 */}
                <button
                  onClick={() => handleDiagnose(err)}
                  disabled={!aiProvider}
                  className="flex-shrink-0 mt-1 flex items-center gap-1.5 bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)] text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AI 진단
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
