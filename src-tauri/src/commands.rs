use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, WebviewWindow};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

#[derive(Debug, Serialize, Deserialize)]
pub struct ArtworkMetadata {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub year: String,
    pub desc: String,
    pub filename: String,
    pub uploaded: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SeedArtwork {
    pub title: String,
    pub artist: String,
    pub year: String,
    pub desc: String,
    pub filename: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FirstRunStatus {
    pub is_first_run: bool,
    pub library_path: Option<String>,
}

/* ============ Helpers ============ */

fn ensure_artworks_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let artworks = dir.join("artworks");
    fs::create_dir_all(&artworks).map_err(|e| e.to_string())?;
    Ok(artworks)
}

fn seed_definitions() -> Vec<SeedArtwork> {
    vec![
        SeedArtwork {
            title: "The Starry Night".into(),
            artist: "Vincent van Gogh".into(),
            year: "1889".into(),
            desc: "Painted from the east-facing window of his asylum room at Saint-Rémy-de-Provence, Van Gogh transformed the night sky into a churning vision of eleven swirling stars and a cypress flame. The village below lies still and sleeping — turbulence and peace coexisting in a single breath.".into(),
            filename: "starry-night.jpg".into(),
        },
        SeedArtwork {
            title: "Mona Lisa".into(),
            artist: "Leonardo da Vinci".into(),
            year: "c. 1503–1506".into(),
            desc: "Leonardo's sfumato dissolves every contour into smoky shadow, leaving Lisa Gherardini's expression permanently unresolved — serene or amused, no two glances agree. Arguably the most studied, most parodied, and most visited portrait ever painted.".into(),
            filename: "mona-lisa.jpg".into(),
        },
        SeedArtwork {
            title: "Girl with a Pearl Earring".into(),
            artist: "Johannes Vermeer".into(),
            year: "c. 1665".into(),
            desc: "Often called the 'Mona Lisa of the North', Vermeer's tronie captures an anonymous girl turning toward us in soft, sourceless light. The pearl gleams against darkness — an emblem of fleeting intimacy suspended in silence.".into(),
            filename: "girl-pearl-earring.jpg".into(),
        },
        SeedArtwork {
            title: "The Great Wave off Kanagawa".into(),
            artist: "Katsushika Hokusai".into(),
            year: "c. 1831".into(),
            desc: "Hokusai's towering claw of Prussian blue dominates the print — a wave that threatens to engulf three fishing boats, while Mount Fuji sits small and serene in the background. Part of the Thirty-six Views of Mount Fuji series, it is arguably the most recognized work of Japanese art in the world.".into(),
            filename: "great-wave.jpg".into(),
        },
    ]
}

/* ============ Commands ============ */

#[tauri::command]
pub fn get_app_data_dir(app: AppHandle) -> Result<String, String> {
    let dir = ensure_artworks_dir(&app)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_image_files(app: AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let files = app
        .dialog()
        .file()
        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif"])
        .blocking_pick_files();

    Ok(files
        .unwrap_or_default()
        .into_iter()
        .map(|p| p.to_string())
        .collect())
}

#[tauri::command]
pub fn copy_image_to_app_data(app: AppHandle, src_path: String, filename: String) -> Result<String, String> {
    let dir = ensure_artworks_dir(&app)?;
    let dest = dir.join(&filename);
    fs::copy(&src_path, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn save_artwork_metadata(app: AppHandle, metadata: ArtworkMetadata) -> Result<(), String> {
    let dir = ensure_artworks_dir(&app)?;
    let meta_path = dir.join("metadata.json");

    let mut artworks: Vec<ArtworkMetadata> = if meta_path.exists() {
        let content = fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    artworks.retain(|a| a.id != metadata.id);
    artworks.push(metadata);

    let content = serde_json::to_string_pretty(&artworks).map_err(|e| e.to_string())?;
    fs::write(&meta_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_artwork_metadata(app: AppHandle) -> Result<Vec<ArtworkMetadata>, String> {
    let dir = ensure_artworks_dir(&app)?;
    let meta_path = dir.join("metadata.json");

    if !meta_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
    let artworks = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(artworks)
}

#[tauri::command]
pub fn delete_artwork(app: AppHandle, id: String) -> Result<(), String> {
    let dir = ensure_artworks_dir(&app)?;
    let meta_path = dir.join("metadata.json");
    if !meta_path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
    let mut artworks: Vec<ArtworkMetadata> = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    if let Some(idx) = artworks.iter().position(|a| a.id == id) {
        let img_path = dir.join(&artworks[idx].filename);
        if img_path.exists() {
            let _ = fs::remove_file(&img_path);
        }
        artworks.remove(idx);
        let content = serde_json::to_string_pretty(&artworks).map_err(|e| e.to_string())?;
        fs::write(&meta_path, content).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn save_image(app: AppHandle, data_url: String) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;

    let base64_data = data_url
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(&data_url);
    let bytes = BASE64.decode(base64_data).map_err(|e| e.to_string())?;

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let chosen = app
        .dialog()
        .file()
        .add_filter("PNG Image", &["png"])
        .set_file_name(format!("noir-gallery-{}.png", ts))
        .blocking_save_file();

    if let Some(path) = chosen {
        let out = path.to_string();
        fs::write(out, bytes).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_fullscreen(window: WebviewWindow) -> Result<bool, String> {
    let is_fs = window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(!is_fs).map_err(|e| e.to_string())?;
    Ok(!is_fs)
}

#[tauri::command]
pub fn get_seed_artworks() -> Result<Vec<SeedArtwork>, String> {
    Ok(seed_definitions())
}

#[tauri::command]
pub fn check_first_run(app: AppHandle) -> Result<FirstRunStatus, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let flag = app_data.join(".first_run_complete");
    let lib_file = app_data.join("library_path.txt");

    let is_first_run = !flag.exists();
    let library_path = if lib_file.exists() {
        Some(
            fs::read_to_string(&lib_file)
                .map_err(|e| e.to_string())?
                .trim()
                .to_string(),
        )
    } else {
        None
    };

    Ok(FirstRunStatus {
        is_first_run,
        library_path,
    })
}

#[tauri::command]
pub fn pick_library_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let folder = app
        .dialog()
        .file()
        .set_title("Choose your Gallery Library folder")
        .blocking_pick_folder();

    Ok(folder.map(|p| p.to_string()))
}

#[tauri::command]
pub fn complete_first_run(app: AppHandle, library_path: String) -> Result<(), String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&app_data).map_err(|e| e.to_string())?;
    let flag = app_data.join(".first_run_complete");
    let lib_file = app_data.join("library_path.txt");

    fs::write(&flag, "done").map_err(|e| e.to_string())?;
    fs::write(&lib_file, &library_path).map_err(|e| e.to_string())?;

    let lib_path = PathBuf::from(&library_path);
    fs::create_dir_all(&lib_path).map_err(|e| e.to_string())?;
    fs::create_dir_all(lib_path.join("artworks")).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn import_seed_artworks(library_path: String) -> Result<Vec<ArtworkMetadata>, String> {
    let artworks = PathBuf::from(&library_path).join("artworks");
    fs::create_dir_all(&artworks).map_err(|e| e.to_string())?;

    let mut imported = Vec::new();

    for seed in seed_definitions() {
        let bytes: &[u8] = match seed.filename.as_str() {
            "starry-night.jpg" => include_bytes!("../assets/seed/starry-night.jpg"),
            "mona-lisa.jpg" => include_bytes!("../assets/seed/mona-lisa.jpg"),
            "girl-pearl-earring.jpg" => include_bytes!("../assets/seed/girl-pearl-earring.jpg"),
            "great-wave.jpg" => include_bytes!("../assets/seed/great-wave.jpg"),
            _ => continue,
        };

        let dest = artworks.join(&seed.filename);
        fs::write(&dest, bytes).map_err(|e| e.to_string())?;

        imported.push(ArtworkMetadata {
            id: Uuid::new_v4().to_string(),
            title: seed.title,
            artist: seed.artist,
            year: seed.year,
            desc: seed.desc,
            filename: seed.filename,
            uploaded: false,
        });
    }

    let meta_path = artworks.join("metadata.json");
    let content = serde_json::to_string_pretty(&imported).map_err(|e| e.to_string())?;
    fs::write(&meta_path, content).map_err(|e| e.to_string())?;

    Ok(imported)
}