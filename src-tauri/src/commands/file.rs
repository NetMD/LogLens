use async_compression::tokio::bufread::GzipDecoder;
use serde::Serialize;
use tauri::ipc::Channel;
use tokio::io::{AsyncBufRead, AsyncBufReadExt, BufReader};

const MAX_FILE_SIZE: u64 = 500 * 1024 * 1024; // 500MB
const MAX_COMPRESSED_SIZE: u64 = 200 * 1024 * 1024; // 200MB (gz 원본)
const BATCH_SIZE: usize = 500;
// gz 파일 진행률 추정용 평균 압축비 (spring 로그는 대개 10~15배 압축)
const GZIP_ESTIMATED_RATIO: u64 = 10;

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum FileReadEvent {
    #[serde(rename = "Chunk")]
    Chunk { lines: Vec<String>, progress: f32 },
    #[serde(rename = "Completed")]
    Completed { total_lines: u64 },
    #[serde(rename = "Error")]
    Error { message: String },
}

#[derive(Serialize)]
pub struct FileMetadata {
    pub size: u64,
    pub name: String,
    pub path: String,
}

fn is_gzip_path(path: &str) -> bool {
    std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("gz"))
        .unwrap_or(false)
}

/// 파일 메타데이터 조회 — 파일 크기 검사 및 이름 반환
#[tauri::command]
pub async fn get_file_metadata(path: String) -> Result<FileMetadata, String> {
    let meta = tokio::fs::metadata(&path)
        .await
        .map_err(|e| format!("파일 정보를 읽을 수 없습니다: {}", e))?;

    let is_gz = is_gzip_path(&path);
    let limit = if is_gz { MAX_COMPRESSED_SIZE } else { MAX_FILE_SIZE };

    if meta.len() > limit {
        let limit_mb = limit / 1024 / 1024;
        return Err(format!(
            "파일 크기({:.1}MB)가 최대 허용 크기({}MB)를 초과합니다.",
            meta.len() as f64 / 1024.0 / 1024.0,
            limit_mb
        ));
    }

    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    Ok(FileMetadata {
        size: meta.len(),
        name,
        path,
    })
}

/// 로그 파일을 500라인 배치로 스트리밍 읽기
/// .gz 확장자는 GzipDecoder를 통해 투명하게 압축 해제한다.
#[tauri::command]
pub async fn read_log_file(
    path: String,
    on_event: Channel<FileReadEvent>,
) -> Result<(), String> {
    let file = tokio::fs::File::open(&path)
        .await
        .map_err(|e| format!("파일을 열 수 없습니다: {}", e))?;

    let compressed_size = file.metadata().await.map(|m| m.len()).unwrap_or(1).max(1);
    let is_gz = is_gzip_path(&path);

    // 진행률 계산 기준: plain은 파일 크기, gz는 추정 해제 크기
    let progress_total = if is_gz {
        compressed_size.saturating_mul(GZIP_ESTIMATED_RATIO).max(1)
    } else {
        compressed_size
    };

    // gz/plain 두 경로가 서로 다른 리더 타입이므로 Box<dyn AsyncBufRead> 로 통일
    let reader: Box<dyn AsyncBufRead + Unpin + Send> = if is_gz {
        let decoder = GzipDecoder::new(BufReader::new(file));
        Box::new(BufReader::new(decoder))
    } else {
        Box::new(BufReader::new(file))
    };

    let mut lines = reader.lines();

    let mut bytes_read: u64 = 0;
    let mut total_lines: u64 = 0;
    let mut batch: Vec<String> = Vec::with_capacity(BATCH_SIZE);

    loop {
        let next = lines.next_line().await.map_err(|e| {
            let _ = on_event.send(FileReadEvent::Error { message: e.to_string() });
            format!("파일 읽기 오류: {}", e)
        })?;

        let Some(line) = next else { break };

        bytes_read += line.len() as u64 + 1;

        // 압축 해제 후 누적 크기가 MAX_FILE_SIZE 초과 시 중단 (gz 봄 가드)
        if is_gz && bytes_read > MAX_FILE_SIZE {
            let msg = format!(
                "압축 해제 크기가 최대 허용 크기(500MB)를 초과했습니다 (현재 {:.1}MB).",
                bytes_read as f64 / 1024.0 / 1024.0
            );
            let _ = on_event.send(FileReadEvent::Error { message: msg.clone() });
            return Err(msg);
        }

        total_lines += 1;
        batch.push(line);

        if batch.len() >= BATCH_SIZE {
            let progress = (bytes_read as f32 / progress_total as f32 * 100.0).min(99.9);
            on_event
                .send(FileReadEvent::Chunk {
                    lines: batch.drain(..).collect(),
                    progress,
                })
                .map_err(|e| e.to_string())?;
        }
    }

    // 잔여 라인 전송
    if !batch.is_empty() {
        on_event
            .send(FileReadEvent::Chunk {
                lines: batch,
                progress: 100.0,
            })
            .map_err(|e| e.to_string())?;
    }

    on_event
        .send(FileReadEvent::Completed { total_lines })
        .map_err(|e| e.to_string())?;

    Ok(())
}
