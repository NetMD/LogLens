// 소스 코드 전송 확인 다이얼로그
// 프로젝트 루트가 설정된 상태에서 AI 리포트 생성 시,
// 전달될 소스 파일 목록을 미리 보여주고 사용자 확인을 받는다.

import { useTranslation } from 'react-i18next';
import { FileCode2, AlertTriangle } from 'lucide-react';
import type { AiProvider } from '../../types/settings';
import { isLocalProvider } from '../../types/settings';

interface Props {
  open: boolean;
  files: string[];
  loading: boolean;
  provider: AiProvider | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SourceFileConfirmDialog({
  open,
  files,
  loading,
  provider,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  if (!open) return null;

  const isLocal = isLocalProvider(provider);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-2xl mx-4 bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-2xl shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg flex-shrink-0 ${
              isLocal
                ? 'bg-[var(--color-status-success-bg)] text-[var(--color-status-success-fg)]'
                : 'bg-[var(--color-status-warn-bg)] text-[var(--color-status-warn-fg)]'
            }`}>
              <FileCode2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
                {t('pdf.sourceTransferTitle')}
              </h3>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                {t('pdf.sourceTransferDesc')}
              </p>
            </div>
          </div>
        </div>

        {/* 파일 목록 */}
        <div className="px-5 pb-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)] py-3">
              <div className="w-3.5 h-3.5 border-2 border-[var(--color-accent-primary)] border-t-transparent rounded-full animate-spin" />
              {t('pdf.loadingFileList')}
            </div>
          ) : files.length > 0 ? (
            <div className="bg-[var(--color-bg-base)] border border-[var(--color-border-default)] rounded-lg p-3 max-h-40 overflow-y-auto">
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li
                    key={i}
                    className="text-xs font-mono text-[var(--color-text-secondary)] flex items-center gap-1.5"
                  >
                    <FileCode2 className="w-3 h-3 text-[var(--color-text-disabled)] flex-shrink-0" />
                    <span className="truncate">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-tertiary)] py-2">
              {t('pdf.noSourceFiles')}
            </p>
          )}
        </div>

        {/* 전송 대상 안내 */}
        {files.length > 0 && (
          <div className="px-5 pb-3">
            {isLocal ? (
              <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2 bg-[var(--color-status-success-bg)]">
                <span className="flex-shrink-0 mt-0.5">&#x2705;</span>
                <span className="text-[var(--color-status-success-fg)] leading-relaxed">
                  {t('pdf.sourceTransferLocal')}
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2 bg-[var(--color-status-warn-bg)]">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[var(--color-status-warn-fg)] dark:text-[var(--color-status-warn-fg)]" />
                <span className="text-[var(--color-status-warn-fg)] leading-relaxed">
                  {t('pdf.sourceTransferRemote')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* 버튼 */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--color-border-default)]">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] border border-[var(--color-border-default)] rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            {t('pdf.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium bg-[var(--color-status-success-fg)] hover:bg-[var(--color-status-success-fg)] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {files.length > 0 ? t('pdf.proceed') : t('pdf.proceedWithoutSource')}
          </button>
        </div>
      </div>
    </div>
  );
}
