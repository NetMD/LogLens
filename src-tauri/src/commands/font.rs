use font_kit::source::SystemSource;
use std::collections::BTreeSet;

#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    let source = SystemSource::new();
    let mut names = BTreeSet::new();

    if let Ok(families) = source.all_families() {
        for family in families {
            let trimmed = family.trim().to_string();
            if !trimmed.is_empty() && !trimmed.starts_with('.') {
                names.insert(trimmed);
            }
        }
    }

    names.into_iter().collect()
}
