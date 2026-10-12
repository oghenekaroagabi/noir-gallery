use std::fs;
use std::path::PathBuf;
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

fn get_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let artworks_dir = dir.join("artworks");
    fs::create_dir_all(&artworks_dir).map_err(|e| e.to_string())?;
    Ok(artworks_dir)
}

#[tauri::command]
async fn get_app_data_dir(app: AppHandle) -> Result<String, String> {
    let dir = get_app_data_dir(&app)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
async fn open_image_files(app: AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let files = app.dialog()
        .file()
        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif"])
        .pick_files()
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    
    Ok(files.into_iter().map(|p| p.to_string()).collect())
}

#[tauri::command]
async fn copy_image_to_app_data(app: AppHandle, src_path: String, filename: String) -> Result<String, String> {
    let artworks_dir = get_app_data_dir(&app)?;
    let dest_path = artworks_dir.join(&filename);
    
    fs::copy(&src_path, &dest_path).map_err(|e| e.to_string())?;
    
    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn save_artwork_metadata(app: AppHandle, metadata: ArtworkMetadata) -> Result<(), String> {
    let artworks_dir = get_app_data_dir(&app)?;
    let meta_path = artworks_dir.join("metadata.json");
    
    let mut artworks: Vec<ArtworkMetadata> = if meta_path.exists() {
        let content = fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };
    
    // Remove existing if updating
    artworks.retain(|a| a.id != metadata.id);
    artworks.push(metadata);
    
    let content = serde_json::to_string_pretty(&artworks).map_err(|e| e.to_string())?;
    fs::write(&meta_path, content).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn load_artwork_metadata(app: AppHandle) -> Result<Vec<ArtworkMetadata>, String> {
    let artworks_dir = get_app_data_dir(&app)?;
    let meta_path = artworks_dir.join("metadata.json");
    
    if !meta_path.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
    let artworks = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    
    Ok(artworks)
}

#[tauri::command]
async fn delete_artwork(app: AppHandle, id: String) -> Result<(), String> {
    let artworks_dir = get_app_data_dir(&app)?;
    let meta_path = artworks_dir.join("metadata.json");
    
    // Load metadata to get filename
    let content = fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
    let mut artworks: Vec<ArtworkMetadata> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    
    if let Some(idx) = artworks.iter().position(|a| a.id == id) {
        let artwork = &artworks[idx];
        let img_path = artworks_dir.join(&artwork.filename);
        if img_path.exists() {
            fs::remove_file(&img_path).map_err(|e| e.to_string())?;
        }
        artworks.remove(idx);
        
        let content = serde_json::to_string_pretty(&artworks).map_err(|e| e.to_string())?;
        fs::write(&meta_path, content).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
async fn save_image(app: AppHandle, window: WebviewWindow, data_url: String) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;
    
    // Extract base64 data from data URL
    let base64_data = data_url.strip_prefix("data:image/png;base64,").unwrap_or(&data_url);
    let bytes = BASE64.decode(base64_data).map_err(|e| e.to_string())?;
    
    let file_path = app.dialog()
        .file()
        .add_filter("PNG Image", &["png"])
        .set_file_name(format!("noir-gallery-{}.png", chrono::Local::now().format("%Y%m%d-%H%M%S")))
        .save_file()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("User cancelled")?;
    
    fs::write(&file_path, bytes).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn toggle_fullscreen(window: WebviewWindow) -> Result<bool, String> {
    let is_fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(!is_fullscreen).map_err(|e| e.to_string())?;
    Ok(!is_fullscreen)
}

#[tauri::command]
async fn get_seed_artworks() -> Result<Vec<SeedArtwork>, String> {
    Ok(vec![
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
    ])
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FirstRunStatus {
    pub is_first_run: bool,
    pub library_path: Option<String>,
}

#[tauri::command]
async fn check_first_run(app: AppHandle) -> Result<FirstRunStatus, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let flag_path = app_data.join(".first_run_complete");
    let library_path_file = app_data.join("library_path.txt");
    
    let is_first_run = !flag_path.exists();
    let library_path = if library_path_file.exists() {
        Some(fs::read_to_string(&library_path_file).map_err(|e| e.to_string())?.trim().to_string())
    } else {
        None
    };
    
    Ok(FirstRunStatus { is_first_run, library_path })
}

#[tauri::command]
async fn pick_library_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let folder = app.dialog()
        .file()
        .set_title("Choose your Gallery Library folder")
        .pick_folder()
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(folder.map(|p| p.to_string()))
}

#[tauri::command]
async fn complete_first_run(app: AppHandle, library_path: String) -> Result<(), String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let flag_path = app_data.join(".first_run_complete");
    let library_path_file = app_data.join("library_path.txt");
    
    fs::write(&flag_path, "done").map_err(|e| e.to_string())?;
    fs::write(&library_path_file, library_path).map_err(|e| e.to_string())?;
    
    // Also create the library folder structure
    let lib_path = PathBuf::from(library_path);
    fs::create_dir_all(&lib_path).map_err(|e| e.to_string())?;
    fs::create_dir_all(lib_path.join("artworks")).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn import_seed_artworks(app: AppHandle, library_path: String) -> Result<Vec<ArtworkMetadata>, String> {
    let seed_artworks = get_seed_artworks().await?;
    let lib_path = PathBuf::from(library_path);
    let artworks_dir = lib_path.join("artworks");
    let meta_path = artworks_dir.join("metadata.json");
    
    fs::create_dir_all(&artworks_dir).map_err(|e| e.to_string())?;
    
    let mut imported = Vec::new();
    
    for seed in seed_artworks {
        let src_path = PathBuf::from("src-tauri/assets/seed").join(&seed.filename);
        let dest_path = artworks_dir.join(&seed.filename);
        
        // Copy seed image if it exists
        if src_path.exists() {
            fs::copy(&src_path, &dest_path).map_err(|e| e.to_string())?;
        }
        
        let metadata = ArtworkMetadata {
            id: Uuid::new_v4().to_string(),
            title: seed.title,
            artist: seed.artist,
            year: seed.year,
            desc: seed.desc,
            filename: seed.filename,
            uploaded: false,
        };
        
        imported.push(metadata);
    }
    
    // Save metadata
    let content = serde_json::to_string_pretty(&imported).map_err(|e| e.to_string())?;
    fs::write(&meta_path, content).map_err(|e| e.to_string())?;
    
    Ok(imported)
}

