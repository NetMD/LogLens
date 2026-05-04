// LogLens 실시간 로그 파일 감시 모듈
//
// notify crate 를 사용해 파일 변경을 감지하고, 100ms 주기의 flush 루프로
// 새로 추가된 라인을 배치 emit 한다.
//
// 주요 시나리오:
//  - 초기 tail 100 라인 로드
//  - append 모드 증분 읽기
//  - 파일 회전(truncate 또는 inode 변경) 감지 및 재오픈
//  - 파일 일시 삭제 5초 grace period
//
// 동시성 모델:
//  - 전역 단일 WATCH_STATE (Mutex). 동시에 하나의 파일만 감시.
//  - notify 콜백은 tokio mpsc `sig_tx` 로 FsEvent 만 try_send.
//  - flush_loop 는 tokio::select! 로 interval tick 또는 sig_rx 수신 시 동작.
//  - lock 보유 중 await 금지.

#![allow(clippy::too_many_arguments)]

use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use notify::{Config, EventKind, PollWatcher, RecommendedWatcher, RecursiveMode, Watcher};
use once_cell::sync::Lazy;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

/// 세션 식별자 (uuid v4 문자열)
pub type SessionId = String;

/// 파일 고유 식별자 (Unix: (dev<<64)|ino / Windows: (volSerial<<64)|fileIndex)
pub type FileId = u128;

/// 버퍼 최대 라인 수 — 초과 시 front drop + dropped_count 증가
const BUFFER_MAX: usize = 200;

/// 초기 tail 라인 목표 수
const TAIL_TARGET_LINES: usize = 100;

/// flush 주기 (100ms)
const FLUSH_INTERVAL_MS: u64 = 100;

/// 파일 삭제 → 재생성 허용 grace period
const RECREATE_GRACE: Duration = Duration::from_secs(5);

/// 경로 길이 상한
const MAX_PATH_LEN: usize = 4096;

/// FsEvent 큐 용량
const SIG_CHANNEL_CAPACITY: usize = 256;

/// 한 라인 최대 바이트 (Security L-4) — 초과 시 [TRUNCATED] 마커 후 drain
const MAX_LINE_BYTES: u64 = 1 * 1024 * 1024;

/// 보안상 접근 차단 대상 경로 substring (Security M-1)
/// canonical path 문자열을 슬래시 정규화 + 소문자 변환 후 부분일치 검사한다.
const BLOCKED_PATH_SUBSTRINGS: &[&str] = &[
    "/.ssh/",
    "/.aws/",
    "/.gnupg/",
    "/etc/shadow",
    "/etc/sudoers",
    "/.config/gcloud/",
    "/.kube/",
];

// ============================================================================
// 에러 타입
// ============================================================================

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", content = "message")]
pub enum WatchError {
    #[error("FILE_NOT_FOUND: {0}")]
    #[serde(rename = "FILE_NOT_FOUND")]
    FileNotFound(String),

    #[error("PERMISSION_DENIED: {0}")]
    #[serde(rename = "PERMISSION_DENIED")]
    PermissionDenied(String),

    #[error("WATCHER_INIT_FAILED: {0}")]
    #[serde(rename = "WATCHER_INIT_FAILED")]
    WatcherInitFailed(String),

    #[error("IO_ERROR: {0}")]
    #[serde(rename = "IO_ERROR")]
    IoError(String),

    #[error("INVALID_PATH: {0}")]
    #[serde(rename = "INVALID_PATH")]
    InvalidPath(String),

    #[allow(dead_code)]
    #[error("ALREADY_WATCHING: {0}")]
    #[serde(rename = "ALREADY_WATCHING")]
    AlreadyWatching(String),
}

impl From<std::io::Error> for WatchError {
    fn from(e: std::io::Error) -> Self {
        match e.kind() {
            std::io::ErrorKind::NotFound => WatchError::FileNotFound(e.to_string()),
            std::io::ErrorKind::PermissionDenied => WatchError::PermissionDenied(e.to_string()),
            _ => WatchError::IoError(e.to_string()),
        }
    }
}

// ============================================================================
// 시그널 / 상태
// ============================================================================

/// flush_loop 로 전달되는 내부 신호
#[derive(Debug, Clone, Copy)]
pub enum WatchSignal {
    FsEvent,
    #[allow(dead_code)]
    Tick,
    Stop,
}

/// 전역 감시 상태
pub struct WatchState {
    pub session_id: SessionId,
    pub path: PathBuf,
    pub offset: u64,
    pub file_id: Option<FileId>,
    /// keep-alive for RAII (watcher drop 시 FS 감시 중단)
    #[allow(dead_code)]
    pub watcher: Box<dyn Watcher + Send>,
    pub buffer: VecDeque<String>,
    pub last_flush: Instant,
    pub recreate_deadline: Option<Instant>,
    pub dropped_count: u64,
    pub batch_seq: u64,
    pub sig_tx: mpsc::Sender<WatchSignal>,
}

pub static WATCH_STATE: Lazy<Mutex<Option<WatchState>>> = Lazy::new(|| Mutex::new(None));

// ============================================================================
// DTO (응답/이벤트 페이로드)
// ============================================================================

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartWatchResponse {
    pub session_id: String,
    pub initial_lines: Vec<String>,
    pub start_offset: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchStatusDto {
    pub session_id: String,
    pub path: String,
    pub offset: u64,
    pub dropped_count: u64,
    pub batch_seq: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLineAddedPayload {
    pub session_id: String,
    pub lines: Vec<String>,
    pub start_offset: u64,
    pub end_offset: u64,
    pub is_initial: bool,
    pub dropped_count: u64,
    pub batch_seq: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogWatchRotatedPayload {
    pub session_id: String,
    /// 회전 사유: "FILE_ID_CHANGED" | "TRUNCATED" | "RECREATED"
    pub reason: String,
    pub previous_offset: u64,
    pub new_file_size: u64,
    /// ISO-8601(RFC3339) 시각
    pub rotated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogWatchErrorPayload {
    pub session_id: String,
    pub error: WatchErrorDto,
    pub fatal: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct WatchErrorDto {
    pub code: String,
    pub message: String,
}

/// code 문자열 기준으로 fatal 여부 판정
fn error_is_fatal(code: &str) -> bool {
    match code {
        "FILE_NOT_FOUND" | "PERMISSION_DENIED" | "WATCHER_INIT_FAILED" => true,
        "IO_ERROR" => false,
        _ => true,
    }
}

/// 편의 생성자: code/message 로부터 LogWatchErrorPayload 생성
fn make_error_payload(session_id: &str, code: &str, message: String) -> LogWatchErrorPayload {
    LogWatchErrorPayload {
        session_id: session_id.to_string(),
        error: WatchErrorDto {
            code: code.to_string(),
            message,
        },
        fatal: error_is_fatal(code),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogWatchStoppedPayload {
    pub session_id: String,
}

// ============================================================================
// 경로 검증
// ============================================================================

fn validate_path(path_str: &str) -> Result<PathBuf, WatchError> {
    if path_str.len() > MAX_PATH_LEN {
        return Err(WatchError::InvalidPath("경로가 너무 깁니다".into()));
    }

    let p = Path::new(path_str);
    let canonical = p
        .canonicalize()
        .map_err(|e| WatchError::InvalidPath(format!("경로를 확인할 수 없습니다: {}", e)))?;

    let meta = std::fs::metadata(&canonical).map_err(WatchError::from)?;
    if !meta.is_file() {
        return Err(WatchError::InvalidPath(
            "디렉토리는 지원하지 않습니다".into(),
        ));
    }

    // 민감 경로 블랙리스트 검사 (Security M-1)
    // Windows 백슬래시를 슬래시로 정규화한 뒤 소문자 비교
    let canonical_str = canonical.to_string_lossy();
    let normalized = canonical_str.replace('\\', "/").to_lowercase();
    for blocked in BLOCKED_PATH_SUBSTRINGS {
        if normalized.contains(blocked) {
            return Err(WatchError::InvalidPath(
                "접근이 허용되지 않은 경로입니다".into(),
            ));
        }
    }

    Ok(canonical)
}

// ============================================================================
// tail 읽기 (역방향 탐색)
// ============================================================================

/// 파일 끝에서부터 target 라인 수만큼 역방향으로 읽어 반환.
/// 8K → 16K → 32K → 64K 순으로 확장 탐색.
/// 첫 잘린(불완전한) 라인은 제거한다.
/// 반환: (라인 목록, 파일 끝 offset)
pub fn read_tail_lines(
    path: &Path,
    target: usize,
) -> Result<(Vec<String>, u64), WatchError> {
    let mut file = std::fs::File::open(path).map_err(WatchError::from)?;
    let file_len = file.metadata().map_err(WatchError::from)?.len();

    if file_len == 0 {
        return Ok((Vec::new(), 0));
    }

    let mut chunk_size: u64 = 8 * 1024;
    let max_chunk: u64 = 64 * 1024;

    loop {
        let read_size = chunk_size.min(file_len);
        let start = file_len - read_size;

        file.seek(SeekFrom::Start(start)).map_err(WatchError::from)?;
        let mut buf = vec![0u8; read_size as usize];
        file.read_exact(&mut buf).map_err(WatchError::from)?;

        let text = String::from_utf8_lossy(&buf);
        let mut lines: Vec<String> = text.split('\n').map(|s| s.to_string()).collect();

        // split('\n') 결과 마지막 원소 처리:
        //  - 파일이 '\n'으로 끝나면 빈 문자열 → 제거
        //  - 아니면 마지막 라인 (유지)
        if lines.last().map(|s| s.is_empty()).unwrap_or(false) {
            lines.pop();
        }

        // 첫 원소는 잘린 라인일 가능성 — start>0 이면 제거
        let first_is_partial = start > 0;
        if first_is_partial && !lines.is_empty() {
            lines.remove(0);
        }

        // 라인 수가 target 이상이면 확정
        if lines.len() >= target || start == 0 {
            let take = lines.len().min(target);
            let result: Vec<String> = lines.split_off(lines.len() - take);
            return Ok((result, file_len));
        }

        // 더 큰 chunk 로 재시도
        if chunk_size >= max_chunk {
            // 이미 최대 chunk 인데 target 미달 → 있는 만큼 반환
            return Ok((lines, file_len));
        }
        chunk_size = (chunk_size * 2).min(max_chunk);
    }
}

// ============================================================================
// 파일 식별자
// ============================================================================

#[cfg(unix)]
pub fn get_file_id(path: &Path) -> Result<FileId, WatchError> {
    use std::os::unix::fs::MetadataExt;
    let meta = std::fs::metadata(path).map_err(WatchError::from)?;
    Ok(((meta.dev() as u128) << 64) | (meta.ino() as u128))
}

#[cfg(windows)]
pub fn get_file_id(path: &Path) -> Result<FileId, WatchError> {
    let file = std::fs::File::open(path).map_err(WatchError::from)?;
    let info = winapi_util::file::information(&file)
        .map_err(|e| WatchError::IoError(e.to_string()))?;
    Ok(((info.volume_serial_number() as u128) << 64) | (info.file_index() as u128))
}

#[cfg(not(any(unix, windows)))]
pub fn get_file_id(_path: &Path) -> Result<FileId, WatchError> {
    Ok(0)
}

// ============================================================================
// 회전 감지
// ============================================================================

/// size < offset 또는 file_id 변경이면 회전으로 판단
/// (detect_rotation_reason 이 프로덕션 경로에서 사용되며, 본 함수는 하위호환/테스트용)
#[allow(dead_code)]
pub fn detect_rotation(
    state_offset: u64,
    state_file_id: Option<FileId>,
    meta: &std::fs::Metadata,
    current_id: Option<FileId>,
) -> bool {
    if meta.len() < state_offset {
        return true;
    }
    match (state_file_id, current_id) {
        (Some(a), Some(b)) if a != b => true,
        _ => false,
    }
}

/// detect_rotation 과 동일한 로직이되 회전 사유를 함께 반환.
/// - size < state_offset  → Some("TRUNCATED")
/// - file_id 변경         → Some("FILE_ID_CHANGED")
/// - 그 외                → None
pub fn detect_rotation_reason(
    state_offset: u64,
    state_file_id: Option<FileId>,
    meta: &std::fs::Metadata,
    current_id: Option<FileId>,
) -> Option<&'static str> {
    if meta.len() < state_offset {
        return Some("TRUNCATED");
    }
    match (state_file_id, current_id) {
        (Some(a), Some(b)) if a != b => Some("FILE_ID_CHANGED"),
        _ => None,
    }
}

// ============================================================================
// 증분 읽기 — offset 부터 EOF 까지
// ============================================================================

/// state.offset 부터 EOF 까지 라인을 읽어 buffer 에 push_back 한다.
/// 버퍼가 BUFFER_MAX 를 초과하면 front 를 drop 하고 dropped_count 를 증가시킨다.
/// 반환: 읽은 새 offset
fn read_appended_into(
    path: &Path,
    start_offset: u64,
    buffer: &mut VecDeque<String>,
    dropped_count: &mut u64,
) -> Result<u64, WatchError> {
    let mut file = std::fs::File::open(path).map_err(WatchError::from)?;
    let file_len = file.metadata().map_err(WatchError::from)?.len();

    if file_len <= start_offset {
        return Ok(start_offset);
    }

    file.seek(SeekFrom::Start(start_offset))
        .map_err(WatchError::from)?;
    let mut reader = BufReader::new(file);
    let mut bytes_consumed: u64 = 0;

    loop {
        // MAX_LINE_BYTES 까지만 read_until (Security L-4)
        let mut buf: Vec<u8> = Vec::with_capacity(256);
        let n = {
            let mut limited = (&mut reader).take(MAX_LINE_BYTES);
            limited.read_until(b'\n', &mut buf).map_err(WatchError::from)?
        };
        if n == 0 {
            break;
        }
        bytes_consumed += n as u64;

        // 한 라인이 MAX_LINE_BYTES 에 도달했고 '\n' 종결이 아니라면 초과분 drain.
        // 초과 시 라인 끝에 " [TRUNCATED]" 마커를 붙인다.
        let truncated = n as u64 == MAX_LINE_BYTES && buf.last() != Some(&b'\n');
        if truncated {
            // 남은 라인 바이트를 '\n' 까지 버린다 (또는 EOF).
            let mut junk: Vec<u8> = Vec::with_capacity(4096);
            let drained = reader
                .read_until(b'\n', &mut junk)
                .map_err(WatchError::from)?;
            bytes_consumed += drained as u64;
        }

        // 마지막 '\n' 이 없는 불완전한 라인: 그대로 한 번에 읽혔어도 푸시.
        // (실무상 파일 append 는 보통 '\n' 종결이지만 grace 허용)
        // trailing newline 제거
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

        if buffer.len() >= BUFFER_MAX {
            buffer.pop_front();
            *dropped_count += 1;
        }
        buffer.push_back(line);
    }

    Ok(start_offset + bytes_consumed)
}

// ============================================================================
// Emit helpers
// ============================================================================

fn emit_batch(
    app: &AppHandle,
    payload: LogLineAddedPayload,
) {
    let _ = app.emit("log-line-added", payload);
}

fn emit_rotated(app: &AppHandle, payload: LogWatchRotatedPayload) {
    let _ = app.emit("log-watch-rotated", payload);
}

fn emit_error(app: &AppHandle, payload: LogWatchErrorPayload) {
    let _ = app.emit("log-watch-error", payload);
}

fn emit_stopped(app: &AppHandle, payload: LogWatchStoppedPayload) {
    let _ = app.emit("log-watch-stopped", payload);
}

// ============================================================================
// flush_loop — 백그라운드 태스크
// ============================================================================

/// 활성 세션의 flush 루프. interval tick 혹은 FsEvent 수신 시 read_appended + emit.
async fn flush_loop(
    app: AppHandle,
    session_id: SessionId,
    mut sig_rx: mpsc::Receiver<WatchSignal>,
) {
    let mut ticker = tokio::time::interval(Duration::from_millis(FLUSH_INTERVAL_MS));
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        let signal = tokio::select! {
            _ = ticker.tick() => WatchSignal::Tick,
            maybe = sig_rx.recv() => match maybe {
                Some(s) => s,
                None => return,
            }
        };

        if matches!(signal, WatchSignal::Stop) {
            return;
        }

        // 상태 스냅샷 (lock 잡은 채 await 금지)
        let snapshot = {
            let guard = match WATCH_STATE.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            match guard.as_ref() {
                Some(s) if s.session_id == session_id => {
                    Some((s.path.clone(), s.offset, s.file_id, s.recreate_deadline))
                }
                _ => None,
            }
        };

        let Some((path, offset, prev_file_id, recreate_deadline)) = snapshot else {
            // 세션 교체됨 → 종료
            return;
        };

        // 파일 메타 확인
        let meta_res = std::fs::metadata(&path);
        let mut rotation_reason: Option<&'static str> = None;
        let mut new_file_size_on_rotate: u64 = 0;
        let mut file_missing = false;
        match &meta_res {
            Ok(meta) => {
                // get_file_id 실패는 일시적 IO 오류로 간주 (Security L-2).
                // 에러 emit 은 하되 세션은 유지하고, 이번 iteration 에서는 회전 판별을
                // file_id 변경 기준 없이 size 기준만 적용한다.
                let cur_id = match get_file_id(&path) {
                    Ok(id) => Some(id),
                    Err(e) => {
                        emit_error(
                            &app,
                            make_error_payload(
                                &session_id,
                                "IO_ERROR",
                                format!("file_id 조회 실패: {}", e),
                            ),
                        );
                        None
                    }
                };
                if let Some(reason) = detect_rotation_reason(offset, prev_file_id, meta, cur_id) {
                    rotation_reason = Some(reason);
                    new_file_size_on_rotate = meta.len();
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                file_missing = true;
            }
            Err(e) => {
                emit_error(
                    &app,
                    make_error_payload(&session_id, "IO_ERROR", e.to_string()),
                );
                continue;
            }
        }

        if file_missing {
            // grace period 체크
            let deadline = {
                let mut guard = match WATCH_STATE.lock() {
                    Ok(g) => g,
                    Err(_) => return,
                };
                if let Some(s) = guard.as_mut() {
                    if s.recreate_deadline.is_none() {
                        s.recreate_deadline = Some(Instant::now() + RECREATE_GRACE);
                    }
                    s.recreate_deadline
                } else {
                    None
                }
            };

            if let Some(dl) = deadline.or(recreate_deadline) {
                if Instant::now() > dl {
                    // grace 초과 → 에러 emit + 정리
                    emit_error(
                        &app,
                        make_error_payload(
                            &session_id,
                            "FILE_NOT_FOUND",
                            "파일이 사라졌습니다".into(),
                        ),
                    );
                    if let Ok(mut guard) = WATCH_STATE.lock() {
                        if let Some(s) = guard.as_ref() {
                            if s.session_id == session_id {
                                *guard = None;
                            }
                        }
                    }
                    return;
                }
            }
            continue;
        }

        // recreate_deadline 이 이전에 설정되어 있었고 이번에 파일이 다시 나타났다면
        // 실질적으로 RECREATED 이다. rotation_reason 이 None 이더라도 승격한다.
        if recreate_deadline.is_some() && !file_missing && rotation_reason.is_none() {
            if let Ok(meta) = std::fs::metadata(&path) {
                rotation_reason = Some("RECREATED");
                new_file_size_on_rotate = meta.len();
            }
        }

        if let Some(reason_str) = rotation_reason {
            let previous_offset = offset;
            // 회전 처리: tail 대신 0부터 읽어 emit
            match read_tail_lines(&path, TAIL_TARGET_LINES) {
                Ok((lines, new_offset)) => {
                    let new_file_id = get_file_id(&path).ok();
                    let (batch_seq, is_initial_like) = {
                        let mut guard = match WATCH_STATE.lock() {
                            Ok(g) => g,
                            Err(_) => return,
                        };
                        match guard.as_mut() {
                            Some(s) if s.session_id == session_id => {
                                s.offset = new_offset;
                                s.file_id = new_file_id;
                                s.recreate_deadline = None;
                                s.batch_seq += 1;
                                (s.batch_seq, true)
                            }
                            _ => return,
                        }
                    };

                    emit_rotated(
                        &app,
                        LogWatchRotatedPayload {
                            session_id: session_id.clone(),
                            reason: reason_str.to_string(),
                            previous_offset,
                            new_file_size: new_file_size_on_rotate,
                            rotated_at: chrono::Utc::now().to_rfc3339(),
                        },
                    );

                    if !lines.is_empty() {
                        emit_batch(
                            &app,
                            LogLineAddedPayload {
                                session_id: session_id.clone(),
                                lines,
                                start_offset: 0,
                                end_offset: new_offset,
                                is_initial: is_initial_like,
                                dropped_count: 0,
                                batch_seq,
                            },
                        );
                    }
                }
                Err(e) => {
                    emit_error(
                        &app,
                        make_error_payload(&session_id, "IO_ERROR", format!("{:?}", e)),
                    );
                }
            }
            continue;
        }

        // 정상 append 읽기
        let (new_offset_opt, drained, start_off, end_off, dropped_after, batch_seq) = {
            // lock 보유 짧게: 필요한 값 clone → drop → 작업은 lock 밖
            let (cur_offset, mut tmp_buffer, mut tmp_dropped) = {
                let guard = match WATCH_STATE.lock() {
                    Ok(g) => g,
                    Err(_) => return,
                };
                match guard.as_ref() {
                    Some(s) if s.session_id == session_id => {
                        (s.offset, VecDeque::<String>::new(), s.dropped_count)
                    }
                    _ => return,
                }
            };

            match read_appended_into(&path, cur_offset, &mut tmp_buffer, &mut tmp_dropped) {
                Ok(new_offset) => {
                    if tmp_buffer.is_empty() && new_offset == cur_offset {
                        // 아무것도 없음
                        (None, Vec::<String>::new(), 0u64, 0u64, tmp_dropped, 0u64)
                    } else {
                        // 상태 업데이트
                        let mut guard = match WATCH_STATE.lock() {
                            Ok(g) => g,
                            Err(_) => return,
                        };
                        let Some(s) = guard.as_mut() else { return };
                        if s.session_id != session_id {
                            return;
                        }
                        let start = s.offset;
                        s.offset = new_offset;
                        s.dropped_count = tmp_dropped;
                        s.last_flush = Instant::now();
                        s.recreate_deadline = None;
                        s.batch_seq += 1;
                        let seq = s.batch_seq;

                        // 기존 buffer 와 새로 읽은 것 병합 후 drain
                        for line in tmp_buffer.drain(..) {
                            if s.buffer.len() >= BUFFER_MAX {
                                s.buffer.pop_front();
                                s.dropped_count += 1;
                            }
                            s.buffer.push_back(line);
                        }
                        let lines: Vec<String> = s.buffer.drain(..).collect();
                        (
                            Some(new_offset),
                            lines,
                            start,
                            new_offset,
                            s.dropped_count,
                            seq,
                        )
                    }
                }
                Err(e) => {
                    let code = match e {
                        WatchError::FileNotFound(_) => "FILE_NOT_FOUND",
                        WatchError::PermissionDenied(_) => "PERMISSION_DENIED",
                        _ => "IO_ERROR",
                    };
                    emit_error(
                        &app,
                        make_error_payload(&session_id, code, format!("{}", e)),
                    );
                    continue;
                }
            }
        };

        if new_offset_opt.is_some() && !drained.is_empty() {
            emit_batch(
                &app,
                LogLineAddedPayload {
                    session_id: session_id.clone(),
                    lines: drained,
                    start_offset: start_off,
                    end_offset: end_off,
                    is_initial: false,
                    dropped_count: dropped_after,
                    batch_seq,
                },
            );
        }
    }
}

// ============================================================================
// Tauri commands
// ============================================================================

#[tauri::command]
pub async fn start_watch(
    app: AppHandle,
    path: String,
) -> Result<StartWatchResponse, WatchError> {
    // 1) 경로 검증을 먼저 수행 (Security L-3)
    //    — canonicalize 나 블랙리스트 실패 시 기존 세션을 건드리지 않고 즉시 에러 반환.
    let canonical = validate_path(&path)?;

    // 2) 중복 세션 처리 (BL-09)
    {
        let existing = {
            let guard = WATCH_STATE
                .lock()
                .map_err(|e| WatchError::IoError(format!("state lock: {}", e)))?;
            guard.as_ref().map(|s| (s.session_id.clone(), s.path.clone()))
        };
        if let Some((sid, existing_path)) = existing {
            if canonical == existing_path {
                // no-op: 기존 세션 정보만 반환 (initial_lines 는 비움)
                return Ok(StartWatchResponse {
                    session_id: sid,
                    initial_lines: Vec::new(),
                    start_offset: 0,
                });
            } else {
                // 다른 경로 → 기존 세션 종료 후 교체
                stop_watch_internal(&app);
            }
        }
    }

    // 3) tail 100 라인 읽기
    let (initial_lines, start_offset) = read_tail_lines(&canonical, TAIL_TARGET_LINES)?;

    // 4) file_id 획득
    let file_id = get_file_id(&canonical).ok();

    // 5) 세션 ID 생성
    let session_id = uuid::Uuid::new_v4().to_string();

    // 6) 시그널 채널
    let (sig_tx, sig_rx) = mpsc::channel::<WatchSignal>(SIG_CHANNEL_CAPACITY);

    // 7) notify Watcher 생성
    let tx_for_cb = sig_tx.clone();
    let event_handler = move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            match ev.kind {
                EventKind::Modify(_)
                | EventKind::Create(_)
                | EventKind::Remove(_)
                | EventKind::Any => {
                    // 콜백 내부에서는 try_send 만
                    let _ = tx_for_cb.try_send(WatchSignal::FsEvent);
                }
                _ => {}
            }
        }
    };

    let use_poll = std::env::var("LOGLENS_FORCE_POLL").is_ok();
    let mut watcher: Box<dyn Watcher + Send> = if use_poll {
        let config = Config::default().with_poll_interval(Duration::from_millis(250));
        let w = PollWatcher::new(event_handler, config)
            .map_err(|e| WatchError::WatcherInitFailed(e.to_string()))?;
        Box::new(w)
    } else {
        let w = RecommendedWatcher::new(event_handler, Config::default())
            .map_err(|e| WatchError::WatcherInitFailed(e.to_string()))?;
        Box::new(w)
    };

    watcher
        .watch(&canonical, RecursiveMode::NonRecursive)
        .map_err(|e| WatchError::WatcherInitFailed(e.to_string()))?;

    // 8) 상태 저장
    {
        let mut guard = WATCH_STATE
            .lock()
            .map_err(|e| WatchError::IoError(format!("state lock: {}", e)))?;
        *guard = Some(WatchState {
            session_id: session_id.clone(),
            path: canonical.clone(),
            offset: start_offset,
            file_id,
            watcher,
            buffer: VecDeque::with_capacity(BUFFER_MAX),
            last_flush: Instant::now(),
            recreate_deadline: None,
            dropped_count: 0,
            batch_seq: 0,
            sig_tx,
        });
    }

    // 9) flush_loop 태스크 시작
    let app_for_loop = app.clone();
    let sid_for_loop = session_id.clone();
    tauri::async_runtime::spawn(async move {
        flush_loop(app_for_loop, sid_for_loop, sig_rx).await;
    });

    Ok(StartWatchResponse {
        session_id,
        initial_lines,
        start_offset,
    })
}

/// 내부 정리 로직 (notifier 드롭 및 stopped 이벤트 emit)
fn stop_watch_internal(app: &AppHandle) -> Option<SessionId> {
    let taken = {
        let mut guard = WATCH_STATE.lock().ok()?;
        guard.take()
    };
    if let Some(state) = taken {
        // sig_tx 에 Stop 전달 (best-effort)
        let _ = state.sig_tx.try_send(WatchSignal::Stop);
        let sid = state.session_id.clone();
        // watcher 는 drop 시 자동 정리
        drop(state);
        emit_stopped(
            app,
            LogWatchStoppedPayload {
                session_id: sid.clone(),
            },
        );
        Some(sid)
    } else {
        None
    }
}

#[tauri::command]
pub async fn stop_watch(app: AppHandle) -> Result<(), WatchError> {
    stop_watch_internal(&app);
    Ok(())
}

#[tauri::command]
pub async fn get_watch_status() -> Result<Option<WatchStatusDto>, WatchError> {
    let guard = WATCH_STATE
        .lock()
        .map_err(|e| WatchError::IoError(format!("state lock: {}", e)))?;
    Ok(guard.as_ref().map(|s| WatchStatusDto {
        session_id: s.session_id.clone(),
        path: s.path.to_string_lossy().into(),
        offset: s.offset,
        dropped_count: s.dropped_count,
        batch_seq: s.batch_seq,
    }))
}

// ============================================================================
// 단위 테스트
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_temp(content: &[u8]) -> (tempfile::NamedTempFile, PathBuf) {
        let mut f = tempfile::NamedTempFile::new().expect("tempfile");
        f.write_all(content).unwrap();
        f.flush().unwrap();
        let p = f.path().to_path_buf();
        (f, p)
    }

    #[test]
    fn test_read_tail_lines_short_file() {
        // 10 줄
        let content = (1..=10)
            .map(|i| format!("line{}", i))
            .collect::<Vec<_>>()
            .join("\n")
            + "\n";
        let (_f, path) = write_temp(content.as_bytes());

        let (lines, offset) = read_tail_lines(&path, 100).unwrap();
        assert_eq!(lines.len(), 10);
        assert_eq!(lines[0], "line1");
        assert_eq!(lines[9], "line10");
        assert_eq!(offset, content.len() as u64);
    }

    #[test]
    fn test_read_tail_lines_exact_100() {
        // 120 줄
        let content = (1..=120)
            .map(|i| format!("line{}", i))
            .collect::<Vec<_>>()
            .join("\n")
            + "\n";
        let (_f, path) = write_temp(content.as_bytes());

        let (lines, _) = read_tail_lines(&path, 100).unwrap();
        assert_eq!(lines.len(), 100);
        assert_eq!(lines[0], "line21");
        assert_eq!(lines[99], "line120");
    }

    #[test]
    fn test_read_tail_lines_truncates_partial_first_line() {
        // 매우 긴 라인들 — chunk 경계에서 첫 라인이 잘려야 함
        // 각 라인 1000 바이트로 20 줄 작성 → 총 ~20KB
        let mut content = String::new();
        for i in 0..20 {
            let prefix = format!("line{:03}:", i);
            let pad_len = 1000 - prefix.len() - 1;
            content.push_str(&prefix);
            content.push_str(&"X".repeat(pad_len));
            content.push('\n');
        }
        let (_f, path) = write_temp(content.as_bytes());

        // tail 5 라인 요청 — 8K chunk 로 읽으면 첫 라인은 잘려야 함
        let (lines, _) = read_tail_lines(&path, 5).unwrap();
        assert_eq!(lines.len(), 5);
        // 잘린 라인(중간 프레임)이 제거되어, 반환된 첫 라인은 line*으로 시작해야 함
        for l in &lines {
            assert!(l.starts_with("line"), "line should start with 'line': {}", &l[..20.min(l.len())]);
        }
        // 마지막은 line019
        assert!(lines.last().unwrap().starts_with("line019"));
    }

    #[test]
    fn test_detect_rotation_truncate() {
        // size < offset 인 경우
        let (_f, path) = write_temp(b"hello\n");
        let meta = std::fs::metadata(&path).unwrap();
        let rotated = detect_rotation(100, None, &meta, None);
        assert!(rotated);
    }

    #[test]
    fn test_detect_rotation_normal() {
        let (_f, path) = write_temp(b"hello world\n");
        let meta = std::fs::metadata(&path).unwrap();
        let rotated = detect_rotation(0, Some(42), &meta, Some(42));
        assert!(!rotated);
    }

    #[test]
    fn test_lossy_utf8() {
        // invalid byte sequence (0xFF)
        let content = b"valid line\n\xFF\xFEbroken line\n";
        let (_f, path) = write_temp(content);

        let (lines, _) = read_tail_lines(&path, 10).unwrap();
        // 2 라인 반환
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0], "valid line");
        // 두번째 라인은 lossy replacement 포함
        assert!(lines[1].contains("broken line"));
    }

    #[test]
    fn test_read_appended_into_basic() {
        let (_f, path) = write_temp(b"a\nb\nc\n");
        let mut buf = VecDeque::new();
        let mut dropped = 0u64;
        let new_offset = read_appended_into(&path, 0, &mut buf, &mut dropped).unwrap();
        assert_eq!(new_offset, 6);
        assert_eq!(buf.len(), 3);
        assert_eq!(buf[0], "a");
        assert_eq!(buf[2], "c");
        assert_eq!(dropped, 0);
    }

    #[test]
    fn test_read_appended_into_buffer_overflow() {
        // BUFFER_MAX(200) 초과 라인
        let total = BUFFER_MAX + 50;
        let content: String = (0..total)
            .map(|i| format!("l{}", i))
            .collect::<Vec<_>>()
            .join("\n")
            + "\n";
        let (_f, path) = write_temp(content.as_bytes());
        let mut buf = VecDeque::new();
        let mut dropped = 0u64;
        read_appended_into(&path, 0, &mut buf, &mut dropped).unwrap();
        assert_eq!(buf.len(), BUFFER_MAX);
        assert_eq!(dropped, 50);
        // 앞 50개가 drop 되었으니 첫 원소는 l50
        assert_eq!(buf[0], "l50");
    }
}
