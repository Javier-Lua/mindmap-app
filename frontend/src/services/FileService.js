import { invoke } from '@tauri-apps/api/tauri';

/**
 * ====== FILE SERVICE ======
 * 
 * This service handles all file operations with the Tauri backend.
 * 
 * Files are stored in:
 * - Notes: ~/Documents/MessyNotes/notes/{id}.md
 * - Folders: ~/Documents/MessyNotes/folders.json
 * - Graph: ~/Documents/MessyNotes/graph.json
 * - Canvas: ~/Documents/MessyNotes/canvas/{id}.json
 * 
 * All operations are synchronous file I/O on the user's local disk.
 * No network requests, no cloud sync.
 * 
 * ==========================
 */

class FileService {
  async init() {
    try {
      const dataDir = await invoke('init_app');
      console.log('App initialized, data directory:', dataDir);
      return dataDir;
    } catch (error) {
      console.error('Failed to initialize app:', error);
      throw error;
    }
  }

  // ==================== NOTES ====================
  
  async getNotes() {
    try {
      return await invoke('get_notes');
    } catch (error) {
      console.error('Failed to get notes:', error);
      throw error;
    }
  }

  async getNote(id) {
    try {
      return await invoke('get_note', { id });
    } catch (error) {
      console.error('Failed to get note:', error);
      throw error;
    }
  }

  async createNote(data) {
    try {
      return await invoke('create_note', {
        title: data.title,
        rawText: data.rawText || '',
        content: data.content,
        sticky: data.sticky,
        ephemeral: data.ephemeral,
        noteType: data.type,
        color: data.color,
        folderId: data.folderId || null,
      });
    } catch (error) {
      console.error('Failed to create note:', error);
      throw error;
    }
  }

  async updateNote(id, updates) {
    try {
      return await invoke('update_note', {
        id,
        title: updates.title,
        rawText: updates.rawText || updates.plainText || '',
        content: updates.content,
        sticky: updates.sticky,
        ephemeral: updates.ephemeral,
        archived: updates.archived,
        folderId: updates.folderId !== undefined ? updates.folderId : null,
        position: updates.position,
      });
    } catch (error) {
      console.error('Failed to update note:', error);
      throw error;
    }
  }

  async reorderNotes(noteId, targetFolderId, newPosition) {
    try {
      await invoke('reorder_notes', {
        noteId,
        targetFolderId,
        newPosition,
      });
    } catch (error) {
      console.error('Failed to reorder notes:', error);
      throw error;
    }
  }

  async deleteNote(id) {
    try {
      await invoke('delete_note', { id });
    } catch (error) {
      console.error('Failed to delete note:', error);
      throw error;
    }
  }

  async deleteAllNotes() {
    try {
      return await invoke('delete_all_notes');
    } catch (error) {
      console.error('Failed to delete all notes:', error);
      throw error;
    }
  }

  // ==================== FOLDERS ====================
  
  async getFolders() {
    try {
      return await invoke('get_folders');
    } catch (error) {
      console.error('Failed to get folders:', error);
      return [];
    }
  }

  async createFolder(name, parentId = null) {
    try {
      return await invoke('create_folder', { name, parentId });
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw error;
    }
  }

  async updateFolder(id, updates) {
    try {
      return await invoke('update_folder', {
        id,
        name: updates.name,
        parentId: updates.parentId !== undefined ? updates.parentId : null,
        expanded: updates.expanded,
      });
    } catch (error) {
      console.error('Failed to update folder:', error);
      throw error;
    }
  }

  async deleteFolder(id) {
    try {
      await invoke('delete_folder', { id });
    } catch (error) {
      console.error('Failed to delete folder:', error);
      throw error;
    }
  }

  // ==================== GRAPH ====================
  
  async getGraph() {
    try {
      return await invoke('get_graph');
    } catch (error) {
      console.error('Failed to get graph:', error);
      return { nodes: {}, edges: [] };
    }
  }

  async saveGraph(nodes, edges) {
    try {
      await invoke('save_graph_data', { nodes, edges });
    } catch (error) {
      console.error('Failed to save graph:', error);
      throw error;
    }
  }

  // ==================== CANVAS ====================
  
  async getCanvas(noteId) {
    try {
      return await invoke('get_canvas', { noteId });
    } catch (error) {
      console.error('Failed to get canvas:', error);
      return { nodes: [], edges: [] };
    }
  }

  async saveCanvas(noteId, nodes, edges) {
    try {
      await invoke('save_canvas_data', { noteId, nodes, edges });
    } catch (error) {
      console.error('Failed to save canvas:', error);
      throw error;
    }
  }
}

export default new FileService();