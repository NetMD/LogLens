// 인쇄 전용 숨김 div -- @media print 시에만 표시
// store 직접 참조 없는 순수 렌더링 컴포넌트

import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';
import { PRINT_BORDER, PRINT_LEVEL, PRINT_SURFACE, PRINT_TEXT } from '../../constants/printColors';
import type { AnalysisResult, TimelinePoint } from '../../utils/errorAnalyzer';
import type { LogEntry, StackFrame } from '../../utils/logParser';
import type { IncludeSections } from '../../store/exportStore';
import { type ReactNode } from 'react';

interface Props {
  title: string;
  analysis: AnalysisResult;
  entries: LogEntry[];       // 이미 ERROR/FATAL 필터링 + 상위 N건 slice 완료
  includeSections: IncludeSections;
  fileName: string;
  fileSize: number;
}

// 시간 포맷 (TimelineChart에서 재사용)
function formatHour(hour: string): string {
  try {
    const parts = hour.split(' ');
    const dateParts = parts[0].split('-');
    const timePart = parts[1]?.slice(0, 2) ?? '00';
    return `${dateParts[1]}/${dateParts[2]} ${timePart}시`;
  } catch {
    return hour;
  }
}

/** 축약 날짜 포맷: "2024-03-15 09:15:42.334" -> "03-15 09:15:42" */
function formatShortDate(ts: string): string {
  if (!ts) return ts;
  // "YYYY-MM-DD HH:mm:ss.SSS" -> "MM-DD HH:mm:ss"
  const match = ts.match(/^\d{4}-(\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  if (match) return `${match[1]} ${match[2]}`;
  return ts;
}

/** 로그 레벨별 색상 (인쇄 친화 팔레트, 채도 낮춰 차분) — printColors 토큰 사용 */
function levelColor(level: string): string {
  switch (level) {
    case 'ERROR':
    case 'FATAL':
      return PRINT_LEVEL.ERROR;
    case 'WARN':
      return PRINT_LEVEL.WARN;
    case 'INFO':
      return PRINT_LEVEL.INFO;
    default:
      return PRINT_TEXT.tertiary;
  }
}

/**
 * 패키지 경로와 심플 클래스명 분리
 * "org.springframework.dao.DataIntegrityViolationException"
 *   -> { pkg: "org.springframework.dao.", simple: "DataIntegrityViolationException" }
 * 점(.)이 없으면 pkg="" 로 반환.
 */
/**
 * 스택프레임을 "사용자 코드만 표시 + 프레임워크 프레임은 요약" 형태로 렌더링.
 * - 사용자 코드 프레임: 풀 표시 (볼드)
 * - 연속된 프레임워크 프레임: "... N framework frames" 한 줄로 축약
 */
function summarizeStackFrames(frames: StackFrame[]): ReactNode {
  const elements: ReactNode[] = [];
  let frameworkCount = 0;

  function flushFramework() {
    if (frameworkCount > 0) {
      elements.push(
        <div
          key={`fw-${elements.length}`}
          style={{
            fontSize: '11px',
            paddingLeft: '16px',
            color: PRINT_TEXT.muted,
            fontStyle: 'italic',
            whiteSpace: 'pre-wrap',
          }}
        >
          ... {frameworkCount} framework frame{frameworkCount > 1 ? 's' : ''}
        </div>,
      );
      frameworkCount = 0;
    }
  }

  for (const frame of frames) {
    if (!frame.isUserCode) {
      frameworkCount++;
      continue;
    }
    flushFramework();
    const cls = splitClassName(frame.className);
    elements.push(
      <div
        key={`uf-${elements.length}`}
        style={{
          fontSize: '11px',
          paddingLeft: '16px',
          color: PRINT_TEXT.primary,
          fontWeight: 700,
          wordBreak: 'normal',
          overflowWrap: 'anywhere',
          whiteSpace: 'pre-wrap',
        }}
      >
        at <span style={{ color: PRINT_TEXT.tertiary, fontWeight: 400 }}>{cls.pkg}</span>
        <span style={{ color: PRINT_TEXT.primary, fontWeight: 700 }}>{cls.simple}</span>
        .{frame.methodName}({frame.fileName}:{frame.lineNumber})
      </div>,
    );
  }
  flushFramework();
  return <>{elements}</>;
}

function splitClassName(fqn: string): { pkg: string; simple: string } {
  const dot = fqn.lastIndexOf('.');
  if (dot < 0) return { pkg: '', simple: fqn };
  return { pkg: fqn.slice(0, dot + 1), simple: fqn.slice(dot + 1) };
}

// 파일 크기 포맷: KB 또는 MB, .0이면 소수점 제거
function formatSize(bytes: number): string {
  const kb = bytes / 1024;
  if (kb < 1024) {
    const s = kb.toFixed(1);
    return `${s.endsWith('.0') ? Math.round(kb) : s} KB`;
  }
  const mb = kb / 1024;
  const s = mb.toFixed(1);
  return `${s.endsWith('.0') ? Math.round(mb) : s} MB`;
}

// 에러 요약 카드 데이터
const LEVEL_LABELS: Record<string, string> = {
  ERROR: '에러',
  WARN: '경고',
  INFO: '정보',
  DEBUG: '디버그',
};

export function PrintableReport({
  title,
  analysis,
  entries,
  includeSections,
  fileName,
  fileSize,
}: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const chartData = analysis.timeline.map((d: TimelinePoint) => ({
    ...d,
    hour: formatHour(d.hour),
  }));

  return (
    <div className="printable-report-wrapper">
      <div className="printable-report">
        {/* 헤더 */}
        <div style={{ borderBottom: `2px solid ${PRINT_BORDER.strong}`, paddingBottom: '12px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '12px', color: PRINT_TEXT.tertiary, fontWeight: 600 }}>LogLens</span>
            <span style={{ fontSize: '10px', color: PRINT_TEXT.tertiary }}>생성일: {today}</span>
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px', color: PRINT_TEXT.primary }}>
            {title}
          </h1>
        </div>

        {/* 분석 정보 섹션 */}
        {includeSections.info && (
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: PRINT_TEXT.secondary, borderBottom: `1px solid ${PRINT_BORDER.subtle}`, paddingBottom: '4px', marginBottom: '8px' }}>
              분석 정보
            </h2>
            <table style={{ fontSize: '12px', borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '4px 12px 4px 0', color: PRINT_TEXT.tertiary, width: '100px' }}>파일명</td>
                  <td style={{ padding: '4px 0', color: PRINT_TEXT.primary }}>{fileName}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 12px 4px 0', color: PRINT_TEXT.tertiary }}>크기</td>
                  <td style={{ padding: '4px 0', color: PRINT_TEXT.primary }}>{formatSize(fileSize)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 12px 4px 0', color: PRINT_TEXT.tertiary }}>로그 엔트리</td>
                  <td style={{ padding: '4px 0', color: PRINT_TEXT.primary }}>{analysis.totalEntries.toLocaleString()}건</td>
                </tr>
                {analysis.parseFailCount > 0 && (
                  <tr>
                    <td style={{ padding: '4px 12px 4px 0', color: PRINT_TEXT.tertiary }}>파싱 실패</td>
                    <td style={{ padding: '4px 0', color: PRINT_LEVEL.ERROR }}>{analysis.parseFailCount}건</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 에러 요약 카드 섹션 -- 인쇄용 테이블 형태 */}
        {includeSections.summaryCards && (
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: PRINT_TEXT.secondary, borderBottom: `1px solid ${PRINT_BORDER.subtle}`, paddingBottom: '4px', marginBottom: '8px' }}>
              에러 요약
            </h2>
            <table style={{ fontSize: '12px', borderCollapse: 'collapse', width: '98%', marginLeft: '1%', tableLayout: 'fixed', border: `1px solid ${PRINT_BORDER.default}` }}>
              <thead>
                <tr>
                  <th style={{ border: `1px solid ${PRINT_BORDER.default}`, textAlign: 'center', background: PRINT_SURFACE.muted, color: PRINT_TEXT.secondary }}>
                    전체
                  </th>
                  {['ERROR', 'WARN', 'INFO', 'DEBUG'].map((level) => (
                    <th
                      key={level}
                      style={{ border: `1px solid ${PRINT_BORDER.default}`, textAlign: 'center', background: PRINT_SURFACE.muted, color: PRINT_TEXT.secondary }}
                    >
                      {LEVEL_LABELS[level] ?? level}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ border: `1px solid ${PRINT_BORDER.default}`, textAlign: 'center', fontWeight: 600 }}>
                    {analysis.totalEntries.toLocaleString()}
                  </td>
                  {['ERROR', 'WARN', 'INFO', 'DEBUG'].map((level) => (
                    <td
                      key={level}
                      style={{
                        border: `1px solid ${PRINT_BORDER.default}`,
                        padding: '6px 12px',
                        textAlign: 'center',
                        fontWeight: 600,
                        color: level === 'ERROR' ? PRINT_LEVEL.ERROR : level === 'WARN' ? PRINT_LEVEL.WARN : PRINT_TEXT.primary,
                      }}
                    >
                      {(analysis.levelCounts[level as keyof typeof analysis.levelCounts] ?? 0).toLocaleString()}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* 시간대별 차트 섹션 -- 고정 크기 BarChart (ResponsiveContainer 미사용) */}
        {includeSections.timeline && chartData.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: PRINT_TEXT.secondary, borderBottom: `1px solid ${PRINT_BORDER.subtle}`, paddingBottom: '4px', marginBottom: '8px' }}>
              시간대별 추이
            </h2>
            <div className="chart-container">
              <BarChart width={620} height={220} data={chartData} barSize={12} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke={PRINT_BORDER.subtle} vertical={false} />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 10, fill: PRINT_TEXT.tertiary }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: PRINT_TEXT.tertiary }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                {/* Legend: Recharts <Legend> 대신 차트 아래 별도 div 로 표시 (인쇄 시 겹침 방지) */}
                <Bar dataKey="ERROR" name="ERROR" stackId="a" fill={PRINT_LEVEL.ERROR} radius={[0, 0, 0, 0]} />
                <Bar dataKey="WARN" name="WARN" stackId="a" fill={PRINT_LEVEL.WARN} radius={[0, 0, 0, 0]} />
                <Bar dataKey="INFO" name="INFO" stackId="a" fill={PRINT_LEVEL.INFO} radius={[2, 2, 0, 0]} />
              </BarChart>
              {/* 차트 아래 커스텀 범례 */}
              <div
                style={{
                  display: 'flex',
                  gap: '16px',
                  marginTop: '8px',
                  justifyContent: 'center',
                  fontSize: '12px',
                  color: PRINT_TEXT.secondary,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: PRINT_LEVEL.ERROR }}>●</span> ERROR
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: PRINT_LEVEL.WARN }}>●</span> WARN
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: PRINT_LEVEL.INFO }}>●</span> INFO
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Top 예외 목록 섹션 */}
        {includeSections.topErrors && analysis.topErrors.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: PRINT_TEXT.secondary, borderBottom: `1px solid ${PRINT_BORDER.subtle}`, paddingBottom: '4px', marginBottom: '8px' }}>
              Top 예외 목록
            </h2>
            <table
              className="top-errors-table"
              style={{
                fontSize: '12px',
                borderCollapse: 'collapse',
                width: '100%',
                tableLayout: 'fixed',
              }}
            >
              <colgroup>
                <col style={{ width: '30px' }} />
                <col />
                <col style={{ width: '50px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '130px' }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: `1px solid ${PRINT_BORDER.subtle}` }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', color: PRINT_TEXT.tertiary }}>#</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', color: PRINT_TEXT.tertiary }}>예외 클래스</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', color: PRINT_TEXT.tertiary, whiteSpace: 'nowrap' }}>건수</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', color: PRINT_TEXT.tertiary, whiteSpace: 'nowrap' }}>최초</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', color: PRINT_TEXT.tertiary, whiteSpace: 'nowrap' }}>최종</th>
                </tr>
              </thead>
              <tbody>
                {analysis.topErrors.map((err, i) => {
                  const { pkg, simple } = splitClassName(err.exceptionClass);
                  return (
                  <tr key={err.exceptionClass} style={{ borderBottom: `1px solid ${PRINT_BORDER.subtle}` }}>
                    <td style={{ padding: '6px 8px', color: PRINT_TEXT.tertiary }}>{i + 1}</td>
                    <td
                      style={{
                        padding: '6px 8px',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        wordBreak: 'normal',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      <span style={{ color: PRINT_TEXT.tertiary }}>{pkg}</span>
                      <span style={{ color: PRINT_TEXT.primary, fontWeight: 700 }}>{simple}</span>
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {err.count.toLocaleString()}
                    </td>
                    <td style={{ padding: '6px 8px', color: PRINT_TEXT.tertiary, fontSize: '11px', whiteSpace: 'nowrap' }}>
                      {formatShortDate(err.firstOccurrence)}
                    </td>
                    <td style={{ padding: '6px 8px', color: PRINT_TEXT.tertiary, fontSize: '11px', whiteSpace: 'nowrap' }}>
                      {formatShortDate(err.lastOccurrence)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 주요 스택트레이스 섹션 */}
        {includeSections.stacktrace && entries.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: PRINT_TEXT.secondary, borderBottom: `1px solid ${PRINT_BORDER.subtle}`, paddingBottom: '4px', marginBottom: '8px' }}>
              주요 스택트레이스
            </h2>
            {/* 최대 50건 상한 */}
            {entries.slice(0, 50).map((entry) => {
              const exc = entry.exceptionClass
                ? splitClassName(entry.exceptionClass)
                : null;
              return (
              <div
                key={entry.id}
                className="stacktrace-block"
                style={{
                  marginBottom: '16px',
                  pageBreakInside: 'avoid',
                  breakInside: 'avoid',
                }}
              >
                {/* 엔트리 헤더 */}
                <div
                  style={{
                    fontSize: '11px',
                    color: PRINT_TEXT.tertiary,
                    marginBottom: '2px',
                    wordBreak: 'normal',
                    overflowWrap: 'anywhere',
                  }}
                >
                  <span style={{ color: levelColor(entry.level), fontWeight: 600 }}>
                    [{entry.level}]
                  </span>
                  {' '}{entry.timestamp} [{entry.thread}] {entry.logger}
                </div>
                <div
                  className="stacktrace-message"
                  style={{
                    fontSize: '12px',
                    color: PRINT_TEXT.primary,
                    marginBottom: '4px',
                    wordBreak: 'normal',
                    overflowWrap: 'anywhere',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {entry.message}
                </div>

                {/*
                 * Exception + 스택프레임을 하나의 내부 div로 묶어 페이지 경계에서
                 * 통째로 잘리지 않도록 처리.
                 * 너무 긴 블록은 한 페이지를 초과하면 자연스럽게 다음 페이지로 넘어감
                 * (max-height 제한 없음 + break-inside:avoid 는 힌트로만 동작).
                 */}
                {(exc || entry.stacktrace.length > 0) && (
                  <div
                    className="stacktrace-body"
                    style={{
                      pageBreakInside: 'avoid',
                      breakInside: 'avoid',
                    }}
                  >
                    {exc && (
                      <div
                        className="stacktrace-exception"
                        style={{
                          fontSize: '11px',
                          marginBottom: '2px',
                          fontFamily: 'monospace',
                          wordBreak: 'normal',
                          overflowWrap: 'anywhere',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        <span style={{ color: PRINT_TEXT.tertiary }}>{exc.pkg}</span>
                        <span style={{ color: PRINT_TEXT.primary, fontWeight: 700 }}>{exc.simple}</span>
                        {entry.exceptionMessage && (
                          <span style={{ color: PRINT_LEVEL.ERROR }}>: {entry.exceptionMessage}</span>
                        )}
                      </div>
                    )}
                    {summarizeStackFrames(entry.stacktrace)}
                  </div>
                )}
              </div>
              );
            })}
            {entries.length > 50 && (
              <div style={{ fontSize: '11px', color: PRINT_TEXT.tertiary, textAlign: 'center', marginTop: '8px' }}>
                메모리 보호를 위해 상위 50건만 포함됩니다
              </div>
            )}
          </div>
        )}

        {/* 푸터 */}
        <div style={{ borderTop: `1px solid ${PRINT_BORDER.subtle}`, paddingTop: '8px', marginTop: '32px', fontSize: '10px', color: PRINT_TEXT.tertiary, textAlign: 'center' }}>
          LogLens
        </div>
      </div>
    </div>
  );
}
