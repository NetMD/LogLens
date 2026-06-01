// LogLens Raw 보기 B안 — 윈도우/오프셋 읽기 IPC 계약 (R13 BE-1)
//
// >100MB 원본 로그를 메모리 상주 없이 가상 스크롤로 보여주기 위한 Rust I/O 계약.
// (설계 §0.1 / §5.2 / §5.4)
//
// 핵심 전략:
//  - build_raw_line_index(path): 파일을 1회 풀스캔하여 각 라인의 "시작 바이트 오프셋"을
//    Vec<u64> 인덱스로 만든다. 인덱스는 ~8byte/라인이므로 500MB(~437만 라인)도 ~32MB 로
//    bounded (설계 §5.2 Q-D2 채택). 인덱스는 세션 키 Map(RAW_INDEX_STATE)에 보관하고,
//    FE 에는 메타(sessionId / lineCount / fileSize)만 반환한다.
//  - read_raw_window(sessionId, startLine, endLine): 보관한 오프셋 인덱스에서 startLine 의
//    바이트 위치로 seek 한 뒤 [startLine, endLine) 반열린 구간 라인만 읽어 Vec<String> 으로
//    반환한다. std::io::Seek 만 사용하므로 메모리 상주 0 (설계 §0.1 근거).
//
// 동시성 모델:
//  - 전역 RAW_INDEX_STATE: Mutex<HashMap<SessionId, RawIndex>> (watch 의 WATCH_STATE 와 별도).
//  - 동시 Raw 세션 수 = 동시에 켠 B안 Raw 탭 수. 동일 path 재인덱싱 시 이전 세션을 정리하여
//    세션 누수를 방지한다 (설계 §5.4 "채널/세션 capacity").
//  - lock 보유 중 파일 I/O(블로킹) 금지: 인덱스 Vec<u64> 는 lock 안에서 clone 하여 꺼낸 뒤
//    lock 을 해제하고 디스크를 읽는다.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use once_cell::sync::Lazy;
use serde::Serialize;

use crate::path_guard;

// ============================================================================
// 상수 (모듈 레벨 — 설계 §5.4 파일 I/O 6축 경계값)
// ============================================================================

// 경로 길이 상한 / 파일 크기 상한 / 민감 경로 차단 목록은 공통 모듈(path_guard)로 단일화
// (Security M-R13-1 / L-R13-3). watch.rs 와 동일한 보안 기준선을 공유한다.

/// 한 라인 최대 바이트 (watch.rs MAX_LINE_BYTES 준용, Security L-4)
/// — 초과 시 [TRUNCATED] 마커를 붙이고 다음 라인 경계까지 건너뛴다.
const MAX_LINE_BYTES: u64 = 1024 * 1024;

/// read_raw_window 한 요청 최대 라인 수 (설계 §5.4 "배치(윈도우) 크기" — IPC 폭주 방어)
const MAX_WINDOW_LINES: u64 = 2000;

// ============================================================================
// 에러 타입
// ============================================================================

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", content = "message")]
pub enum RawViewError {
    #[error("FILE_NOT_FOUND: {0}")]
    #[serde(rename = "FILE_NOT_FOUND")]
    FileNotFound(String),

    #[error("PERMISSION_DENIED: {0}")]
    #[serde(rename = "PERMISSION_DENIED")]
    PermissionDenied(String),

    #[error("IO_ERROR: {0}")]
    #[serde(rename = "IO_ERROR")]
    IoError(String),

    #[error("INVALID_PATH: {0}")]
    #[serde(rename = "INVALID_PATH")]
    InvalidPath(String),

    #[error("SESSION_NOT_FOUND: {0}")]
    #[serde(rename = "SESSION_NOT_FOUND")]
    SessionNotFound(String),
}

impl From<std::io::Error> for RawViewError {
    fn from(e: std::io::Error) -> Self {
        match e.kind() {
            std::io::ErrorKind::NotFound => RawViewError::FileNotFound(e.to_string()),
            std::io::ErrorKind::PermissionDenied => RawViewError::PermissionDenied(e.to_string()),
            _ => RawViewError::IoError(e.to_string()),
        }
    }
}

// ============================================================================
// 응답 DTO (설계 §5.2 — FE 계약과 1:1, camelCase 직렬화)
// ============================================================================

/// build_raw_line_index 응답.
/// FE 가상 스크롤은 lineCount 로 전체 높이를 산정한다 (설계 §5.2).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineIndexMeta {
    pub session_id: String,
    pub line_count: u64,
    pub file_size: u64,
}

/// read_raw_window 응답.
/// lines 는 [startLine, endLine) 반열린 구간 라인 (개행 제거).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawWindowResponse {
    pub start_line: u64,
    pub lines: Vec<String>,
}

// ============================================================================
// 세션 상태
// ============================================================================

/// 한 Raw 인덱스 세션의 보관 상태.
struct RawIndex {
    /// canonical 파일 경로 (윈도우 읽기 시 재오픈 대상)
    path: PathBuf,
    /// 각 라인의 시작 바이트 오프셋 (line_offsets[i] = i번째 라인의 파일 내 시작 바이트).
    /// 라인 수 N 에 대해 길이 N. ~8byte/라인 → bounded (설계 §5.2 Q-D2).
    line_offsets: Vec<u64>,
    /// 파일 전체 바이트 크기 (마지막 라인 끝 경계 계산용).
    file_size: u64,
}

/// 전역 Raw 인덱스 세션 맵 (watch 의 WATCH_STATE 와 별도, 설계 §5.4).
static RAW_INDEX_STATE: Lazy<Mutex<HashMap<String, RawIndex>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// ============================================================================
// 경로 검증
// ============================================================================

/// 경로 길이 / 파일 존재 / 정규 파일 여부 / 민감 경로 차단 / 파일 크기 상한 검증 후
/// canonical 경로를 반환한다. watch.rs 와 동일한 보안 기준선(path_guard)을 공유한다
/// (Security M-R13-1: 차단 목록 정합, L-R13-3: 500MB 상한).
fn validate_path(path_str: &str) -> Result<PathBuf, RawViewError> {
    // 경로 길이 상한 (공통 path_guard)
    path_guard::check_path_len(path_str)
        .map_err(|r| RawViewError::InvalidPath(r.message().into()))?;

    let canonical = Path::new(path_str)
        .canonicalize()
        .map_err(|e| RawViewError::InvalidPath(format!("경로를 확인할 수 없습니다: {}", e)))?;

    let meta = std::fs::metadata(&canonical).map_err(RawViewError::from)?;
    if !meta.is_file() {
        return Err(RawViewError::InvalidPath("디렉토리는 지원하지 않습니다".into()));
    }

    // 민감 경로 차단 목록 검사 (공통 path_guard, watch.rs 와 정합 — Security M-R13-1)
    path_guard::check_blocked(&canonical)
        .map_err(|r| RawViewError::InvalidPath(r.message().into()))?;

    // 파일 크기 상한 검사 (500MB — IPC 직접 호출 거대 파일 인덱싱 방어, Security L-R13-3)
    path_guard::check_file_size(meta.len())
        .map_err(|r| RawViewError::InvalidPath(r.message().into()))?;

    Ok(canonical)
}

// ============================================================================
// 풀스캔 인덱싱 (라인 시작 바이트 오프셋 수집)
// ============================================================================

/// 파일을 1회 풀스캔하여 각 라인의 시작 바이트 오프셋과 총 라인 수, 파일 크기를 반환한다.
/// — 라인 경계는 '\n'. 마지막 라인이 '\n' 으로 종결되지 않아도 1개 라인으로 센다.
/// — 인덱스는 오프셋(u64)만 보관하므로 라인 내용은 메모리에 누적하지 않는다 (bounded).
fn scan_line_offsets(path: &Path) -> Result<(Vec<u64>, u64), RawViewError> {
    let file = std::fs::File::open(path).map_err(RawViewError::from)?;
    let file_size = file.metadata().map_err(RawViewError::from)?.len();

    let mut line_offsets: Vec<u64> = Vec::new();
    if file_size == 0 {
        // 빈 파일: 라인 0개 (설계 §11 오프셋 0 경계값)
        return Ok((line_offsets, 0));
    }

    let mut reader = BufReader::new(file);
    let mut byte_pos: u64 = 0;
    let mut buf: Vec<u8> = Vec::with_capacity(8 * 1024);

    loop {
        // 현재 byte_pos 가 다음 라인의 시작 오프셋.
        let line_start = byte_pos;
        buf.clear();
        let n = reader
            .read_until(b'\n', &mut buf)
            .map_err(RawViewError::from)?;
        if n == 0 {
            // EOF: 더 읽을 라인 없음.
            break;
        }
        line_offsets.push(line_start);
        byte_pos += n as u64;
    }

    Ok((line_offsets, file_size))
}

// ============================================================================
// 윈도우 읽기 (오프셋 인덱스 seek → 라인 범위 읽기)
// ============================================================================

/// line_offsets 인덱스를 이용해 [start_line, end_line) 구간 라인을 디스크에서 읽어 반환.
/// — start_line 의 바이트 오프셋으로 한 번만 seek 한 뒤 라인을 순차 읽는다 (메모리 상주 0).
/// — MAX_LINE_BYTES 초과 라인은 [TRUNCATED] 마커 후 라인 경계까지 건너뛴다 (설계 §5.4).
fn read_window_lines(
    path: &Path,
    line_offsets: &[u64],
    file_size: u64,
    start_line: u64,
    end_line: u64,
) -> Result<Vec<String>, RawViewError> {
    let total = line_offsets.len() as u64;
    // 범위 클램프 — 인덱스 밖 요청은 빈 결과 (설계 §11 경계값: 마지막 윈도우 over-fetch).
    let start = start_line.min(total);
    let end = end_line.min(total);
    if start >= end {
        return Ok(Vec::new());
    }

    let want = (end - start) as usize;
    let mut lines: Vec<String> = Vec::with_capacity(want);

    let mut file = std::fs::File::open(path).map_err(RawViewError::from)?;
    let seek_to = line_offsets[start as usize];
    file.seek(SeekFrom::Start(seek_to)).map_err(RawViewError::from)?;
    let mut reader = BufReader::new(file);

    for line_idx in start..end {
        // 이 라인이 읽어야 할 최대 바이트 = 다음 라인 시작 - 현재 라인 시작 (마지막 라인은 파일 끝까지).
        let next_offset = if (line_idx + 1) < total {
            line_offsets[(line_idx + 1) as usize]
        } else {
            file_size
        };
        let line_bytes = next_offset.saturating_sub(line_offsets[line_idx as usize]);

        let mut buf: Vec<u8> = Vec::with_capacity(256);
        let read_limit = line_bytes.min(MAX_LINE_BYTES);
        let n = {
            let mut limited = (&mut reader).take(read_limit);
            limited.read_until(b'\n', &mut buf).map_err(RawViewError::from)?
        };
        if n == 0 {
            // 파일이 인덱싱 이후 줄어든 경우 등 — 안전하게 중단.
            break;
        }

        // MAX_LINE_BYTES 로 잘렸으면 '\n' 까지 건너뛴다 (다음 라인 seek 정합 유지).
        let truncated = line_bytes > MAX_LINE_BYTES && buf.last() != Some(&b'\n');
        if truncated {
            let remaining = line_bytes - read_limit;
            // 남은 바이트를 정확히 건너뛴다 (read_until 보다 seek 가 빠르고 정합적).
            reader
                .seek_relative(remaining as i64)
                .map_err(RawViewError::from)?;
        }

        // trailing 개행 제거 (\r\n / \n)
        if buf.last() == Some(&b'\n') {
            buf.pop();
            if buf.last() == Some(&b'\r') {
                buf.pop();
            }
        }

        let mut line = String::from_utf8_lossy(&buf).into_owned();
        if truncated {
            line.push_str(" [TRUNCATED]");
        }
        lines.push(line);
    }

    Ok(lines)
}

// ============================================================================
// Tauri commands (설계 §5.2 — FE 계약과 정확히 일치)
// ============================================================================

/// build_raw_line_index — 파일을 1회 풀스캔하여 라인 시작 바이트 오프셋 인덱스를 만들고
/// 세션 Map(RAW_INDEX_STATE)에 보관한다. FE 에는 메타(sessionId / lineCount / fileSize)만 반환.
///
/// 동일 path 가 이미 인덱싱되어 있으면 그 세션을 제거하고 재생성한다 (세션 누수 방지, 설계 §5.4).
#[tauri::command]
pub async fn build_raw_line_index(path: String) -> Result<LineIndexMeta, RawViewError> {
    let canonical = validate_path(&path)?;

    // 풀스캔은 블로킹 I/O 이므로 lock 밖에서 수행.
    let (line_offsets, file_size) = scan_line_offsets(&canonical)?;
    let line_count = line_offsets.len() as u64;

    let session_id = uuid::Uuid::new_v4().to_string();

    {
        let mut guard = RAW_INDEX_STATE
            .lock()
            .map_err(|e| RawViewError::IoError(format!("state lock: {}", e)))?;
        // 동일 path 의 이전 세션 정리 (재인덱싱 시 누수 방지).
        guard.retain(|_, idx| idx.path != canonical);
        guard.insert(
            session_id.clone(),
            RawIndex {
                path: canonical,
                line_offsets,
                file_size,
            },
        );
    }

    Ok(LineIndexMeta {
        session_id,
        line_count,
        file_size,
    })
}

/// read_raw_window — 세션 인덱스로 seek 하여 [startLine, endLine) 구간 라인만 읽어 반환.
/// 한 요청 최대 라인 수는 MAX_WINDOW_LINES 로 제한한다 (IPC 폭주 방어, 설계 §5.4).
#[tauri::command]
pub async fn read_raw_window(
    session_id: String,
    start_line: u64,
    end_line: u64,
) -> Result<RawWindowResponse, RawViewError> {
    // lock 안에서 인덱스를 clone 하여 꺼낸 뒤 lock 해제 → 디스크 I/O 는 lock 밖에서.
    let (path, line_offsets, file_size) = {
        let guard = RAW_INDEX_STATE
            .lock()
            .map_err(|e| RawViewError::IoError(format!("state lock: {}", e)))?;
        let idx = guard
            .get(&session_id)
            .ok_or_else(|| RawViewError::SessionNotFound(session_id.clone()))?;
        (idx.path.clone(), idx.line_offsets.clone(), idx.file_size)
    };

    // 요청 구간을 MAX_WINDOW_LINES 로 제한.
    let clamped_end = end_line.min(start_line.saturating_add(MAX_WINDOW_LINES));

    let lines = read_window_lines(&path, &line_offsets, file_size, start_line, clamped_end)?;

    Ok(RawWindowResponse {
        start_line,
        lines,
    })
}

// ============================================================================
// 단위 테스트
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_temp(content: &[u8]) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("loglens_raw_test_{}.log", uuid::Uuid::new_v4()));
        let mut f = std::fs::File::create(&p).unwrap();
        f.write_all(content).unwrap();
        f.flush().unwrap();
        p
    }

    #[test]
    fn scan_counts_lines_with_trailing_newline() {
        let p = write_temp(b"a\nbb\nccc\n");
        let (offsets, size) = scan_line_offsets(&p).unwrap();
        assert_eq!(offsets, vec![0, 2, 5]); // "a\n"=2, "bb\n"=3 → 5
        assert_eq!(size, 9);
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn scan_counts_lines_without_trailing_newline() {
        let p = write_temp(b"a\nbb\nccc");
        let (offsets, _) = scan_line_offsets(&p).unwrap();
        assert_eq!(offsets, vec![0, 2, 5]); // 마지막 라인도 1개로 카운트
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn scan_empty_file_zero_lines() {
        let p = write_temp(b"");
        let (offsets, size) = scan_line_offsets(&p).unwrap();
        assert!(offsets.is_empty());
        assert_eq!(size, 0);
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn window_reads_requested_range() {
        let p = write_temp(b"l0\nl1\nl2\nl3\nl4\n");
        let (offsets, size) = scan_line_offsets(&p).unwrap();
        let lines = read_window_lines(&p, &offsets, size, 1, 4).unwrap();
        assert_eq!(lines, vec!["l1", "l2", "l3"]); // [1,4) 반열린
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn window_clamps_over_range() {
        let p = write_temp(b"l0\nl1\n");
        let (offsets, size) = scan_line_offsets(&p).unwrap();
        let lines = read_window_lines(&p, &offsets, size, 1, 100).unwrap();
        assert_eq!(lines, vec!["l1"]);
        // start >= total → 빈 결과
        let empty = read_window_lines(&p, &offsets, size, 5, 10).unwrap();
        assert!(empty.is_empty());
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn window_strips_crlf() {
        let p = write_temp(b"a\r\nb\r\n");
        let (offsets, size) = scan_line_offsets(&p).unwrap();
        let lines = read_window_lines(&p, &offsets, size, 0, 2).unwrap();
        assert_eq!(lines, vec!["a", "b"]);
        std::fs::remove_file(&p).ok();
    }

    // ------------------------------------------------------------------
    // Security M-R13-1: watch 와 동일한 차단 목록을 공유하는지 확인.
    // ------------------------------------------------------------------
    #[test]
    fn validate_path_shares_blocked_substrings_with_watch() {
        // path_guard 가 단일 진실 출처이므로, raw_view 가 같은 차단 목록을 참조함을 확인.
        // (목록 자체는 path_guard 의 단위 테스트가 차단 동작을 검증한다.)
        assert!(!path_guard::BLOCKED_PATH_SUBSTRINGS.is_empty());
        assert!(path_guard::BLOCKED_PATH_SUBSTRINGS.contains(&"/.ssh/"));
        assert!(path_guard::BLOCKED_PATH_SUBSTRINGS.contains(&"/etc/shadow"));
    }

    #[test]
    fn validate_path_rejects_blocked_sensitive_path() {
        // 실제 존재하는 임시 파일을 .ssh 부분일치 경로로 만들어 차단 동작 확인.
        let mut dir = std::env::temp_dir();
        dir.push(format!("loglens_raw_test_{}", uuid::Uuid::new_v4()));
        dir.push(".ssh");
        std::fs::create_dir_all(&dir).unwrap();
        let mut p = dir.clone();
        p.push("id_rsa.log");
        {
            use std::io::Write;
            let mut f = std::fs::File::create(&p).unwrap();
            f.write_all(b"secret\n").unwrap();
            f.flush().unwrap();
        }
        let res = validate_path(p.to_str().unwrap());
        assert!(
            matches!(res, Err(RawViewError::InvalidPath(_))),
            "민감 경로(.ssh)는 차단되어야 한다"
        );
        std::fs::remove_file(&p).ok();
        std::fs::remove_dir_all(dir.parent().unwrap()).ok();
    }

    // ------------------------------------------------------------------
    // Security L-R13-3: 500MB 상한이 정의되어 있고 정상 파일은 통과하는지 확인.
    // (500MB 초과 실파일 생성은 비현실적이므로 path_guard 단위 테스트가 경계값을 검증)
    // ------------------------------------------------------------------
    #[test]
    fn validate_path_accepts_small_file() {
        let p = write_temp(b"hello\nworld\n");
        let res = validate_path(p.to_str().unwrap());
        assert!(res.is_ok(), "정상 크기 파일은 통과해야 한다");
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn max_file_size_is_500mb() {
        assert_eq!(path_guard::MAX_FILE_SIZE, 500 * 1024 * 1024);
    }
}
