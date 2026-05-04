// 오픈소스 라이선스 고지 모달
// - 요약 (총 패키지 수, 라이선스 분포)
// - 주요 (직접) 의존성 카드 목록
// - "전체 라이선스 보기" 토글 → THIRD_PARTY_LICENSES.md 동봉본을 dynamic import 로 로드
//
// 5종 모달 a11y 패턴 준수: role="dialog" + aria-modal + aria-labelledby + useFocusTrap + 단순 어두운 오버레이.

import { useEffect, useId, useRef, useState } from "react";
import { X, Package, FileText } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { LoadingSpinner } from "../shared/LoadingSpinner";

interface Props {
  open: boolean;
  onClose: () => void;
}

// 직접 의존성 (Cargo.toml [dependencies], package.json dependencies)
// 의존성 변경 시 이 목록도 업데이트한다. 전체 transitive 목록은 THIRD_PARTY_LICENSES.md 참조.
interface DirectDep {
  name: string;
  description: string;
  license: string;
}

const RUST_DIRECT: DirectDep[] = [
  { name: "tauri", description: "데스크탑 앱 프레임워크", license: "Apache-2.0 OR MIT" },
  { name: "tauri-plugin-fs", description: "파일 시스템 접근", license: "Apache-2.0 OR MIT" },
  { name: "tauri-plugin-dialog", description: "OS 다이얼로그", license: "Apache-2.0 OR MIT" },
  { name: "tauri-plugin-http", description: "HTTP 클라이언트", license: "Apache-2.0 OR MIT" },
  { name: "tauri-plugin-store", description: "키-값 영속 스토어", license: "Apache-2.0 OR MIT" },
  { name: "tokio", description: "비동기 런타임", license: "MIT" },
  { name: "serde", description: "직렬화/역직렬화", license: "MIT OR Apache-2.0" },
  { name: "serde_json", description: "JSON 직렬화", license: "MIT OR Apache-2.0" },
  { name: "thiserror", description: "에러 매크로", license: "MIT OR Apache-2.0" },
  { name: "reqwest", description: "HTTP 클라이언트", license: "MIT OR Apache-2.0" },
  { name: "chrono", description: "날짜·시간 처리", license: "MIT OR Apache-2.0" },
  { name: "notify", description: "파일 변경 감시", license: "CC0-1.0 OR Artistic-2.0" },
  { name: "font-kit", description: "폰트 열거", license: "Apache-2.0 OR MIT" },
  { name: "uuid", description: "UUID 생성", license: "Apache-2.0 OR MIT" },
  { name: "async-compression", description: "gzip 스트리밍 압축 해제", license: "MIT OR Apache-2.0" },
  { name: "hostname", description: "호스트명 조회", license: "MIT OR Apache-2.0" },
  { name: "hex", description: "Hex 인코딩", license: "MIT OR Apache-2.0" },
  { name: "once_cell", description: "지연 초기화", license: "MIT OR Apache-2.0" },
];

const JS_DIRECT: DirectDep[] = [
  { name: "react", description: "UI 라이브러리", license: "MIT" },
  { name: "react-dom", description: "React DOM 렌더러", license: "MIT" },
  { name: "zustand", description: "상태 관리", license: "MIT" },
  { name: "recharts", description: "차트 라이브러리", license: "MIT" },
  { name: "lucide-react", description: "아이콘 셋", license: "ISC" },
  { name: "@tanstack/react-virtual", description: "가상 스크롤", license: "MIT" },
  { name: "@tauri-apps/api", description: "Tauri JS API", license: "Apache-2.0 OR MIT" },
  { name: "@tauri-apps/plugin-dialog", description: "Tauri 다이얼로그 플러그인", license: "Apache-2.0 OR MIT" },
  { name: "@tauri-apps/plugin-fs", description: "Tauri 파일시스템 플러그인", license: "Apache-2.0 OR MIT" },
  { name: "@tauri-apps/plugin-http", description: "Tauri HTTP 플러그인", license: "Apache-2.0 OR MIT" },
  { name: "@tauri-apps/plugin-store", description: "Tauri 스토어 플러그인", license: "Apache-2.0 OR MIT" },
  { name: "react-markdown", description: "마크다운 렌더링", license: "MIT" },
  { name: "react-syntax-highlighter", description: "코드 하이라이팅", license: "MIT" },
  { name: "docx", description: "Word 문서 생성", license: "MIT" },
  { name: "mammoth", description: "Word 문서 파싱", license: "BSD-2-Clause" },
  { name: "fflate", description: "ZIP 압축 해제", license: "MIT" },
  { name: "sonner", description: "토스트 알림", license: "MIT" },
];

interface Summary {
  totalPackages: string;
  rustCount: number;
  jsCount: number;
  distribution: { license: string; count: number }[];
}

const SUMMARY: Summary = {
  totalPackages: "약 590",
  rustCount: 573,
  jsCount: 17,
  distribution: [
    { license: "MIT", count: 280 },
    { license: "Apache-2.0", count: 95 },
    { license: "MIT OR Apache-2.0", count: 145 },
    { license: "BSD 계열", count: 35 },
    { license: "ISC", count: 18 },
    { license: "MPL-2.0", count: 8 },
    { license: "기타", count: 9 },
  ],
};

export function OpenSourceLicensesModal({ open, onClose }: Props) {
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
        setFullText("라이선스 파일을 로드하지 못했습니다.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [showFull, fullText, loading]);

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
            오픈소스 라이선스
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="라이선스 모달 닫기"
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
              ← 요약으로 돌아가기
            </button>
          ) : (
            <p className="text-xs text-[var(--color-text-tertiary)]">
              LogLens 는 위 오픈소스 프로젝트들의 기여 덕분에 만들어졌습니다.
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-md text-[var(--color-text-secondary)] border border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// --- 요약 뷰 ---

function SummaryView({ onShowFull }: { onShowFull: () => void }) {
  return (
    <div className="px-6 py-5 space-y-5">
      {/* 총 패키지 수 + 분포 */}
      <section>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          LogLens 는 <strong className="text-[var(--color-text-primary)]">{SUMMARY.totalPackages}개</strong> 의 오픈소스 패키지를 사용합니다
          (Rust crates {SUMMARY.rustCount} + npm production {SUMMARY.jsCount}).
          모두 상업적 사용을 허용하는 permissive 또는 weak copyleft 라이선스입니다.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {SUMMARY.distribution.map((d) => (
            <div
              key={d.license}
              className="flex items-baseline justify-between text-xs"
            >
              <span className="text-[var(--color-text-secondary)]">{d.license}</span>
              <span className="font-mono text-[var(--color-text-tertiary)]">{d.count}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 듀얼 라이선스 채택 */}
      <section className="rounded-lg bg-[var(--color-bg-elevated)] px-4 py-3">
        <p className="text-xs font-medium text-[var(--color-text-primary)] mb-1">
          듀얼 라이선스 채택
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
          <code className="font-mono">jszip</code> 과 <code className="font-mono">r-efi</code> 는
          MIT/GPL 또는 MIT/LGPL 듀얼 라이선스로 배포됩니다. LogLens 는 두 패키지 모두에서{" "}
          <strong className="text-[var(--color-text-secondary)]">MIT 라이선스를 선택</strong> 합니다.
        </p>
      </section>

      {/* 주요 직접 의존성 */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
          주요 직접 의존성 — Frontend
        </h3>
        <DepList deps={JS_DIRECT} />
      </section>

      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
          주요 직접 의존성 — Backend
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
          전체 라이선스 본문 보기 ({SUMMARY.totalPackages}개)
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
  if (loading || text === null) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <LoadingSpinner size="md" />
        <p className="text-xs text-[var(--color-text-tertiary)]">
          라이선스 본문 로드 중...
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
