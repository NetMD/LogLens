// 화면용 차트(Recharts) 컬러 — 다크/라이트 양쪽에서 동일하게 보여야 하므로
// CSS 변수가 아닌 hex 리터럴로 고정한다. 채도는 OKLCH 50~60% / chroma 0.13~0.16
// 범위로 낮춰 두 테마 모두에서 시각적으로 차분.
//
// 로그 레벨 컬러는 의미색이므로 hue 그대로 보존 (red 25, amber 70, blue 230).
// 비교 차트의 파일 A/B 컬러는 의미색이 아니라 단지 두 데이터셋 구분용이므로
// 브랜드 액센트(slate-violet) + 보색 계열(teal)로 통일.

/** 로그 레벨별 차트 컬러 (양 테마 공용, 채도 차분) */
export const CHART_LEVEL_COLORS = {
  ERROR: "#b94a3d",
  WARN: "#b07a2a",
  INFO: "#3a6cb8",
} as const;

/** 비교 차트의 두 데이터셋 컬러 (파일 A/B, 좌/우 등) */
export const CHART_COMPARE_COLORS = {
  A: "#5b56b8", // slate-violet (브랜드 액센트와 동일 hue 계열)
  B: "#3a8b76", // 차분한 teal
} as const;

/** 차트 보조 요소 (축 라벨, 그리드 등) — 양 테마 공용의 중간 회색 */
export const CHART_AUX_COLORS = {
  axisLabel: "#9ca3af",
  grid: "#e5e7eb",
} as const;
