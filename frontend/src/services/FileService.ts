import { invoke } from '@tauri-apps/api/tauri';
import type { Note, Folder, GraphData, GraphMetadata, Edge, CanvasData, CanvasNode } from '../types';

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

interface CreateNoteData {
  title?: string;
  rawText?: string;
  content?: any;
  sticky?: boolean;
  ephemeral?: boolean;
  type?: string;
  color?: string;
  folderId?: string | null;
}

interface UpdateNoteData {
  title?: string;
  rawText?: string;
  plainText?: string;
  content?: any;
  sticky?: boolean;
  ephemeral?: boolean;
  archived?: boolean;
  folderId?: string | null;
  position?: number;
}

interface UpdateFolderData {
  name?: string;
  parentId?: string | null;
  expanded?: boolean;
}

class FileService {
  async init(): Promise<string> {
    try {
      const dataDir = await invoke<string>('init_app');
      console.log('App initialized, data directory:', dataDir);
      return dataDir;
    } catch (error) {
      console.error('Failed to initialize app:', error);
      throw error;
    }
  }

  // ==================== NOTES ====================

  async getNotes(): Promise<Note[]> {
    try {
      return await invoke<Note[]>('get_notes');
    } catch (error) {
      console.error('Failed to get notes:', error);
      throw error;
    }
  }

  async getNote(id: string): Promise<Note> {
    try {
      return await invoke<Note>('get_note', { id });
    } catch (error) {
      console.error('Failed to get note:', error);
      throw error;
    }
  }

  async createNote(data: CreateNoteData = {}): Promise<Note> {
    try {
      return await invoke<Note>('create_note', {
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

  async updateNote(id: string, updates: UpdateNoteData): Promise<Note> {
    try {
      return await invoke<Note>('update_note', {
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

  async reorderNotes(noteId: string, targetFolderId: string | null, newPosition: number): Promise<void> {
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

  async deleteNote(id: string): Promise<void> {
    try {
      await invoke('delete_note', { id });
    } catch (error) {
      console.error('Failed to delete note:', error);
      throw error;
    }
  }

  async deleteAllNotes(): Promise<void> {
    try {
      await invoke('delete_all_notes');
    } catch (error) {
      console.error('Failed to delete all notes:', error);
      throw error;
    }
  }

  // ==================== FOLDERS ====================

  async getFolders(): Promise<Folder[]> {
    try {
      return await invoke<Folder[]>('get_folders');
    } catch (error) {
      console.error('Failed to get folders:', error);
      return [];
    }
  }

  async createFolder(name: string, parentId: string | null = null): Promise<Folder> {
    try {
      return await invoke<Folder>('create_folder', { name, parentId });
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw error;
    }
  }

  async updateFolder(id: string, updates: UpdateFolderData): Promise<Folder> {
    try {
      return await invoke<Folder>('update_folder', {
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

  async deleteFolder(id: string): Promise<void> {
    try {
      await invoke('delete_folder', { id });
    } catch (error) {
      console.error('Failed to delete folder:', error);
      throw error;
    }
  }

  // ==================== GRAPH ====================

  async getGraph(): Promise<GraphData> {
    try {
      return await invoke<GraphData>('get_graph');
    } catch (error) {
      console.error('Failed to get graph:', error);
      return { metadata: {}, edges: [] };
    }
  }

  async saveGraph(nodes: GraphMetadata, edges: Edge[]): Promise<void> {
    try {
      await invoke('save_graph_data', { nodes, edges });
    } catch (error) {
      console.error('Failed to save graph:', error);
      throw error;
    }
  }

  // ==================== CANVAS ====================

  async getCanvas(noteId: string): Promise<CanvasData> {
    try {
      return await invoke<CanvasData>('get_canvas', { noteId });
    } catch (error) {
      console.error('Failed to get canvas:', error);
      return { nodes: [], edges: [] };
    }
  }

  async saveCanvas(noteId: string, nodes: CanvasNode[], edges: Edge[]): Promise<void> {
    try {
      await invoke('save_canvas_data', { noteId, nodes, edges });
    } catch (error) {
      console.error('Failed to save canvas:', error);
      throw error;
    }
  }
}

export default new FileService();
