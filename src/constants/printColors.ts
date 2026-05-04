// 인쇄용(@media print, PrintableReport, PrintableAiReport) 컬러.
// 흰 종이 + 검은 잉크 환경을 가정하므로 다크 모드 같은 분기는 없다.
// 화면용 토큰(--color-*)과 분리해 둔 이유: 인쇄는 채도 매우 낮은 잉크 톤이
// 가독성 + 토너 절약 + 고급스러운 인쇄 결과를 동시에 만들어내며,
// 화면 OKLCH 팔레트와 1:1 대응시킬 필요가 없다.

/** 본문/제목 텍스트 (검정에 가까운 톤, 순검정 회피) */
export const PRINT_TEXT = {
  /** 본문 핵심 (h1, 강조 본문) */
  primary: "#1a1a1a",
  /** 일반 보조 텍스트 (라벨, 메타) */
  secondary: "#374151",
  /** 약한 보조 (테이블 헤더 라벨, 푸터, 부가 정보) */
  tertiary: "#6b7280",
  /** 매우 약함 (footnote, disabled) */
  muted: "#8a8a8a",
} as const;

/** 보더/구분선 — 인쇄 시 너무 진하면 산만, 너무 옅으면 사라짐 */
export const PRINT_BORDER = {
  /** 강한 헤더 구분선 (h1 아래, 푸터 위) */
  strong: "#374151",
  /** 일반 테이블/섹션 구분선 */
  default: "#cbd0d6",
  /** 약한 행 구분선 */
  subtle: "#e5e7eb",
} as const;

/** 표면/배경 (테이블 헤더, 콜아웃 등) — 채도 낮은 옅은 톤 */
export const PRINT_SURFACE = {
  /** 테이블 헤더 배경, 코드 블록 배경 */
  muted: "#f3f4f6",
  /** 경고 콜아웃 배경 (옅은 따뜻함) */
  warnSubtle: "#fdf6ec",
} as const;

/** 로그 레벨 컬러 (의미색, hue 보존하되 채도 낮춤) */
export const PRINT_LEVEL = {
  ERROR: "#b03a30",
  WARN: "#9c5b1c",
  INFO: "#264e8a",
  DEBUG: "#6b7280",
  TRACE: "#8a8a8a",
} as const;
