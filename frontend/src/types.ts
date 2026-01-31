/**
 * ====== TYPE DEFINITIONS ======
 * Central type definitions for the Messy Notes application
 */

// ==================== NOTE TYPES ====================

export interface Note {
  id: string;
  title: string;
  rawText?: string;
  content?: any; // TipTap JSON content
  updatedAt: string;
  createdAt: string;
  sticky: boolean;
  ephemeral: boolean;
  archived: boolean;
  type: string;
  color: string;
  folderId?: string | null;
  position: number;
}

// ==================== FOLDER TYPES ====================

export interface Folder {
  id: string;
  name: string;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
  expanded: boolean;
  position?: number;
}

// ==================== GRAPH TYPES ====================

export interface GraphNodeMetadata {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  lastVisited: number;
}

export interface GraphMetadata {
  [nodeId: string]: GraphNodeMetadata;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface GraphData {
  metadata: GraphMetadata;
  edges: Edge[];
}

// ==================== CANVAS TYPES ====================

export type CanvasNodeType = 'group' | 'card' | 'note' | 'media';
export type CanvasNodeVariant = 'default' | 'definition' | 'important' | 'formula';

export interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  variant?: CanvasNodeVariant;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  text: string;
  color: string;
  mediaUrl?: string;
  children?: CanvasNode[];
  parentId?: string;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: Edge[];
}

// ==================== CONTEXT TYPES ====================

export interface NotesContextType {
  notes: Note[];
  folders: Folder[];
  isLoading: boolean;
  lastSync: number | null;
  initialized: boolean;
  loadNotes: (showLoader?: boolean) => Promise<void>;
  loadFolders: () => Promise<void>;
  getNote: (noteId: string) => Note | undefined;
  updateNoteLocal: (noteId: string, updates: Partial<Note>) => void;
  updateNote: (noteId: string, updates: Partial<Note>) => Promise<void>;
  createNote: (data?: Partial<Note>) => Promise<Note>;
  deleteNote: (noteId: string) => Promise<void>;
  deleteAllNotes: () => Promise<void>;
  createFolder: (name: string, parentId?: string | null) => Promise<Folder>;
  updateFolder: (folderId: string, updates: Partial<Folder>) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  moveNoteToFolder: (noteId: string, folderId: string | null) => Promise<void>;
  reorderNotes: (noteId: string, targetFolderId: string | null, newPosition: number) => Promise<void>;
  refresh: () => Promise<void>;
}

// ==================== SIDEBAR TYPES ====================

export type DragItemType = 'note' | 'folder';
export type DropPosition = 'before' | 'after' | 'inside';

export interface DragData {
  type: DragItemType;
  id: string;
}

export interface DragOverData {
  type: DragItemType;
  id: string;
}

// ==================== FILE TREE TYPES ====================

export interface FileTreeNote extends Note {
  type: 'note';
}

export interface FileTreeFolder extends Folder {
  type: 'folder';
  children: FileTreeFolder[];
  notes: FileTreeNote[];
}

export type FileTreeItem = FileTreeNote | FileTreeFolder;

// ==================== COMPONENT PROP TYPES ====================

export interface SidebarProps {
  currentNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onNewNote: () => void;
}

export interface EditorPageProps {
  noteId: string;
}
