// LogLens 경로 보안 가드 — watch / raw_view 공통 단일 진실 출처 (Security M-R13-1 / L-R13-3)
//
// watch.rs(실시간 감시)와 contracts/raw_view.rs(Raw 보기 인덱싱)가 동일한 경로 보안
// 기준선을 공유하도록, 차단 경로 목록·경로 길이 상한·파일 크기 상한과 그 검사 로직을
// 이 모듈 한 곳에만 정의한다(중복 정의 금지).
//
// 두 모듈은 각자 다른 에러 타입(WatchError / RawViewError)을 쓰므로, 여기서는 에러 타입에
// 의존하지 않는 순수 검사 함수만 제공한다. 위반 시 고정 문자열 사유를 반환하고, 각 호출부가
// 자기 에러 타입으로 매핑한다(에러 메시지에 사용자 입력 경로를 포함하지 않는다, Security).

use std::path::Path;

/// 경로 길이 상한 (watch / raw_view 공통)
pub const MAX_PATH_LEN: usize = 4096;

/// 인덱싱/감시 대상 파일 최대 크기 (500MB) — LogLens 기존 get_file_metadata 기준선과 정합 (L-R13-3)
pub const MAX_FILE_SIZE: u64 = 500 * 1024 * 1024;

/// 보안상 접근 차단 대상 경로 substring (Security M-1 / M-R13-1)
/// canonical path 문자열을 슬래시 정규화 + 소문자 변환 후 부분일치 검사한다.
pub const BLOCKED_PATH_SUBSTRINGS: &[&str] = &[
    "/.ssh/",
    "/.aws/",
    "/.gnupg/",
    "/etc/shadow",
    "/etc/sudoers",
    "/.config/gcloud/",
    "/.kube/",
];

/// 경로 검증 위반 사유 (고정 문자열, 사용자 입력 경로 미포함).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathGuardReject {
    /// 경로 길이가 MAX_PATH_LEN 초과
    TooLong,
    /// 민감 경로 차단 목록(BLOCKED_PATH_SUBSTRINGS)에 부분일치
    Blocked,
    /// 파일 크기가 MAX_FILE_SIZE 초과
    TooLarge,
}

impl PathGuardReject {
    /// 사용자에게 노출 가능한 고정 사유 문자열 (입력 경로/크기 미포함).
    pub fn message(self) -> &'static str {
        match self {
            PathGuardReject::TooLong => "경로가 너무 깁니다",
            PathGuardReject::Blocked => "접근이 허용되지 않은 경로입니다",
            PathGuardReject::TooLarge => "파일이 너무 큽니다 (최대 500MB)",
        }
    }
}

/// 경로 길이 상한 검사.
pub fn check_path_len(path_str: &str) -> Result<(), PathGuardReject> {
    if path_str.len() > MAX_PATH_LEN {
        return Err(PathGuardReject::TooLong);
    }
    Ok(())
}

/// canonical 경로가 민감 경로 차단 목록에 부분일치하는지 검사.
/// Windows 백슬래시를 슬래시로 정규화한 뒤 소문자 비교한다.
pub fn check_blocked(canonical: &Path) -> Result<(), PathGuardReject> {
    let canonical_str = canonical.to_string_lossy();
    let normalized = canonical_str.replace('\\', "/").to_lowercase();
    for blocked in BLOCKED_PATH_SUBSTRINGS {
        if normalized.contains(blocked) {
            return Err(PathGuardReject::Blocked);
        }
    }
    Ok(())
}

/// 파일 크기 상한 검사 (500MB).
pub fn check_file_size(size: u64) -> Result<(), PathGuardReject> {
    if size > MAX_FILE_SIZE {
        return Err(PathGuardReject::TooLarge);
    }
    Ok(())
}

// ============================================================================
// 단위 테스트
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn check_path_len_rejects_overlong() {
        let long = "a".repeat(MAX_PATH_LEN + 1);
        assert_eq!(check_path_len(&long), Err(PathGuardReject::TooLong));
        let ok = "a".repeat(MAX_PATH_LEN);
        assert!(check_path_len(&ok).is_ok());
    }

    #[test]
    fn check_blocked_rejects_sensitive_paths() {
        // .ssh / .aws / etc/shadow 등 민감 경로 차단
        assert_eq!(
            check_blocked(&PathBuf::from("/home/u/.ssh/id_rsa")),
            Err(PathGuardReject::Blocked)
        );
        assert_eq!(
            check_blocked(&PathBuf::from("/home/u/.aws/credentials")),
            Err(PathGuardReject::Blocked)
        );
        assert_eq!(
            check_blocked(&PathBuf::from("/etc/shadow")),
            Err(PathGuardReject::Blocked)
        );
        assert_eq!(
            check_blocked(&PathBuf::from("/home/u/.kube/config")),
            Err(PathGuardReject::Blocked)
        );
    }

    #[test]
    fn check_blocked_case_and_backslash_normalized() {
        // 대문자 / 백슬래시(Windows) 도 정규화 후 차단
        assert_eq!(
            check_blocked(&PathBuf::from("C:\\Users\\u\\.SSH\\id_rsa")),
            Err(PathGuardReject::Blocked)
        );
    }

    #[test]
    fn check_blocked_allows_normal_paths() {
        assert!(check_blocked(&PathBuf::from("/var/log/app/server.log")).is_ok());
        assert!(check_blocked(&PathBuf::from("/home/u/project/app.log")).is_ok());
    }

    #[test]
    fn check_file_size_rejects_over_limit() {
        assert_eq!(
            check_file_size(MAX_FILE_SIZE + 1),
            Err(PathGuardReject::TooLarge)
        );
        assert!(check_file_size(MAX_FILE_SIZE).is_ok());
        assert!(check_file_size(0).is_ok());
    }
}
