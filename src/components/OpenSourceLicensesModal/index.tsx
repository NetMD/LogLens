// 오픈소스 라이선스 고지 모달
// - 요약 (총 패키지 수, 라이선스 분포)
// - 주요 (직접) 의존성 카드 목록
// - "전체 라이선스 보기" 토글 → THIRD_PARTY_LICENSES.md 동봉본을 dynamic import 로 로드
//
// 5종 모달 a11y 패턴 준수: role="dialog" + aria-modal + aria-labelledby + useFocusTrap + 단순 어두운 오버레이.
//
// R12 i18n: licenses.* 네임스페이스 사용. 패키지 description 35건은 영문 통일 (의존성 메타데이터 영역).

import { useEffect, useId, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { X, Package, FileText } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { LoadingSpinner } from "../shared/LoadingSpinner";

interface Props {
  open: boolean;
  onClose: () => void;
}

// 직접 의존성 (Cargo.toml [dependencies], package.json dependencies)
// 의존성 변경 시 이 목록도 업데이트한다. 전체 transitive 목록은 THIRD_PARTY_LICENSES.md 참조.
// description 은 패키지 메타데이터 영역이므로 ko/en 모두 영문 통일 (UX 결정 — R12).
interface DirectDep {
  name: string;
  description: string;
  license: string;
}

const RUST_DIRECT: DirectDep[] = [
  { name: "tauri", description: "Desktop app framework", license: "Apache-2.0 OR MIT" },
  { name: "tauri-plugin-fs", description: "File system access", license: "Apache-2.0 OR MIT" },
  { name: "tauri-plugin-dialog", description: "OS dialogs", license: "Apache-2.0 OR MIT" },
  { name: "tauri-plugin-http", description: "HTTP client", license: "Apache-2.0 OR MIT" },
  { name: "tauri-plugin-store", description: "Key-value persistent store", license: "Apache-2.0 OR MIT" },
  { name: "tokio", description: "Async runtime", license: "MIT" },
  { name: "serde", description: "Serialization / deserialization", license: "MIT OR Apache-2.0" },
  { name: "serde_json", description: "JSON serialization", license: "MIT OR Apache-2.0" },
  { name: "thiserror", description: "Error macros", license: "MIT OR Apache-2.0" },
  { name: "reqwest", description: "HTTP client", license: "MIT OR Apache-2.0" },
  { name: "chrono", description: "Date / time handling", license: "MIT OR Apache-2.0" },
  { name: "notify", description: "File change watcher", license: "CC0-1.0 OR Artistic-2.0" },
  { name: "font-kit", description: "Font enumeration", license: "Apache-2.0 OR MIT" },
  { name: "uuid", description: "UUID generation", license: "Apache-2.0 OR MIT" },
  { name: "async-compression", description: "Streaming gzip decompression", license: "MIT OR Apache-2.0" },
  { name: "hostname", description: "Host name lookup", license: "MIT OR Apache-2.0" },
  { name: "hex", description: "Hex encoding", license: "MIT OR Apache-2.0" },
  { name: "once_cell", description: "Lazy initialization", license: "MIT OR Apache-2.0" },
];

const JS_DIRECT: DirectDep[] = [
  { name: "react", description: "UI library", license: "MIT" },
  { name: "react-dom", description: "React DOM renderer", license: "MIT" },
  { name: "zustand", description: "State management", license: "MIT" },
  { name: "recharts", description: "Chart library", license: "MIT" },
  { name: "lucide-react", description: "Icon set", license: "ISC" },
  { name: "@tanstack/react-virtual", description: "Virtual scroll", license: "MIT" },
  { name: "@tauri-apps/api", description: "Tauri JS API", license: "Apache-2.0 OR MIT" },
  { name: "@tauri-apps/plugin-dialog", description: "Tauri dialog plugin", license: "Apache-2.0 OR MIT" },
  { name: "@tauri-apps/plugin-fs", description: "Tauri filesystem plugin", license: "Apache-2.0 OR MIT" },
  { name: "@tauri-apps/plugin-http", description: "Tauri HTTP plugin", license: "Apache-2.0 OR MIT" },
  { name: "@tauri-apps/plugin-store", description: "Tauri store plugin", license: "Apache-2.0 OR MIT" },
  { name: "react-markdown", description: "Markdown rendering", license: "MIT" },
  { name: "react-syntax-highlighter", description: "Code syntax highlighting", license: "MIT" },
  { name: "docx", description: "Word document generation", license: "MIT" },
  { name: "mammoth", description: "Word document parsing", license: "BSD-2-Clause" },
  { name: "fflate", description: "ZIP decompression", license: "MIT" },
  { name: "sonner", description: "Toast notifications", license: "MIT" },
];

// 분포 라벨은 licenses.dist* 키로 분기. 라벨 키만 저장하고 렌더 시 t() 해석.
interface DistributionItem {
  labelKey: string;
  count: number;
}

interface Summary {
  totalPackages: string;
  rustCount: number;
  jsCount: number;
  distribution: DistributionItem[];
}

const SUMMARY: Summary = {
  totalPackages: "590",
  rustCount: 573,
  jsCount: 17,
  distribution: [
    { labelKey: "licenses.distMit", count: 280 },
    { labelKey: "licenses.distApache", count: 95 },
    { labelKey: "licenses.distMitOrApache", count: 145 },
    { labelKey: "licenses.distBsd", count: 35 },
    { labelKey: "licenses.distIsc", count: 18 },
    { labelKey: "licenses.distMpl", count: 8 },
    { labelKey: "licenses.distOther", count: 9 },
  ],
};

export function OpenSourceLicensesModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  // 전체 보기 모드 + 마크다운 lazy 로드
  const [showFull, setShowFull] = useState(false);
  const [fullText, setFullText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useFocusTrap(containerRef, {
    enabled: open,
    onEscape: onClose,
  });

  // 전체 보기 진입 시 동봉된 NOTICE 를 dynamic import 로 로드 (별도 chunk 분리)
  useEffect(() => {
    if (!showFull || fullText !== null || loading) return;
    setLoading(true);
    import("../../data/THIRD_PARTY_LICENSES.md?raw")
      .then((mod) => {
        setFullText(mod.default);
      })
      .catch(() => {
        setFullText(t('licenses.loadFailed'));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [showFull, fullText, loading, t]);

  // 모달 닫힐 때 전체 보기 상태 초기화
  useEffect(() => {
    if (!open) {
      setShowFull(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-[640px] max-w-full mx-4 max-h-[80vh] bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-xl shadow-2xl flex flex-col"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-default)] shrink-0">
          <h2
            id={titleId}
            className="text-base font-semibold text-[var(--color-text-primary)] flex items-center gap-2"
          >
            <Package className="w-4 h-4 text-[var(--color-accent-primary)]" />
            {t('licenses.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('licenses.closeAria')}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none rounded-lg p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto">
          {!showFull ? (
            <SummaryView onShowFull={() => setShowFull(true)} />
          ) : (
            <FullView text={fullText} loading={loading} />
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-[var(--color-border-default)] shrink-0">
          {showFull ? (
            <button
              type="button"
              onClick={() => setShowFull(false)}
              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            >
              {t('licenses.backToSummary')}
            </button>
          ) : (
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {t('licenses.footerThanks')}
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-md text-[var(--color-text-secondary)] border border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
          >
            {t('licenses.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- 요약 뷰 ---

function SummaryView({ onShowFull }: { onShowFull: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="px-6 py-5 space-y-5">
      {/* 총 패키지 수 + 분포 */}
      <section>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          <Trans
            i18nKey="licenses.summaryIntro"
            values={{ total: SUMMARY.totalPackages, rust: SUMMARY.rustCount, js: SUMMARY.jsCount }}
            components={{ strong: <strong className="text-[var(--color-text-primary)]" /> }}
          />
        </p>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {SUMMARY.distribution.map((d) => (
            <div
              key={d.labelKey}
              className="flex items-baseline justify-between text-xs"
            >
              <span className="text-[var(--color-text-secondary)]">{t(d.labelKey)}</span>
              <span className="font-mono text-[var(--color-text-tertiary)]">{d.count}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 듀얼 라이선스 채택 */}
      <section className="rounded-lg bg-[var(--color-bg-elevated)] px-4 py-3">
        <p className="text-xs font-medium text-[var(--color-text-primary)] mb-1">
          {t('licenses.dualLicenseTitle')}
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
          <Trans
            i18nKey="licenses.dualLicenseDesc"
            components={{
              code: <code className="font-mono" />,
              strong: <strong className="text-[var(--color-text-secondary)]" />,
            }}
          />
        </p>
      </section>

      {/* 주요 직접 의존성 */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
          {t('licenses.directDepsFrontend')}
        </h3>
        <DepList deps={JS_DIRECT} />
      </section>

      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
          {t('licenses.directDepsBackend')}
        </h3>
        <DepList deps={RUST_DIRECT} />
      </section>

      {/* 전체 보기 진입 */}
      <section>
        <button
          type="button"
          onClick={onShowFull}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-[var(--color-accent-primary-subtle-bg)] text-[var(--color-accent-primary)] rounded-lg hover:bg-[var(--color-accent-primary-subtle-bg)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none transition-colors"
        >
          <FileText className="w-4 h-4" />
          {t('licenses.viewFull', { total: SUMMARY.totalPackages })}
        </button>
      </section>
    </div>
  );
}

function DepList({ deps }: { deps: DirectDep[] }) {
  return (
    <ul className="space-y-1">
      {deps.map((dep) => (
        <li
          key={dep.name}
          className="flex items-baseline gap-2 px-2 py-1.5 rounded text-xs"
        >
          <span className="font-mono text-[var(--color-text-primary)] flex-shrink-0">
            {dep.name}
          </span>
          <span className="text-[var(--color-text-tertiary)] flex-1 truncate">
            {dep.description}
          </span>
          <span className="text-[var(--color-text-tertiary)] font-mono text-[10px]">
            {dep.license}
          </span>
        </li>
      ))}
    </ul>
  );
}

// --- 전체 보기 ---

function FullView({ text, loading }: { text: string | null; loading: boolean }) {
  const { t } = useTranslation();
  if (loading || text === null) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <LoadingSpinner size="md" />
        <p className="text-xs text-[var(--color-text-tertiary)]">
          {t('licenses.fullViewLoading')}
        </p>
      </div>
    );
  }
  // 949KB 마크다운을 plain text 로 표시 (react-markdown 으로 파싱 시 메인 스레드 블록 우려).
  // 마크다운 자체가 plain text 로도 충분히 가독성이 있음 (#, ```).
  return (
    <pre className="px-6 py-4 text-[11px] font-mono text-[var(--color-text-secondary)] whitespace-pre-wrap break-words leading-relaxed">
      {text}
    </pre>
  );
}
