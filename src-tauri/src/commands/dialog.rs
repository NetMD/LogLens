#[cfg(target_os = "macos")]
use tauri::Manager;

/// macOS 파일 다이얼로그 디렉토리를 다운로드 폴더로 리셋하는 커맨드.
///
/// 배경: ProjectRootPicker 에서 프로젝트 폴더를 선택하면 macOS 의
/// `NSNavLastRootDirectory` 가 해당 경로로 업데이트되어, 이후
/// `window.print()` → "PDF로 저장" 다이얼로그도 프로젝트 폴더에서 열린다.
/// 이 커맨드를 print 직전에 호출하여 다운로드 폴더로 되돌린다.

#[tauri::command]
pub fn reset_save_directory(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let download_dir = app
            .path()
            .download_dir()
            .map_err(|e| format!("Failed to resolve download dir: {e}"))?;
        let path_str = download_dir.to_string_lossy().to_string();
        let bundle_id = &app.config().identifier;

        let _ = std::process::Command::new("defaults")
            .args(["write", bundle_id, "NSNavLastRootDirectory", &path_str])
            .output();
    }

    // Windows / Linux 에서는 no-op (print dialog 가 자체 디렉토리 관리)
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
    }

    Ok(())
}
