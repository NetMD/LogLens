// Word 양식 업로드 컴포넌트 (8차 활성화)
// HTML5 drag events + input[type=file] (Tauri 네이티브 드롭 이벤트 미사용 -- File 객체 필요)
// 사용자가 .docx 파일을 드롭/클릭으로 선택하면 File.arrayBuffer()로 로드 후 onFileSelect 콜백 호출

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { Upload, FileText, X } from 'lucide-react';

interface UploadedFile {
  name: string;
  size: number;
  arrayBuffer: ArrayBuffer;
}

interface Props {
  file: UploadedFile | null;
  onFileSelect: (f: UploadedFile) => void;
  onFileRemove: () => void;
}

/** Word 파일 검증 -- 드래그+클릭 양쪽 모두 동일 함수 사용
 *  모듈 레벨 함수에서는 i18n.t() 직접 호출. (컴포넌트 외부에서도 호출되므로 useTranslation 사용 불가) */
export function validateWordFile(file: File): { valid: boolean; error?: string } {
  // .docx 확장자 검증
  if (!file.name.toLowerCase().endsWith('.docx')) {
    return { valid: false, error: i18n.t('pdf.wordOnlyDocx') };
  }
  // 10MB 크기 제한 검증
  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return { valid: false, error: i18n.t('pdf.wordSizeLimit') };
  }
  return { valid: true };
}

/** 파일 크기 포맷 (KB 단위) */
function formatSize(bytes: number): string {
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function WordUploader({ file, onFileSelect, onFileRemove }: Props) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (picked: File) => {
    const validation = validateWordFile(picked);
    if (!validation.valid) {
      setError(validation.error ?? t('pdf.wordValidationFail'));
      return;
    }
    try {
      const arrayBuffer = await picked.arrayBuffer();
      onFileSelect({ name: picked.name, size: picked.size, arrayBuffer });
      setError(null);
    } catch (e) {
      console.warn('[WordUploader] 파일 읽기 실패:', e);
      setError(t('pdf.wordReadFail'));
    }
  };

  const openFileDialog = () => {
    inputRef.current?.click();
  };

  // 드래그 이벤트 핸들러 -- HTML5 표준 drag API
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const picked = e.dataTransfer.files?.[0];
    if (picked) {
      void handleFile(picked);
    }
  };

  // 접근성: Enter/Space로 파일 선택 다이얼로그 열기
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFileDialog();
    }
  };

  return (
    <div>
      {/* 숨김 input -- 클릭 트리거용 */}
      <input
        ref={inputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) void handleFile(picked);
          // 같은 파일 재선택 허용
          e.target.value = '';
        }}
      />

      {/* 드롭 영역 */}
      <div
        role="button"
        tabIndex={0}
        aria-label={t('pdf.wordDropzoneLabel')}
        onClick={file ? undefined : openFileDialog}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] motion-safe:transition-all motion-safe:duration-200 ${
          !file ? 'cursor-pointer' : ''
        } ${
          isDragging
            ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary-subtle-bg)] scale-[1.02]'
            : error
            ? 'border-[var(--color-status-error-border)] bg-[var(--color-status-error-bg)]'
            : 'border-[var(--color-border-default)] hover:border-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-surface)]'
        }`}
      >
        {file ? (
          // 선택 완료 -- 칩 UI
          <div className="flex flex-col items-center gap-2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[var(--color-status-success-bg)] border border-[var(--color-status-success-border)] rounded-full text-xs text-[var(--color-status-success-fg)]">
              <FileText className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              <span className="truncate max-w-[200px]">{file.name}</span>
              <span className="text-[var(--color-status-success-fg)]/70">({formatSize(file.size)})</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFileRemove();
                  setError(null);
                }}
                aria-label={t('pdf.wordRemoveAria')}
                className="ml-1 p-0.5 rounded-full hover:bg-[var(--color-status-success-bg)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openFileDialog();
              }}
              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] underline"
            >
              {t('pdf.wordSelectAnother')}
            </button>
          </div>
        ) : (
          // 미선택 -- 안내 UI
          <>
            <Upload
              className={`w-8 h-8 mx-auto mb-2 ${
                isDragging ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-disabled)]'
              }`}
              aria-hidden="true"
            />
            <p className="text-sm text-[var(--color-text-secondary)]">
              {isDragging ? t('pdf.wordDropping') : t('pdf.wordDropOrClick')}
            </p>
            <p className="text-xs text-[var(--color-text-disabled)] mt-2">
              {t('pdf.wordMaxNote')}
            </p>
          </>
        )}
      </div>

      {/* 에러 메시지 */}
      {error && (
        <p className="text-xs text-[var(--color-status-error-fg)] mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
