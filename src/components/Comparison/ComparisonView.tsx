// 비교 메인 컴포넌트
// phase별 렌더링 분기 (select / parsing / result)
// Tauri 드래그앤드롭 이벤트 등록 + 좌표 기반 드롭존 판정
//
// Tauri 네이티브 파일 드래그는 React 의 onDragEnter/onDragOver 를 발화시키지 않기 때문에
// onDragDropEvent payload 의 position(physical px) 좌표를 devicePixelRatio 로 보정해
// 드롭존 A/B 의 getBoundingClientRect 와 비교하여 직접 판정한다.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  useComparisonStore,
  getPhase,
} from "../../store/comparisonStore";
import { useComparisonFile } from "../../hooks/useComparisonFile";
import { FileSelector } from "./FileSelector";
import { SummaryComparison } from "./SummaryComparison";
import { ExceptionComparison } from "./ExceptionComparison";
import { ChartComparison } from "./ChartComparison";
import { RotateCcw } from "lucide-react";

export function ComparisonView() {
  const { t } = useTranslation();
  const fileA = useComparisonStore((s) => s.fileA);
  const fileB = useComparisonStore((s) => s.fileB);
  const comparisonResult = useComparisonStore((s) => s.comparisonResult);
  const reset = useComparisonStore((s) => s.reset);
  const phase = useComparisonStore((s) => getPhase(s));

  const { selectFile, replaceSide } = useComparisonFile();
  const resetSide = useComparisonStore((s) => s.resetSide);
  const handleReset = reset;

  // --- 드래그앤드롭 상태 ---
  const dropzoneARef = useRef<HTMLDivElement>(null);
  const dropzoneBRef = useRef<HTMLDivElement>(null);
  const lastHoveredSideRef = useRef<"A" | "B" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTargetSide, setDragTargetSide] = useState<"A" | "B" | null>(null);

  // 좌표 → 드롭존 side 판정 (Tauri position 은 physical px)
  const decideSideFromPosition = useCallback(
    (x: number, y: number): "A" | "B" | null => {
      const dpr = window.devicePixelRatio || 1;
      const lx = x / dpr;
      const ly = y / dpr;
      const inRect = (rect: DOMRect | undefined) =>
        !!rect &&
        lx >= rect.left &&
        lx <= rect.right &&
        ly >= rect.top &&
        ly <= rect.bottom;
      if (inRect(dropzoneARef.current?.getBoundingClientRect())) return "A";
      if (inRect(dropzoneBRef.current?.getBoundingClientRect())) return "B";
      return null;
    },
    []
  );

  // Tauri 드래그앤드롭 이벤트 등록
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    getCurrentWebviewWindow()
      .onDragDropEvent((event) => {
        if (cancelled) return;
        if (event.payload.type === "over") {
          const { x, y } = event.payload.position;
          const side = decideSideFromPosition(x, y);
          setIsDragging(true);
          setDragTargetSide(side);
          if (side) lastHoveredSideRef.current = side;
        } else if (event.payload.type === "leave") {
          setIsDragging(false);
          setDragTargetSide(null);
        } else if (event.payload.type === "drop") {
          setIsDragging(false);
          setDragTargetSide(null);
          const paths = event.payload.paths;
          if (paths && paths.length > 0) {
            // drop 좌표로 최종 판정 (over 추적과 무관하게 안전)
            const { x, y } = event.payload.position;
            const side =
              decideSideFromPosition(x, y) ?? lastHoveredSideRef.current;
            if (side) selectFile(side, paths[0]);
          }
        }
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [selectFile, decideSideFromPosition]);

  // React drag hover (마우스 기반 폴백 — 브라우저 내부 드래그용)
  const handleDragHover = useCallback((side: "A" | "B") => {
    lastHoveredSideRef.current = side;
    setDragTargetSide(side);
  }, []);

  // --- 렌더링 ---
  return (
    <div className="flex-1 overflow-auto p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-base font-semibold text-[var(--color-text-primary)]">
            {t('comparison.title')}
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {t('comparison.desc')}
          </p>
        </div>
        {phase !== "select" && (
          <button
            onClick={handleReset}
            className="p-2 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
            aria-label={t('comparison.resetTooltip')}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 파일 선택 영역 (select + parsing phase) */}
      {(phase === "select" || phase === "parsing") && (
        <div className="grid grid-cols-2 gap-4">
          <div ref={dropzoneARef}>
            <FileSelector
              side="A"
              fileState={fileA}
              otherSideState={fileB}
              onFileSelect={selectFile}
              onReplace={replaceSide}
              onClear={resetSide}
              onDragHover={handleDragHover}
              isDragTarget={isDragging && dragTargetSide === "A"}
            />
          </div>
          <div ref={dropzoneBRef}>
            <FileSelector
              side="B"
              fileState={fileB}
              otherSideState={fileA}
              onFileSelect={selectFile}
              onReplace={replaceSide}
              onClear={resetSide}
              onDragHover={handleDragHover}
              isDragTarget={isDragging && dragTargetSide === "B"}
            />
          </div>
        </div>
      )}

      {/* 비교 결과 (result phase) */}
      {phase === "result" && comparisonResult && (
        <div className="space-y-6">
          {/* 파일 정보 헤더 */}
          <div className="grid grid-cols-2 gap-4">
            <div ref={dropzoneARef}>
              <FileSelector
                side="A"
                fileState={fileA}
                otherSideState={fileB}
                onFileSelect={selectFile}
                onReplace={replaceSide}
                onClear={resetSide}
                onDragHover={handleDragHover}
                isDragTarget={false}
              />
            </div>
            <div ref={dropzoneBRef}>
              <FileSelector
                side="B"
                fileState={fileB}
                otherSideState={fileA}
                onFileSelect={selectFile}
                onReplace={replaceSide}
                onClear={resetSide}
                onDragHover={handleDragHover}
                isDragTarget={false}
              />
            </div>
          </div>

          {/* 요약 비교 */}
          <SummaryComparison
            levelDeltas={comparisonResult.levelDeltas}
            errorRateA={comparisonResult.errorRateA}
            errorRateB={comparisonResult.errorRateB}
          />

          {/* 예외 비교 */}
          <ExceptionComparison
            exceptionDeltas={comparisonResult.exceptionDeltas}
          />

          {/* 시간대별 차트 */}
          <ChartComparison
            timelineA={fileA.analysis!.timeline}
            timelineB={fileB.analysis!.timeline}
            fileNameA={fileA.fileName ?? t('comparison.fileA')}
            fileNameB={fileB.fileName ?? t('comparison.fileB')}
          />
        </div>
      )}
    </div>
  );
}
