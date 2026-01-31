import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  FileText, Network, Search, Plus, Folder,
  ChevronRight, LayoutGrid, RefreshCw, Trash2, Edit3,
  Star, FolderPlus, FolderOpen, Sun, Moon, X,
  ChevronsDownUp
} from 'lucide-react';
import { useNotes } from '../contexts/NotesContext';
import type { SidebarProps, FileTreeFolder, FileTreeItem, FileTreeNote } from '../types';

const FOLDER_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

function getFolderColor(folderId: string): string {
  let hash = 0;
  for (let i = 0; i < folderId.length; i++) {
    hash = folderId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return FOLDER_COLORS[Math.abs(hash) % FOLDER_COLORS.length];
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface ContextMenuState {
  x: number;
  y: number;
  type: 'note' | 'folder';
  id: string;
}

// Draggable Note Component
function DraggableNote({ note, depth, isSelected, onClick, onContextMenu }: any) {
  const isPinned = note.sticky;

  return (
    <div
      style={{ paddingLeft: `${depth * 16 + 20}px` }}
      onClick={() => onClick()}
      onContextMenu={onContextMenu}
      className={`sb-note${isSelected ? ' selected' : ''}${isPinned ? ' pinned' : ''}`}
    >
      <FileText size={14} className="sb-note-icon" />
      <span className="sb-note-title">{note.title}</span>
    </div>
  );
}

// Draggable Folder Component
function DraggableFolder({
  folder,
  depth,
  isExpanded,
  isEditing,
  editingFolderName,
  onToggle,
  onEditChange,
  onEditBlur,
  onEditKeyDown,
  onContextMenu,
  children
}: any) {
  const folderColor = getFolderColor(folder.id);

  return (
    <div>
      <div
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={(e) => {
          if (!isEditing) onToggle(e);
        }}
        onContextMenu={onContextMenu}
        className="sb-folder"
      >
        <ChevronRight
          size={14}
          className={`sb-chevron${isExpanded ? ' expanded' : ''}`}
        />
        <div style={{ color: folderColor, flexShrink: 0, display: 'flex' }}>
          {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
        </div>

        {isEditing ? (
          <input
            autoFocus
            type="text"
            value={editingFolderName}
            onChange={onEditChange}
            onBlur={onEditBlur}
            onKeyDown={onEditKeyDown}
            className="sb-rename-input"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="sb-folder-name">{folder.name}</span>
        )}
        <span className="sb-folder-badge">{folder.notes.length}</span>
      </div>

      {isExpanded && children}
    </div>
  );
}

function Sidebar({ currentNoteId, onSelectNote, onNewNote }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { notes, folders, loadNotes, loadFolders, deleteNote, createFolder, updateFolder, deleteFolder, moveNoteToFolder, updateNote, reorderNotes, lastSync, initialized } = useNotes();

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside' | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // dnd-kit sensors - using PointerSensor for better Tauri compatibility
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    })
  );

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleScroll = () => setContextMenu(null);
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
    if (!showSearch) {
      setSearchQuery('');
    }
  }, [showSearch]);

  useEffect(() => {
    const expanded = new Set<string>();
    folders.forEach(f => {
      if (f.expanded) expanded.add(f.id);
    });
    setExpandedFolders(expanded);
  }, [folders]);

  useEffect(() => {
    if (!initialized) return;
    const now = Date.now();
    const isStale = !lastSync || (now - lastSync) > 5000;
    if (isStale && notes.length === 0 && folders.length === 0 && !lastSync) {
      loadNotes(true);
      loadFolders();
    }
    const interval = setInterval(() => {
      loadNotes(false);
      loadFolders();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadNotes, loadFolders, lastSync, notes.length, folders.length, initialized]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadNotes(false), loadFolders()]);
    setIsRefreshing(false);
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Delete this note?')) return;
    await deleteNote(noteId);
    if (currentNoteId === noteId) {
      navigate('/');
    }
  };

  const handleTogglePin = async (noteId: string, currentlyPinned: boolean) => {
    try {
      await updateNote(noteId, { sticky: !currentlyPinned });
    } catch (error) {
      console.error('Failed to toggle pin:', error);
    }
  };

  const handleNoteClick = (noteId: string) => {
    if (currentNoteId === noteId) return;
    onSelectNote(noteId);
  };

  const toggleFolder = (folderId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
        updateFolder(folderId, { expanded: false });
      } else {
        next.add(folderId);
        updateFolder(folderId, { expanded: true });
      }
      return next;
    });
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder(newFolderName.trim());
      setNewFolderName('');
      setShowNewFolderInput(false);
    } catch (error) {
      alert('Failed to create folder: ' + (error as Error).message);
    }
  };

  const handleRenameFolder = async (folderId: string) => {
    if (!editingFolderName.trim()) return;
    try {
      await updateFolder(folderId, { name: editingFolderName.trim() });
      setEditingFolderId(null);
      setEditingFolderName('');
    } catch (error) {
      alert('Failed to rename folder: ' + (error as Error).message);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm('Delete this folder? Notes will be moved to root.')) return;
    try {
      await deleteFolder(folderId);
    } catch (error) {
      alert('Failed to delete folder: ' + (error as Error).message);
    }
  };

  const collapseAllFolders = () => {
    setExpandedFolders(new Set());
    folders.forEach(f => updateFolder(f.id, { expanded: false }));
  };

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  };

  const isDarkMode = () => document.documentElement.getAttribute('data-theme') === 'dark';

  const handleContextMenu = (e: React.MouseEvent, type: 'note' | 'folder', id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
  };

  // dnd-kit event handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    console.log('🎯 DragStart:', active.id);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    
    if (!over) {
      setOverId(null);
      setDropPosition(null);
      if (expandTimerRef.current) {
        clearTimeout(expandTimerRef.current);
        expandTimerRef.current = null;
      }
      return;
    }

    const overId = over.id as string;
    setOverId(overId);

    // Determine drop position based on the drag position
    const overRect = over.rect;
    if (overRect) {
      const overMiddleY = overRect.top + overRect.height / 2;
      const activatorEvent = event.activatorEvent as MouseEvent | PointerEvent;
      const pointerY = activatorEvent.clientY;

      // Check if over is a folder
      const overFolder = folders.find(f => f.id === overId);
      
      if (overFolder) {
        // For folders: inside (middle), before (top), after (bottom)
        const topThreshold = overRect.top + overRect.height * 0.25;
        const bottomThreshold = overRect.top + overRect.height * 0.75;
        
        if (pointerY < topThreshold) {
          setDropPosition('before');
        } else if (pointerY > bottomThreshold) {
          setDropPosition('after');
        } else {
          setDropPosition('inside');
          // Auto-expand folder after hovering
          if (expandTimerRef.current) {
            clearTimeout(expandTimerRef.current);
          }
          expandTimerRef.current = setTimeout(() => {
            setExpandedFolders(prev => {
              if (prev.has(overId)) return prev;
              const next = new Set(prev);
              next.add(overId);
              updateFolder(overId, { expanded: true });
              return next;
            });
          }, 600);
        }
      } else {
        // For notes: before or after only
        setDropPosition(pointerY < overMiddleY ? 'before' : 'after');
        if (expandTimerRef.current) {
          clearTimeout(expandTimerRef.current);
          expandTimerRef.current = null;
        }
      }
    }

    console.log('🎯 DragOver:', active.id, '→', overId, dropPosition);
  }, [folders, dropPosition, updateFolder]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    console.log('📦 DragEnd:', active.id, '→', over?.id, dropPosition);

    if (expandTimerRef.current) {
      clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }

    setActiveId(null);
    setOverId(null);
    setDropPosition(null);

    if (!over) return;

    const draggedId = active.id as string;
    const targetId = over.id as string;
    
    if (draggedId === targetId) return;

    const draggedNote = notes.find(n => n.id === draggedId);
    const draggedFolder = folders.find(f => f.id === draggedId);
    const targetNote = notes.find(n => n.id === targetId);
    const targetFolder = folders.find(f => f.id === targetId);

    try {
      if (draggedNote) {
        // Dragging a note
        if (targetFolder && dropPosition === 'inside') {
          // Move note into folder
          await moveNoteToFolder(draggedId, targetId);
          setExpandedFolders(prev => {
            const next = new Set(prev);
            next.add(targetId);
            return next;
          });
          updateFolder(targetId, { expanded: true });
        } else if (targetNote) {
          // Reorder note relative to another note
          const targetFolderId = targetNote.folderId || null;
          const folderNotes = notes
            .filter(n => (n.folderId || null) === targetFolderId)
            .sort((a, b) => (a.position || 0) - (b.position || 0));
          const targetIndex = folderNotes.findIndex(n => n.id === targetId);
          if (targetIndex === -1) return;
          let newPosition = dropPosition === 'before' ? targetIndex : targetIndex + 1;
          const draggedIndex = folderNotes.findIndex(n => n.id === draggedId);
          if (draggedIndex !== -1 && draggedIndex < newPosition) newPosition--;
          await reorderNotes(draggedId, targetFolderId, newPosition);
        } else if (targetFolder) {
          // Move note to same level as folder (before/after)
          await moveNoteToFolder(draggedId, targetFolder.parentId || null);
        }
      } else if (draggedFolder) {
        // Dragging a folder
        if (targetFolder && dropPosition === 'inside') {
          // Move folder into another folder
          if (draggedId === targetId) return;
          // Check for circular reference
          let isDescendant = false;
          let checkFolder = targetFolder;
          while (checkFolder && checkFolder.parentId) {
            if (checkFolder.parentId === draggedId) { isDescendant = true; break; }
            checkFolder = folders.find(f => f.id === checkFolder!.parentId!)!;
          }
          if (isDescendant) {
            alert('Cannot move a folder into its own subfolder');
            return;
          }
          await updateFolder(draggedId, { parentId: targetId });
          setExpandedFolders(prev => {
            const next = new Set(prev);
            next.add(targetId);
            return next;
          });
          updateFolder(targetId, { expanded: true });
        } else if (targetFolder) {
          // Move folder to same level as target folder
          await updateFolder(draggedId, { parentId: targetFolder.parentId || null });
        } else if (targetNote && targetNote.folderId) {
          // Move folder to same level as note's folder
          const noteFolder = folders.find(f => f.id === targetNote.folderId!);
          await updateFolder(draggedId, { parentId: noteFolder?.parentId || null });
        } else {
          // Move to root
          await updateFolder(draggedId, { parentId: null });
        }
      }
      await Promise.all([loadNotes(false), loadFolders()]);
    } catch (error) {
      console.error('Drop failed:', error);
      alert('Failed to move item: ' + (error as Error).message);
      await Promise.all([loadNotes(false), loadFolders()]);
    }
  }, [dropPosition, notes, folders, moveNoteToFolder, reorderNotes, updateFolder, loadNotes, loadFolders]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setOverId(null);
    setDropPosition(null);
    if (expandTimerRef.current) {
      clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
  }, []);

  const buildFileTree = (): FileTreeItem[] => {
    let filteredNotes = notes.filter(n =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const filteredFolders = [...folders];

    const folderMap = new Map<string, FileTreeFolder>();
    filteredFolders.forEach(folder => {
      folderMap.set(folder.id, {
        ...folder,
        type: 'folder' as const,
        children: [],
        notes: []
      });
    });

    filteredNotes.forEach(note => {
      if (note.folderId && folderMap.has(note.folderId)) {
        folderMap.get(note.folderId)!.notes.push({ ...note, type: 'note' as const });
      }
    });

    folderMap.forEach(folder => {
      folder.notes.sort((a, b) => (a.position || 0) - (b.position || 0));
    });

    const tree: FileTreeFolder[] = [];
    const rootNotes: FileTreeNote[] = filteredNotes
      .filter(n => !n.folderId)
      .map(n => ({ ...n, type: 'note' as const }))
      .sort((a, b) => (a.position || 0) - (b.position || 0));

    filteredFolders.forEach(folder => {
      const node = folderMap.get(folder.id)!;
      if (folder.parentId && folderMap.has(folder.parentId)) {
        folderMap.get(folder.parentId)!.children.push(node);
      } else {
        tree.push(node);
      }
    });

    const sortedFolders = tree.sort((a, b) => {
      const posA = a.position ?? Number.MAX_SAFE_INTEGER;
      const posB = b.position ?? Number.MAX_SAFE_INTEGER;
      if (posA !== posB) return posA - posB;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return [...sortedFolders, ...rootNotes];
  };

  const fileTree = buildFileTree();
  const pinnedNotes = notes.filter(n => n.sticky && n.title.toLowerCase().includes(searchQuery.toLowerCase()));

  // Get all sortable IDs (notes and folders at all levels)
  const getAllIds = (items: FileTreeItem[]): string[] => {
    const ids: string[] = [];
    items.forEach(item => {
      ids.push(item.id);
      if (item.type === 'folder') {
        ids.push(...getAllIds(item.children));
        ids.push(...item.notes.map(n => n.id));
      }
    });
    return ids;
  };

  const sortableIds = getAllIds(fileTree);

  const renderNote = (note: FileTreeNote, depth = 0) => {
    const isSelected = currentNoteId === note.id;
    const isDragging = activeId === note.id;
    const isOver = overId === note.id;

    let dropIndicatorClass = '';
    if (isOver && dropPosition) {
      if (dropPosition === 'before') dropIndicatorClass = 'sb-drop-before';
      else if (dropPosition === 'after') dropIndicatorClass = 'sb-drop-after';
    }

    return (
      <div
        key={note.id}
        data-drag-id={note.id}
        className={`${dropIndicatorClass} ${isDragging ? 'opacity-40' : ''}`}
      >
        <DraggableNote
          note={note}
          depth={depth}
          isSelected={isSelected}
          onClick={() => handleNoteClick(note.id)}
          onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, 'note', note.id)}
        />
      </div>
    );
  };

  const renderPinnedNote = (note: typeof notes[0]) => {
    const isSelected = currentNoteId === note.id;
    return (
      <div
        key={note.id}
        onClick={() => handleNoteClick(note.id)}
        onContextMenu={(e) => handleContextMenu(e, 'note', note.id)}
        className={`sb-note${isSelected ? ' selected' : ''} pinned`}
        style={{ paddingLeft: '20px' }}
      >
        <FileText size={14} className="sb-note-icon" />
        <span className="sb-note-title">{note.title}</span>
      </div>
    );
  };

  const renderFolder = (folder: FileTreeFolder, depth = 0): JSX.Element => {
    const isExpanded = expandedFolders.has(folder.id);
    const isEditing = editingFolderId === folder.id;
    const isDragging = activeId === folder.id;
    const isOver = overId === folder.id;

    let dropIndicatorClass = '';
    if (isOver && dropPosition) {
      if (dropPosition === 'before') dropIndicatorClass = 'sb-drop-before';
      else if (dropPosition === 'after') dropIndicatorClass = 'sb-drop-after';
      else if (dropPosition === 'inside') dropIndicatorClass = 'sb-drop-inside';
    }

    return (
      <div key={folder.id} className={isDragging ? 'opacity-40' : ''}>
        <div data-drag-id={folder.id} className={dropIndicatorClass}>
          <DraggableFolder
            folder={folder}
            depth={depth}
            isExpanded={isExpanded}
            isEditing={isEditing}
            editingFolderName={editingFolderName}
            onToggle={(e: React.MouseEvent) => toggleFolder(folder.id, e)}
            onEditChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingFolderName(e.target.value)}
            onEditBlur={() => handleRenameFolder(folder.id)}
            onEditKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') handleRenameFolder(folder.id);
              if (e.key === 'Escape') { setEditingFolderId(null); setEditingFolderName(''); }
              e.stopPropagation();
            }}
            onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, 'folder', folder.id)}
          >
            <div>
              {folder.children.map(child => renderFolder(child, depth + 1))}
              {folder.notes.map(note => renderNote(note, depth + 1))}
              {folder.notes.length === 0 && folder.children.length === 0 && (
                <div className="sb-empty-folder" style={{ paddingLeft: `${(depth + 1) * 16 + 20}px` }}>
                  No items
                </div>
              )}
            </div>
          </DraggableFolder>
        </div>
      </div>
    );
  };

  const renderItem = (item: FileTreeItem, depth = 0) => {
    if (item.type === 'folder') return renderFolder(item, depth);
    return renderNote(item, depth);
  };

  const isActive = (path: string) => location.pathname === path;

  const renderContextMenu = () => {
    if (!contextMenu) return null;

    const { x, y, type, id } = contextMenu;
    const note = type === 'note' ? notes.find(n => n.id === id) : null;
    const folder = type === 'folder' ? folders.find(f => f.id === id) : null;

    return (
      <div
        ref={contextMenuRef}
        className="sb-context-menu"
        style={{ left: x, top: y }}
      >
        {type === 'note' && note && (
          <>
            <button
              className="sb-context-item"
              onClick={() => { handleTogglePin(id, !!note.sticky); setContextMenu(null); }}
            >
              <Star size={13} />
              {note.sticky ? 'Unpin' : 'Pin to top'}
            </button>
            <div className="sb-context-separator" />
            <button
              className="sb-context-item danger"
              onClick={() => { handleDeleteNote(id); setContextMenu(null); }}
            >
              <Trash2 size={13} />
              Delete
            </button>
          </>
        )}
        {type === 'folder' && folder && (
          <>
            <button
              className="sb-context-item"
              onClick={() => {
                setEditingFolderId(id);
                setEditingFolderName(folder.name);
                setContextMenu(null);
              }}
            >
              <Edit3 size={13} />
              Rename
            </button>
            <div className="sb-context-separator" />
            <button
              className="sb-context-item danger"
              onClick={() => { handleDeleteFolder(id); setContextMenu(null); }}
            >
              <Trash2 size={13} />
              Delete
            </button>
          </>
        )}
      </div>
    );
  };

  const activeItem = activeId ? (notes.find(n => n.id === activeId) || folders.find(f => f.id === activeId)) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="sidebar-container">
        <div className="sb-header">
          <span className="sb-app-name">Messy Notes</span>
          <div className="sb-header-actions">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`sb-icon-btn${showSearch ? ' active' : ''}`}
              title="Search (Ctrl+F)"
            >
              <Search size={14} />
            </button>
            <button onClick={handleRefresh} disabled={isRefreshing} className="sb-icon-btn" title="Refresh">
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={toggleTheme} className="sb-icon-btn" title="Toggle theme">
              {isDarkMode() ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>

        {showSearch && (
          <div className="sb-search">
            <Search size={13} className="sb-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes..."
              className="sb-search-input"
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setShowSearch(false); }
              }}
            />
            {searchQuery && (
              <button className="sb-search-clear" onClick={() => setSearchQuery('')}>
                <X size={12} />
              </button>
            )}
          </div>
        )}

        <div className="sb-nav">
          <button onClick={onNewNote} className="sb-nav-item">
            <Plus size={15} style={{ color: 'var(--accent-blue)' }} />
            <span>New Note</span>
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className={`sb-nav-item${isActive('/dashboard') ? ' active' : ''}`}
          >
            <LayoutGrid size={15} style={{ color: 'var(--accent-purple)' }} />
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => navigate('/mindmap')}
            className={`sb-nav-item${isActive('/mindmap') ? ' active' : ''}`}
          >
            <Network size={15} style={{ color: 'var(--accent-green)' }} />
            <span>Mindmap</span>
          </button>
        </div>

        {pinnedNotes.length > 0 && (
          <div className="sb-section">
            <button className="sb-section-header" onClick={() => setPinnedCollapsed(!pinnedCollapsed)}>
              <ChevronRight size={12} className={`sb-section-chevron${pinnedCollapsed ? '' : ' expanded'}`} />
              <span className="sb-section-label">PINNED</span>
              <span className="sb-section-count">{pinnedNotes.length}</span>
            </button>
            {!pinnedCollapsed && (
              <div className="sb-section-content">
                {pinnedNotes.map(note => renderPinnedNote(note))}
              </div>
            )}
          </div>
        )}

        <div className="sb-section sb-section-grow">
          <div className="sb-section-header-row">
            <button className="sb-section-header" onClick={() => setExplorerCollapsed(!explorerCollapsed)}>
              <ChevronRight size={12} className={`sb-section-chevron${explorerCollapsed ? '' : ' expanded'}`} />
              <span className="sb-section-label">EXPLORER</span>
            </button>
            {!explorerCollapsed && (
              <div className="sb-section-header-tools">
                <button onClick={onNewNote} className="sb-icon-btn-sm" title="New Note">
                  <Plus size={14} />
                </button>
                <button onClick={() => setShowNewFolderInput(true)} className="sb-icon-btn-sm" title="New Folder">
                  <FolderPlus size={14} />
                </button>
                <button onClick={collapseAllFolders} className="sb-icon-btn-sm" title="Collapse All">
                  <ChevronsDownUp size={14} />
                </button>
              </div>
            )}
          </div>

          {!explorerCollapsed && (
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <div className="sb-tree">
                {showNewFolderInput && (
                  <div className="sb-new-folder">
                    <Folder size={14} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                    <input
                      autoFocus
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onBlur={() => { if (!newFolderName.trim()) setShowNewFolderInput(false); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateFolder();
                        if (e.key === 'Escape') { setNewFolderName(''); setShowNewFolderInput(false); }
                      }}
                      placeholder="Folder name..."
                      className="sb-new-folder-input"
                    />
                  </div>
                )}

                {fileTree.map(item => renderItem(item, 0))}

                {fileTree.length === 0 && !showNewFolderInput && (
                  <div className="sb-empty">
                    <span>{searchQuery ? 'No matches found' : 'No notes yet'}</span>
                    {!searchQuery && (
                      <button onClick={onNewNote} className="sb-empty-link">Create your first note</button>
                    )}
                  </div>
                )}
              </div>
            </SortableContext>
          )}
        </div>

        <div className="sb-footer">
          <span>{lastSync ? `Synced ${formatRelativeTime(lastSync)}` : 'Not synced'}</span>
          <span className="sb-footer-sep">·</span>
          <span>{notes.length} {notes.length === 1 ? 'note' : 'notes'}</span>
        </div>

        {renderContextMenu()}
      </div>

      <DragOverlay>
        {activeItem && (
          <div className="sb-note opacity-80 bg-theme-card shadow-lg">
            <FileText size={14} className="sb-note-icon" />
            <span className="sb-note-title">
              {'title' in activeItem ? activeItem.title : 'name' in activeItem ? activeItem.name : ''}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export default Sidebar;