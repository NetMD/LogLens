// ExportView -- PDF/문서 내보내기 2탭 컨테이너
// Props: 없음 (store 직접 구독)

import { useEffect, useRef, useState } from 'react';
import { FileSearch, AlertCircle } from 'lucide-react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useExportStore } from '../../store/exportStore';
import { useLogStore } from '../../store/logStore';
import { useLogFile } from '../../hooks/useLogFile';
import { BasicPdfTab } from './BasicPdfTab';
import { AiReportTab } from './AiReportTab';
import { ProgressBar } from '../LogDropZone/ProgressBar';

// 탭 정의
const TABS = [
  { key: 'basic' as const, label: '기본 PDF' },
  { key: 'ai' as const, label: 'AI 리포트' },
];

/** ExportView 내부 전용 드롭존 -- loadFile 시 activeToolTab='export' 유지 */
function ExportDropZone() {
  const { loadFile } = useLogFile();
  const setIsFromHistory = useExportStore((s) => s.setIsFromHistory);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    try {
      getCurrentWebviewWindow()
        .onDragDropEvent((event) => {
          if (cancelled) return;
          if (event.payload.type === 'over') {
            setIsDragging(true);
          } else if (event.payload.type === 'leave') {
            setIsDragging(false);
          } else if (event.payload.type === 'drop') {
            setIsDragging(false);
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              setError(null);
              setIsFromHistory(false);
              loadFile(paths[0], { preserveProTab: true }).catch((e) =>
                setError(String(e)),
              );
            }
          }
        })
        .then((unlisten) => {
          if (cancelled) {
            unlisten();
          } else {
            unlistenRef.current = unlisten;
          }
        })
        .catch(() => {
          // Tauri 환경이 아닌 경우 무시
        });
    } catch {
      // 무시
    }

    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
  }, [loadFile]);

  const handleOpen = async () => {
    setError(null);
    setIsFromHistory(false);
    try {
      await loadFile(undefined, { preserveProTab: true });
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="mt-8">
      <div
        role="button"
        tabIndex={0}
        aria-label="분석할 로그 파일 선택"
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void handleOpen();
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        className={`w-full border-2 border-dashed rounded-xl p-10 text-center motion-safe:transition-all motion-safe:duration-200 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] ${
          isDragging
            ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary-subtle-bg)] scale-[1.01]'
            : 'border-[var(--color-border-default)] hover:border-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-surface)]'
        }`}
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center motion-safe:transition-colors ${
              isDragging ? 'bg-[var(--color-accent-primary-subtle-bg)]' : 'bg-[var(--color-bg-elevated)]'
            }`}
          >
            <FileSearch
              className={`w-7 h-7 ${
                isDragging ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-tertiary)]'
              }`}
              aria-hidden="true"
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              {isDragging ? '파일을 놓으세요' : '분석할 로그 파일을 드래그하거나 클릭하세요'}
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Spring Boot / MVC 로그 파일 (.log, .txt, .csv) — 최대 500MB
            </p>
          </div>
          {!isDragging && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleOpen();
              }}
              className="mt-1 px-4 py-1.5 rounded-md text-sm font-medium border bg-[var(--color-button-primary-bg)] hover:bg-[var(--color-button-primary-bg)] border-[var(--color-accent-primary)] text-white motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
            >
              파일 선택
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 bg-[var(--color-status-error-bg)] border border-[var(--color-status-error-border)] text-[var(--color-status-error-fg)] text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}
    </div>
  );
}

export function ExportView() {
  const activeTab = useExportStore((s) => s.activeTab);
  const setActiveTab = useExportStore((s) => s.setActiveTab);
  const title = useExportStore((s) => s.title);
  const setTitle = useExportStore((s) => s.setTitle);
  const isFromHistory = useExportStore((s) => s.isFromHistory);
  const analysis = useLogStore((s) => s.analysis);
  const fileName = useLogStore((s) => s.fileName);
  const isParsing = useLogStore((s) => s.isParsing);
  const progress = useLogStore((s) => s.progress);

  // 컴포넌트 마운트 시 title이 빈 문자열이면 기본값 설정
  useEffect(() => {
    if (title === '' && fileName) {
      const today = new Date().toISOString().slice(0, 10);
      setTitle(`${fileName} 분석 리포트 - ${today}`);
    }
  }, [title, fileName, setTitle]);

  // 파싱 중: 진행 표시
  if (isParsing) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <h1 className="text-base font-semibold text-[var(--color-text-primary)]">
          PDF 내보내기
        </h1>
        <div className="mt-10 flex items-center justify-center">
          <ProgressBar progress={progress} fileName={fileName ?? ''} />
        </div>
      </div>
    );
  }

  // analysis === null: 빈 상태 -- 드롭존 + 파일 선택 버튼
  if (!analysis) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <h1 className="text-base font-semibold text-[var(--color-text-primary)]">
          PDF 내보내기
        </h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
          로그 파일을 선택하면 분석 후 내보내기 화면으로 이동합니다.
        </p>
        <div className="max-w-xl mx-auto">
          <ExportDropZone />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* 페이지 제목 */}
      <h1 className="text-base font-semibold text-[var(--color-text-primary)]">
        PDF 내보내기
      </h1>
      <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
        분석 결과를 PDF 리포트로 내보내거나 AI 기반 보고서를 생성합니다
      </p>

      {/* 히스토리 fallback 알림: 원본 파일이 없어 저장된 요약 데이터만 사용 */}
      {isFromHistory && (
        <div className="mt-4 flex items-start gap-2 bg-[var(--color-status-warn-bg)] border border-[var(--color-status-warn-border)] text-[var(--color-status-warn-fg)] text-xs rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>원본 파일을 찾을 수 없어 저장된 요약 데이터로 생성합니다. 스택트레이스는 포함되지 않습니다.</span>
        </div>
      )}

      {/* 탭 바 */}
      <div className="flex border-b border-[var(--color-border-default)] mt-4" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 text-sm border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="mt-5" role="tabpanel">
        {activeTab === 'basic' ? <BasicPdfTab /> : <AiReportTab />}
      </div>
    </div>
  );
}
