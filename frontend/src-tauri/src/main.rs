#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/**
 * ====== MESSY NOTES - LOCAL FILE STORAGE ======
 * 
 * This is a LOCAL-FIRST application. All data is stored on the user's computer.
 * 
 * FILE STRUCTURE:
 * ~/Documents/MessyNotes/
 * ├── notes/              ← Notes as .md files with YAML frontmatter
 * │   ├── {uuid}.md
 * │   └── {uuid}.md
 * ├── folders.json        ← Folder hierarchy
 * ├── canvas/             ← Canvas data as JSON (per-note mindmaps)
 * │   ├── {uuid}.json
 * │   └── {uuid}.json
 * ├── graph.json          ← Global graph (node positions & connections)
 * └── attachments/        ← Future: file attachments
 * 
 * NO CLOUD SYNC - Everything stays on the user's machine!
 * 
 * ===============================================
 */

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{Manager, State};
use uuid::Uuid;
use chrono::Utc;
use anyhow::{Result, Context};

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Note {
    id: String,
    title: String,
    #[serde(rename = "rawText")]
    raw_text: Option<String>,
    content: Option<serde_json::Value>,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    sticky: bool,
    ephemeral: bool,
    archived: bool,
    #[serde(rename = "type")]
    note_type: String,
    color: String,
    #[serde(rename = "folderId", skip_serializing_if = "Option::is_none")]
    folder_id: Option<String>,
    #[serde(default)]
    position: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Folder {
    id: String,
    name: String,
    #[serde(rename = "parentId", skip_serializing_if = "Option::is_none")]
    parent_id: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    #[serde(default)]
    expanded: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct GraphMetadata {
    #[serde(default)]
    nodes: serde_json::Value,
    #[serde(default)]
    edges: Vec<Edge>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Edge {
    id: String,
    source: String,
    target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    label: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CanvasData {
    nodes: serde_json::Value,
    edges: serde_json::Value,
}

struct AppState {
    data_dir: PathBuf,
}

impl AppState {
    /// Returns path to notes directory: ~/Documents/MessyNotes/notes/
    fn notes_dir(&self) -> PathBuf {
        self.data_dir.join("notes")
    }

    /// Returns path to attachments directory: ~/Documents/MessyNotes/attachments/
    fn attachments_dir(&self) -> PathBuf {
        self.data_dir.join("attachments")
    }

    /// Returns path to graph file: ~/Documents/MessyNotes/graph.json
    fn graph_file(&self) -> PathBuf {
        self.data_dir.join("graph.json")
    }

    /// Returns path to folders file: ~/Documents/MessyNotes/folders.json
    fn folders_file(&self) -> PathBuf {
        self.data_dir.join("folders.json")
    }

    /// Returns path to canvas file: ~/Documents/MessyNotes/canvas/{note_id}.json
    fn canvas_file(&self, note_id: &str) -> PathBuf {
        self.data_dir.join("canvas").join(format!("{}.json", note_id))
    }

    /// Ensures all required directories exist
    fn ensure_dirs(&self) -> Result<()> {
        fs::create_dir_all(&self.data_dir)?;
        fs::create_dir_all(self.notes_dir())?;
        fs::create_dir_all(self.attachments_dir())?;
        fs::create_dir_all(self.data_dir.join("canvas"))?;
        Ok(())
    }
}

// Initialize app data directory
#[tauri::command]
async fn init_app(app_handle: tauri::AppHandle) -> Result<String, String> {
    let state = app_handle.state::<AppState>();
    state.ensure_dirs().map_err(|e| e.to_string())?;
    
    // Return the data directory path
    Ok(state.data_dir.to_string_lossy().to_string())
}

// ==================== NOTE OPERATIONS ====================
// Each note is stored as: ~/Documents/MessyNotes/notes/{uuid}.md

#[tauri::command]
async fn get_notes(state: State<'_, AppState>) -> Result<Vec<Note>, String> {
    state.ensure_dirs().map_err(|e| e.to_string())?;
    
    let mut notes = Vec::new();
    let notes_dir = state.notes_dir();
    
    if !notes_dir.exists() {
        return Ok(notes);
    }
    
    for entry in fs::read_dir(&notes_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        
        if path.extension().and_then(|s| s.to_str()) == Some("md") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                let id = stem.to_string();
                let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
                
                // Parse frontmatter (YAML between --- delimiters)
                let (metadata, raw_text) = parse_markdown_with_frontmatter(&content);
                
                let title = metadata.get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Untitled")
                    .to_string();
                
                // CRITICAL: Use stored content if available, otherwise reconstruct from rawText
                let note_content = if let Some(stored_content) = metadata.get("content") {
                    Some(stored_content.clone())
                } else if !raw_text.is_empty() {
                    // Fallback for old notes without stored content
                    Some(serde_json::json!({
                        "type": "doc",
                        "content": [{
                            "type": "paragraph",
                            "content": [{
                                "type": "text",
                                "text": raw_text
                            }]
                        }]
                    }))
                } else {
                    Some(serde_json::json!({
                        "type": "doc",
                        "content": []
                    }))
                };
                
                notes.push(Note {
                    id,
                    title,
                    raw_text: Some(raw_text.clone()),
                    content: note_content,
                    updated_at: metadata.get("updatedAt")
                        .and_then(|v| v.as_str())
                        .unwrap_or(&Utc::now().to_rfc3339())
                        .to_string(),
                    created_at: metadata.get("createdAt")
                        .and_then(|v| v.as_str())
                        .unwrap_or(&Utc::now().to_rfc3339())
                        .to_string(),
                    sticky: metadata.get("sticky")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false),
                    ephemeral: metadata.get("ephemeral")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true),
                    archived: metadata.get("archived")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false),
                    note_type: metadata.get("type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("text")
                        .to_string(),
                    color: metadata.get("color")
                        .and_then(|v| v.as_str())
                        .unwrap_or("#ffffff")
                        .to_string(),
                    folder_id: metadata.get("folderId")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    position: metadata.get("position")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0) as i32,
                });
            }
        }
    }
    
    // Sort by position first (ascending), then by updated_at (descending)
    notes.sort_by(|a, b| {
        // First compare folder_id (group by folder)
        match (&a.folder_id, &b.folder_id) {
            (Some(f1), Some(f2)) if f1 == f2 => {
                // Same folder: sort by position, then by updated_at
                match a.position.cmp(&b.position) {
                    std::cmp::Ordering::Equal => b.updated_at.cmp(&a.updated_at),
                    other => other,
                }
            },
            (None, None) => {
                // Both in root: sort by position, then by updated_at
                match a.position.cmp(&b.position) {
                    std::cmp::Ordering::Equal => b.updated_at.cmp(&a.updated_at),
                    other => other,
                }
            },
            (None, Some(_)) => std::cmp::Ordering::Less,
            (Some(_), None) => std::cmp::Ordering::Greater,
            (Some(f1), Some(f2)) => f1.cmp(f2),
        }
    });
    
    Ok(notes)
}

#[tauri::command]
async fn get_note(id: String, state: State<'_, AppState>) -> Result<Note, String> {
    let path = state.notes_dir().join(format!("{}.md", id));
    
    if !path.exists() {
        return Err("Note not found".to_string());
    }
    
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let (metadata, raw_text) = parse_markdown_with_frontmatter(&content);
    
    let title = metadata.get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Untitled")
        .to_string();
    
    // CRITICAL: Use stored content if available, otherwise reconstruct from rawText
    let note_content = if let Some(stored_content) = metadata.get("content") {
        Some(stored_content.clone())
    } else if !raw_text.is_empty() {
        // Fallback for old notes without stored content
        Some(serde_json::json!({
            "type": "doc",
            "content": [{
                "type": "paragraph",
                "content": [{
                    "type": "text",
                    "text": raw_text
                }]
            }]
        }))
    } else {
        Some(serde_json::json!({
            "type": "doc",
            "content": []
        }))
    };
    
    Ok(Note {
        id,
        title,
        raw_text: Some(raw_text),
        content: note_content,
        updated_at: metadata.get("updatedAt")
            .and_then(|v| v.as_str())
            .unwrap_or(&Utc::now().to_rfc3339())
            .to_string(),
        created_at: metadata.get("createdAt")
            .and_then(|v| v.as_str())
            .unwrap_or(&Utc::now().to_rfc3339())
            .to_string(),
        sticky: metadata.get("sticky").and_then(|v| v.as_bool()).unwrap_or(false),
        ephemeral: metadata.get("ephemeral").and_then(|v| v.as_bool()).unwrap_or(true),
        archived: metadata.get("archived").and_then(|v| v.as_bool()).unwrap_or(false),
        note_type: metadata.get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("text")
            .to_string(),
        color: metadata.get("color")
            .and_then(|v| v.as_str())
            .unwrap_or("#ffffff")
            .to_string(),
        folder_id: metadata.get("folderId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        position: metadata.get("position")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32,
    })
}

#[tauri::command]
async fn create_note(
    title: Option<String>,
    raw_text: Option<String>,
    content: Option<serde_json::Value>,
    sticky: Option<bool>,
    ephemeral: Option<bool>,
    note_type: Option<String>,
    color: Option<String>,
    folder_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Note, String> {
    state.ensure_dirs().map_err(|e| e.to_string())?;
    
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let title = title.unwrap_or_else(|| "Untitled Thought".to_string());
    let raw_text = raw_text.unwrap_or_default();
    
    // Get max position in the target folder/root
    let all_notes = get_notes(state.clone()).await?;
    let max_position = all_notes
        .iter()
        .filter(|n| n.folder_id == folder_id)
        .map(|n| n.position)
        .max()
        .unwrap_or(-1);
    
    let note = Note {
        id: id.clone(),
        title: title.clone(),
        raw_text: Some(raw_text.clone()),
        content,
        updated_at: now.clone(),
        created_at: now.clone(),
        sticky: sticky.unwrap_or(false),
        ephemeral: ephemeral.unwrap_or(true),
        archived: false,
        note_type: note_type.unwrap_or_else(|| "text".to_string()),
        color: color.unwrap_or_else(|| "#ffffff".to_string()),
        folder_id,
        position: max_position + 1,
    };
    
    save_note(&note, &state)?;
    
    Ok(note)
}

#[tauri::command]
async fn update_note(
    id: String,
    title: Option<String>,
    raw_text: Option<String>,
    content: Option<serde_json::Value>,
    sticky: Option<bool>,
    ephemeral: Option<bool>,
    archived: Option<bool>,
    folder_id: Option<Option<String>>,
    position: Option<i32>,
    state: State<'_, AppState>,
) -> Result<Note, String> {
    let mut note = get_note(id.clone(), state.clone()).await?;
    
    if let Some(t) = title {
        note.title = t;
    }
    if let Some(rt) = raw_text {
        note.raw_text = Some(rt);
    }
    if let Some(c) = content {
        note.content = Some(c);
    }
    if let Some(s) = sticky {
        note.sticky = s;
    }
    if let Some(e) = ephemeral {
        note.ephemeral = e;
    }
    if let Some(a) = archived {
        note.archived = a;
    }
    if let Some(fid) = folder_id {
        note.folder_id = fid;
    }
    if let Some(p) = position {
        note.position = p;
    }

    note.updated_at = Utc::now().to_rfc3339();
    
    save_note(&note, &state)?;
    
    Ok(note)
}

#[tauri::command]
async fn reorder_notes(
    note_id: String,
    target_folder_id: Option<String>,
    new_position: i32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Get all notes
    let mut all_notes = get_notes(state.clone()).await?;
    
    // Find the note being moved
    let note_index = all_notes.iter().position(|n| n.id == note_id)
        .ok_or("Note not found")?;
    
    let mut moved_note = all_notes.remove(note_index);
    let old_folder_id = moved_note.folder_id.clone();
    
    // Update folder if changed
    moved_note.folder_id = target_folder_id.clone();
    
    // Filter notes in the target folder
    let mut folder_notes: Vec<Note> = all_notes
        .iter()
        .filter(|n| n.folder_id == target_folder_id)
        .cloned()
        .collect();
    
    // Insert at new position
    let insert_pos = new_position.max(0).min(folder_notes.len() as i32) as usize;
    folder_notes.insert(insert_pos, moved_note.clone());
    
    // Renumber all notes in target folder
    for (idx, note) in folder_notes.iter_mut().enumerate() {
        note.position = idx as i32;
        save_note(note, &state)?;
    }
    
    // If folder changed, renumber old folder too
    if old_folder_id != target_folder_id {
        let mut old_folder_notes: Vec<Note> = all_notes
            .iter()
            .filter(|n| n.folder_id == old_folder_id && n.id != note_id)
            .cloned()
            .collect();
        
        for (idx, note) in old_folder_notes.iter_mut().enumerate() {
            note.position = idx as i32;
            save_note(note, &state)?;
        }
    }
    
    Ok(())
}

#[tauri::command]
async fn delete_note(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let path = state.notes_dir().join(format!("{}.md", id));
    
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    
    // Also clean up from graph
    if let Ok(mut graph) = get_graph(state.clone()).await {
        // Remove edges connected to this node
        graph.edges.retain(|e| e.source != id && e.target != id);
        
        // Remove node metadata
        if let Some(obj) = graph.nodes.as_object_mut() {
            obj.remove(&id);
        }
        
        save_graph(&graph, &state)?;
    }
    
    Ok(())
}

#[tauri::command]
async fn delete_all_notes(state: State<'_, AppState>) -> Result<usize, String> {
    let notes_dir = state.notes_dir();
    let mut count = 0;
    
    if notes_dir.exists() {
        for entry in fs::read_dir(&notes_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            
            if path.extension().and_then(|s| s.to_str()) == Some("md") {
                fs::remove_file(&path).map_err(|e| e.to_string())?;
                count += 1;
            }
        }
    }
    
    // Clear graph
    let graph = GraphMetadata {
        nodes: serde_json::json!({}),
        edges: vec![],
    };
    save_graph(&graph, &state)?;
    
    Ok(count)
}

// ==================== FOLDER OPERATIONS ====================
// Folders are stored as: ~/Documents/MessyNotes/folders.json

#[tauri::command]
async fn get_folders(state: State<'_, AppState>) -> Result<Vec<Folder>, String> {
    let path = state.folders_file();
    
    if !path.exists() {
        return Ok(vec![]);
    }
    
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let folders: Vec<Folder> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse folders.json: {}", e))?;
    
    Ok(folders)
}

#[tauri::command]
async fn create_folder(
    name: String,
    parent_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Folder, String> {
    state.ensure_dirs().map_err(|e| e.to_string())?;
    
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    
    let folder = Folder {
        id: id.clone(),
        name,
        parent_id,
        created_at: now.clone(),
        updated_at: now,
        expanded: true,
    };
    
    let mut folders = get_folders(state.clone()).await?;
    folders.push(folder.clone());
    
    save_folders(&folders, &state)?;
    
    Ok(folder)
}

#[tauri::command]
async fn update_folder(
    id: String,
    name: Option<String>,
    parent_id: Option<String>,
    expanded: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Folder, String> {
    let mut folders = get_folders(state.clone()).await?;
    
    let folder = folders.iter_mut()
        .find(|f| f.id == id)
        .ok_or("Folder not found")?;
    
    if let Some(n) = name {
        folder.name = n;
    }
    if parent_id.is_some() {
        folder.parent_id = parent_id;
    }
    if let Some(e) = expanded {
        folder.expanded = e;
    }
    
    folder.updated_at = Utc::now().to_rfc3339();
    
    let updated_folder = folder.clone();
    save_folders(&folders, &state)?;
    
    Ok(updated_folder)
}

#[tauri::command]
async fn delete_folder(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut folders = get_folders(state.clone()).await?;
    
    // Move all notes in this folder to root (null folderId)
    let notes = get_notes(state.clone()).await?;
    for note in notes {
        if note.folder_id.as_ref() == Some(&id) {
            update_note(
                note.id,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(None),
                None,
                state.clone()
            ).await?;
        }
    }
    
    // Remove the folder
    folders.retain(|f| f.id != id);
    
    // Move child folders to parent
    let parent_id = folders.iter().find(|f| f.id == id).and_then(|f| f.parent_id.clone());
    for folder in folders.iter_mut() {
        if folder.parent_id.as_ref() == Some(&id) {
            folder.parent_id = parent_id.clone();
        }
    }
    
    save_folders(&folders, &state)?;
    
    Ok(())
}

// ==================== GRAPH OPERATIONS ====================
// Graph is stored as: ~/Documents/MessyNotes/graph.json

#[tauri::command]
async fn get_graph(state: State<'_, AppState>) -> Result<GraphMetadata, String> {
    let path = state.graph_file();
    
    if !path.exists() {
        return Ok(GraphMetadata {
            nodes: serde_json::json!({}),
            edges: vec![],
        });
    }
    
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let graph: GraphMetadata = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse graph.json: {}", e))?;
    
    Ok(graph)
}

#[tauri::command]
async fn save_graph_data(
    nodes: serde_json::Value,
    edges: Vec<Edge>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let graph = GraphMetadata { nodes, edges };
    save_graph(&graph, &state)
}

// ==================== CANVAS OPERATIONS ====================
// Canvas is stored as: ~/Documents/MessyNotes/canvas/{note_id}.json

#[tauri::command]
async fn get_canvas(note_id: String, state: State<'_, AppState>) -> Result<CanvasData, String> {
    let path = state.canvas_file(&note_id);
    
    if !path.exists() {
        return Ok(CanvasData {
            nodes: serde_json::json!([]),
            edges: serde_json::json!([]),
        });
    }
    
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let canvas: CanvasData = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse canvas: {}", e))?;
    
    Ok(canvas)
}

#[tauri::command]
async fn save_canvas_data(
    note_id: String,
    nodes: serde_json::Value,
    edges: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let canvas = CanvasData { nodes, edges };
    let json = serde_json::to_string_pretty(&canvas)
        .map_err(|e| format!("Failed to serialize canvas: {}", e))?;
    
    let path = state.canvas_file(&note_id);
    fs::write(&path, json).map_err(|e| e.to_string())?;
    
    Ok(())
}

// ==================== HELPER FUNCTIONS ====================

/// Saves a note to disk as a .md file with YAML frontmatter
/// Stores BOTH the TipTap content structure AND rawText for compatibility
fn save_note(note: &Note, state: &AppState) -> Result<(), String> {
    let mut metadata = serde_json::json!({
        "title": note.title,
        "updatedAt": note.updated_at,
        "createdAt": note.created_at,
        "sticky": note.sticky,
        "ephemeral": note.ephemeral,
        "archived": note.archived,
        "type": note.note_type,
        "color": note.color,
        "content": note.content,
        "position": note.position,
    });
    
    if let Some(ref folder_id) = note.folder_id {
        metadata["folderId"] = serde_json::json!(folder_id);
    }
    
    let frontmatter = serde_json::to_string_pretty(&metadata)
        .map_err(|e| e.to_string())?;
    
    let content = format!(
        "---\n{}\n---\n\n{}",
        frontmatter,
        note.raw_text.as_deref().unwrap_or("")
    );
    
    let path = state.notes_dir().join(format!("{}.md", note.id));
    fs::write(&path, content).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Saves folders to disk as JSON
fn save_folders(folders: &[Folder], state: &AppState) -> Result<(), String> {
    let json = serde_json::to_string_pretty(folders)
        .map_err(|e| format!("Failed to serialize folders: {}", e))?;
    
    let path = state.folders_file();
    fs::write(&path, json).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Saves graph data to disk as JSON
fn save_graph(graph: &GraphMetadata, state: &AppState) -> Result<(), String> {
    let json = serde_json::to_string_pretty(graph)
        .map_err(|e| format!("Failed to serialize graph: {}", e))?;
    
    let path = state.graph_file();
    fs::write(&path, json).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Parses a markdown file with YAML frontmatter
fn parse_markdown_with_frontmatter(content: &str) -> (serde_json::Value, String) {
    let parts: Vec<&str> = content.split("---").collect();
    
    if parts.len() >= 3 && parts[0].trim().is_empty() {
        // Has frontmatter
        let metadata: serde_json::Value = serde_json::from_str(parts[1].trim())
            .unwrap_or(serde_json::json!({}));
        let text = parts[2..].join("---").trim().to_string();
        (metadata, text)
    } else {
        // No frontmatter
        (serde_json::json!({}), content.to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let document_dir = tauri::api::path::document_dir()
                .context("Failed to get documents directory")?;
            
            let data_dir = document_dir.join("MessyNotes");
            
            app.manage(AppState { data_dir });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            init_app,
            get_notes,
            get_note,
            create_note,
            update_note,
            reorder_notes,
            delete_note,
            delete_all_notes,
            get_folders,
            create_folder,
            update_folder,
            delete_folder,
            get_graph,
            save_graph_data,
            get_canvas,
            save_canvas_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}