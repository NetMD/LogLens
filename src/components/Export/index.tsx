// ExportView -- PDF/문서 내보내기 2탭 컨테이너
// Props: 없음 (store 직접 구독)

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSearch, AlertCircle } from 'lucide-react';
import { useExportStore, useActiveExportField } from '../../store/exportStore';
import {
  useActiveFileAnalysis,
  useActiveFileName,
  useActiveFileIsParsing,
  useActiveFileProgress,
  useActiveFileId,
} from '../../store/activeFileSelectors';
import { useLogFile } from '../../hooks/useLogFile';
import { BasicPdfTab } from './BasicPdfTab';
import { AiReportTab } from './AiReportTab';
import { ProgressBar } from '../LogDropZone/ProgressBar';

// 탭 정의 (i18n 라벨은 컴포넌트 안에서 t() 로 해석)
const TAB_KEYS = ['basic', 'ai'] as const;

/** ExportView 내부 전용 드롭존 -- loadFile 시 activeToolTab='export' 유지 */
function ExportDropZone() {
  const { t } = useTranslation();
  const { loadFileAsTab } = useLogFile();
  const setIsFromHistory = useExportStore((s) => s.setIsFromHistory);
  // R13: 전역 드롭 리스너는 App(useGlobalFileDrop) 1곳에만 등록.
  // ExportDropZone 은 클릭/버튼으로 파일 선택만 담당 (드롭은 새 탭 추가로 흡수, G-6).
  const isDragging = false;
  const [error, setError] = useState<string | null>(null);

  const handleOpen = async () => {
    setError(null);
    setIsFromHistory(false);
    try {
      await loadFileAsTab();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="mt-8">
      <div
        role="button"
        tabIndex={0}
        aria-label={t('pdf.ariaLabelDropzone')}
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
              {isDragging ? t('pdf.dropzoneDrop') : t('pdf.dropzoneLabel')}
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {t('pdf.dropzoneDesc')}
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
              {t('pdf.selectFile')}
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
  const { t } = useTranslation();
  const activeTab = useActiveExportField('activeTab');
  const setActiveTab = useExportStore((s) => s.setActiveTab);
  const title = useActiveExportField('title');
  const setTitle = useExportStore((s) => s.setTitle);
  const isFromHistory = useActiveExportField('isFromHistory');
  const analysis = useActiveFileAnalysis();
  const fileName = useActiveFileName();
  const isParsing = useActiveFileIsParsing();
  const progress = useActiveFileProgress();
  const activeFileId = useActiveFileId();

  // ExportView 진입/탭 전환 시 currentFileId 를 활성 탭으로 동기화 + ExportState 보장
  useEffect(() => {
    if (activeFileId) {
      useExportStore.getState().ensureFileState(activeFileId);
      useExportStore.getState().setCurrentFileId(activeFileId);
    }
  }, [activeFileId]);

  // 컴포넌트 마운트 시 title이 빈 문자열이면 기본값 설정
  useEffect(() => {
    if (title === '' && fileName) {
      const today = new Date().toISOString().slice(0, 10);
      // 파일명 + 날짜만으로 기본 제목 구성 (분석 리포트 라벨은 t() 로 노출 위치에서 처리)
      setTitle(`${fileName} - ${today}`);
    }
  }, [title, fileName, setTitle]);

  // 파싱 중: 진행 표시
  if (isParsing) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <h1 className="text-base font-semibold text-[var(--color-text-primary)]">
          {t('pdf.headerTitle')}
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
          {t('pdf.headerTitle')}
        </h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
          {t('pdf.introWhenEmpty')}
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
        {t('pdf.headerTitle')}
      </h1>
      <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
        {t('pdf.headerDesc')}
      </p>

      {/* 히스토리 fallback 알림: 원본 파일이 없어 저장된 요약 데이터만 사용 */}
      {isFromHistory && (
        <div className="mt-4 flex items-start gap-2 bg-[var(--color-status-warn-bg)] border border-[var(--color-status-warn-border)] text-[var(--color-status-warn-fg)] text-xs rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{t('pdf.historyFallbackWarning')}</span>
        </div>
      )}

      {/* 탭 바 */}
      <div className="flex border-b border-[var(--color-border-default)] mt-4" role="tablist">
        {TAB_KEYS.map((tabKey) => (
          <button
            key={tabKey}
            role="tab"
            aria-selected={activeTab === tabKey}
            onClick={() => setActiveTab(tabKey)}
            className={`px-5 py-3 text-sm border-b-2 transition-colors ${
              activeTab === tabKey
                ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            {tabKey === 'basic' ? t('pdf.tabBasic') : t('pdf.tabAi')}
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
