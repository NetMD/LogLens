// 기본 PDF 탭 -- 제목 입력, 체크박스 선택, PDF 생성 버튼

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileDown } from 'lucide-react';
import { useExportStore } from '../../store/exportStore';
import type { IncludeSections, StacktraceLimit } from '../../store/exportStore';
import { useLogStore } from '../../store/logStore';
import { PrintableReport } from './PrintableReport';

// 포함 항목 라벨
const SECTION_LABELS: Record<keyof IncludeSections, string> = {
  info: '분석 정보 (파일명, 크기, 엔트리 수)',
  summaryCards: '에러 요약 카드',
  timeline: '시간대별 차트',
  topErrors: 'Top 예외 목록',
  stacktrace: '주요 스택트레이스',
};

// 스택트레이스 건수 옵션
const STACKTRACE_OPTIONS: { value: StacktraceLimit; label: string }[] = [
  { value: 3, label: '상위 3건' },
  { value: 5, label: '상위 5건' },
  { value: 10, label: '상위 10건' },
  { value: 0, label: '전체 (최대 50건)' },
];

/** 파일명에서 확장자 제거 (예: "app.log" -> "app") */
function stripExtension(name: string): string {
  if (!name) return name;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return name;
  return name.slice(0, dot);
}

/** 저장 파일명에서 금지 문자 제거 (OS 저장 호환) */
function sanitizeSaveFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

export function BasicPdfTab() {
  const title = useExportStore((s) => s.title);
  const saveFileName = useExportStore((s) => s.saveFileName);
  const includeSections = useExportStore((s) => s.includeSections);
  const stacktraceLimit = useExportStore((s) => s.stacktraceLimit);
  const setTitle = useExportStore((s) => s.setTitle);
  const setSaveFileName = useExportStore((s) => s.setSaveFileName);
  const toggleSection = useExportStore((s) => s.toggleSection);
  const setStacktraceLimit = useExportStore((s) => s.setStacktraceLimit);

  const analysis = useLogStore((s) => s.analysis);
  const entries = useLogStore((s) => s.entries);
  const fileName = useLogStore((s) => s.fileName);
  const fileSize = useLogStore((s) => s.fileSize);

  // 파일 전환 시 제목 + 저장파일명 자동 세팅 (fileName 변경에만 반응)
  useEffect(() => {
    if (!fileName) return;
    const base = `${fileName} 분석 리포트`;
    setTitle(base);
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    setSaveFileName(`${base} - ${dateStr}`);
  }, [fileName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Portal 마운트 상태
  const [showPrintable, setShowPrintable] = useState(false);
  const printableRef = useRef<boolean>(false);

  // 최소 1개 이상 체크 시 버튼 활성
  const canPrint = Object.values(includeSections).some(Boolean);

  // ERROR/FATAL 엔트리 필터링 + 상위 N건 slice
  const filteredEntries = entries
    .filter((e) => e.level === 'ERROR' || e.level === 'FATAL')
    .slice(0, stacktraceLimit === 0 ? 50 : stacktraceLimit);

  // 인쇄 직전 document.title 백업 (afterprint 시 복원)
  const originalTitleRef = useRef<string>('');

  // 인쇄 완료 후 cleanup
  useEffect(() => {
    function handleAfterPrint() {
      setShowPrintable(false);
      printableRef.current = false;
      // document.title 복원 (PDF 저장 대화상자 파일명에 사용됨)
      if (originalTitleRef.current) {
        document.title = originalTitleRef.current;
      }
    }
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  async function handlePrint() {
    if (printableRef.current || !analysis) return;
    printableRef.current = true;
    setShowPrintable(true);

    // macOS: OS 저장 다이얼로그 디렉토리를 다운로드 폴더로 리셋
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('reset_save_directory');
    } catch { /* non-critical */ }

    // 브라우저/Chromium 인쇄 대화상자는 document.title 을 기본 저장 파일명으로 사용한다.
    // saveFileName 입력 값을 document.title 로 교체해 저장 파일명을 제어.
    const sanitized = sanitizeSaveFileName(saveFileName) || stripExtension(fileName ?? 'loglens-report');
    originalTitleRef.current = document.title;
    document.title = sanitized;

    // Recharts SVG 렌더링 완료 대기 후 인쇄 호출 (500ms)
    setTimeout(() => {
      window.print();
    }, 500);
  }

  return (
    <div className="space-y-5">
      {/* 리포트 제목 입력 (PDF 내부에 표시되는 제목) */}
      <div>
        <label className="block text-xs text-[var(--color-text-tertiary)] mb-1.5">
          리포트 제목 <span className="text-[var(--color-text-disabled)]">(PDF 내용에 표시)</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
        />
      </div>

      {/* 저장 파일명 입력 (.pdf 자동 추가) */}
      <div>
        <label className="block text-xs text-[var(--color-text-tertiary)] mb-1.5">
          저장 파일명 <span className="text-[var(--color-text-disabled)]">(.pdf 자동 추가)</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={saveFileName}
            onChange={(e) => setSaveFileName(e.target.value)}
            placeholder={stripExtension(fileName ?? 'loglens-report')}
            className="flex-1 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
          />
          <span className="text-xs text-[var(--color-text-disabled)]">.pdf</span>
        </div>
      </div>

      {/* 포함 항목 체크박스 리스트 */}
      <div>
        <label className="block text-xs text-[var(--color-text-tertiary)] mb-1.5">
          포함 항목
        </label>
        <div className="border border-[var(--color-border-subtle)] rounded-xl overflow-hidden">
          {(Object.keys(SECTION_LABELS) as (keyof IncludeSections)[]).map((key, i) => (
            <div key={key}>
              {i > 0 && <div className="border-t border-[var(--color-border-subtle)]" />}
              <label className="flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer hover:bg-[var(--color-bg-hover)]">
                <input
                  type="checkbox"
                  checked={includeSections[key]}
                  onChange={() => toggleSection(key)}
                  className="sr-only peer"
                />
                {/* 커스텀 체크박스 */}
                <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 peer-checked:bg-[var(--color-button-primary-bg)] peer-checked:border-[var(--color-accent-primary)] bg-[var(--color-bg-elevated)] border-[var(--color-border-default)] transition-colors">
                  {includeSections[key] && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-[var(--color-text-secondary)]">
                  {SECTION_LABELS[key]}
                </span>
              </label>

              {/* 스택트레이스 건수 드롭다운 (stacktrace 체크 시에만) */}
              {key === 'stacktrace' && includeSections.stacktrace && (
                <div className="pl-11 pr-4 pb-3">
                  <select
                    value={stacktraceLimit}
                    onChange={(e) => setStacktraceLimit(Number(e.target.value) as StacktraceLimit)}
                    className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
                  >
                    {STACKTRACE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {stacktraceLimit === 0 && (
                    <p className="text-[11px] text-[var(--color-text-disabled)] mt-1">
                      메모리 보호를 위해 상위 50건만 포함됩니다
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* PDF 생성 버튼 */}
      <button
        onClick={handlePrint}
        disabled={!canPrint}
        className={`w-full py-2.5 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors ${
          canPrint
            ? 'bg-[var(--color-button-primary-bg)] hover:bg-[var(--color-button-primary-bg-hover)] text-white'
            : 'bg-[var(--color-button-primary-bg)]/50 text-white/50 cursor-not-allowed'
        }`}
      >
        <FileDown className="w-4 h-4" />
        PDF 생성
      </button>

      {/* PrintableReport Portal (인쇄 시에만 body 직속에 마운트) */}
      {showPrintable && analysis && createPortal(
        <PrintableReport
          title={title}
          analysis={analysis}
          entries={filteredEntries}
          includeSections={includeSections}
          fileName={fileName ?? 'unknown'}
          fileSize={fileSize}
        />,
        document.body,
      )}
    </div>
  );
}
