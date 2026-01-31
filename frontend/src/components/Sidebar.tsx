import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FileText, Network, Search, Plus, Folder,
  ChevronRight, LayoutGrid, RefreshCw, Trash2, Edit3,
  Star, FolderPlus, FolderOpen, Sun, Moon, X,
  ChevronsDownUp
} from 'lucide-react';
import { useNotes } from '../contexts/NotesContext';
import type { SidebarProps, DragData, DropPosition, FileTreeFolder, FileTreeItem, FileTreeNote } from '../types';

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

  const searchInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);

  // Drag state
  const isDraggingRef = useRef(false);
  const dragDataRef = useRef<DragData | null>(null);
  const dragOverRef = useRef<{ type: 'note' | 'folder'; id: string } | null>(null);
  const dropPositionRef = useRef<DropPosition | null>(null);
  const previousHighlightRef = useRef<HTMLElement | null>(null);
  const rootDropZoneRef = useRef<HTMLDivElement>(null);
  const dragExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const clearHighlight = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    el.classList.remove('sb-drop-before', 'sb-drop-after', 'sb-drop-inside');
  }, []);

  const applyHighlight = useCallback((el: HTMLElement, position: DropPosition) => {
    clearHighlight(el);
    if (position === 'before') {
      el.classList.add('sb-drop-before');
    } else if (position === 'after') {
      el.classList.add('sb-drop-after');
    } else if (position === 'inside') {
      el.classList.add('sb-drop-inside');
    }
  }, [clearHighlight]);

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

  // ==================== NATIVE DRAG EVENT HANDLERS (TAURI FIX) ====================
  
  useEffect(() => {
    const treeContainer = treeContainerRef.current;
    if (!treeContainer) {
      console.warn('⚠️ treeContainer ref not available, drag/drop listeners not attached');
      return;
    }

    console.log('✅ Attaching native drag/drop listeners to tree container');

    const handleNativeDragOver = (e: DragEvent) => {
      // CRITICAL: ALWAYS preventDefault to allow drop, even if no valid target
      e.preventDefault();
      e.stopPropagation();
      
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }

      const target = e.target as HTMLElement;
      const dropTarget = target.closest('[data-drag-id]') as HTMLElement;
      
      // If no valid drop target, still allow the drag to continue
      if (!dropTarget) {
        return;
      }

      const targetId = dropTarget.getAttribute('data-drag-id');
      const targetType = dropTarget.getAttribute('data-drag-type') as 'note' | 'folder';
      
      if (!targetId || !targetType) return;

      console.log('🎯 DragOver:', targetType, targetId);

      const dragData = dragDataRef.current;
      if (!dragData) return;
      if (dragData.type === targetType && dragData.id === targetId) return;

      const rect = dropTarget.getBoundingClientRect();
      const mouseY = e.clientY - rect.top;
      const itemHeight = rect.height;

      let newPosition: DropPosition;
      if (targetType === 'folder') {
        const topThreshold = itemHeight * 0.25;
        const bottomThreshold = itemHeight * 0.75;
        if (mouseY < topThreshold) {
          newPosition = 'before';
        } else if (mouseY > bottomThreshold) {
          newPosition = 'after';
        } else {
          newPosition = 'inside';
        }
      } else {
        newPosition = mouseY < itemHeight / 2 ? 'before' : 'after';
      }

      const prevOver = dragOverRef.current;
      if (prevOver?.type === targetType && prevOver?.id === targetId && dropPositionRef.current === newPosition) {
        return;
      }

      if (previousHighlightRef.current && previousHighlightRef.current !== dropTarget) {
        clearHighlight(previousHighlightRef.current);
      }

      dragOverRef.current = { type: targetType, id: targetId };
      dropPositionRef.current = newPosition;

      applyHighlight(dropTarget, newPosition);
      previousHighlightRef.current = dropTarget;

      // Auto-expand folders
      if (targetType === 'folder' && newPosition === 'inside') {
        if (dragExpandTimerRef.current) {
          clearTimeout(dragExpandTimerRef.current);
        }
        dragExpandTimerRef.current = setTimeout(() => {
          setExpandedFolders(prev => {
            if (prev.has(targetId)) return prev;
            const next = new Set(prev);
            next.add(targetId);
            updateFolder(targetId, { expanded: true });
            return next;
          });
        }, 600);
      } else {
        if (dragExpandTimerRef.current) {
          clearTimeout(dragExpandTimerRef.current);
          dragExpandTimerRef.current = null;
        }
      }
    };

    const handleNativeDrop = async (e: DragEvent) => {
      // CRITICAL: Must preventDefault immediately
      e.preventDefault();
      e.stopPropagation();

      console.log('📦 DROP EVENT FIRED on element:', e.target);

      const target = e.target as HTMLElement;
      const dropTarget = target.closest('[data-drag-id]') as HTMLElement;
      
      if (!dropTarget) {
        console.log('⚠️ Drop fired but no [data-drag-id] target found');
        console.log('   Event target:', target);
        console.log('   Target classes:', target.className);
        return;
      }

      const targetId = dropTarget.getAttribute('data-drag-id');
      const targetType = dropTarget.getAttribute('data-drag-type') as 'note' | 'folder';

      if (!targetId || !targetType) {
        console.log('⚠️ Drop target missing data attributes');
        console.log('   targetId:', targetId);
        console.log('   targetType:', targetType);
        return;
      }

      console.log('📦 Drop on:', targetType, targetId, 'position:', dropPositionRef.current);

      clearHighlight(dropTarget);
      clearHighlight(previousHighlightRef.current);
      previousHighlightRef.current = null;

      if (dragExpandTimerRef.current) {
        clearTimeout(dragExpandTimerRef.current);
        dragExpandTimerRef.current = null;
      }

      let dragData = dragDataRef.current;
      if (!dragData && e.dataTransfer) {
        try {
          const dataStr = e.dataTransfer.getData('application/json');
          if (dataStr) dragData = JSON.parse(dataStr);
        } catch (err) {
          console.error('Failed to parse drag data:', err);
        }
      }

      const currentDropPosition = dropPositionRef.current;
      if (!dragData || !currentDropPosition) {
        console.log('❌ No drag data or position');
        return;
      }

      const { type: draggedType, id: draggedId } = dragData;
      if (draggedType === targetType && draggedId === targetId) {
        console.log('❌ Same item');
        return;
      }

      console.log('✅ Processing drop:', draggedType, draggedId, '→', targetType, targetId, currentDropPosition);

      try {
        if (draggedType === 'note') {
          if (targetType === 'folder' && currentDropPosition === 'inside') {
            await moveNoteToFolder(draggedId, targetId);
            setExpandedFolders(prev => {
              const next = new Set(prev);
              next.add(targetId);
              return next;
            });
            updateFolder(targetId, { expanded: true });
          } else if (targetType === 'note') {
            const targetNote = notes.find(n => n.id === targetId);
            if (!targetNote) return;
            const targetFolderId = targetNote.folderId || null;
            const folderNotes = notes
              .filter(n => (n.folderId || null) === targetFolderId)
              .sort((a, b) => (a.position || 0) - (b.position || 0));
            const targetIndex = folderNotes.findIndex(n => n.id === targetId);
            if (targetIndex === -1) return;
            let newPosition = currentDropPosition === 'before' ? targetIndex : targetIndex + 1;
            const draggedIndex = folderNotes.findIndex(n => n.id === draggedId);
            if (draggedIndex !== -1 && draggedIndex < newPosition) newPosition--;
            await reorderNotes(draggedId, targetFolderId, newPosition);
          } else if (targetType === 'folder') {
            const targetFolder = folders.find(f => f.id === targetId);
            if (targetFolder) {
              await moveNoteToFolder(draggedId, targetFolder.parentId || null);
            }
          }
        } else if (draggedType === 'folder') {
          if (targetType === 'folder' && currentDropPosition === 'inside') {
            if (draggedId === targetId) return;
            let isDescendant = false;
            let checkFolder = folders.find(f => f.id === targetId);
            while (checkFolder && checkFolder.parentId) {
              if (checkFolder.parentId === draggedId) { isDescendant = true; break; }
              checkFolder = folders.find(f => f.id === checkFolder!.parentId!);
            }
            if (isDescendant) { alert('Cannot move a folder into its own subfolder'); return; }
            await updateFolder(draggedId, { parentId: targetId });
            setExpandedFolders(prev => {
              const next = new Set(prev);
              next.add(targetId);
              return next;
            });
            updateFolder(targetId, { expanded: true });
          } else if (targetType === 'folder') {
            const targetFolder = folders.find(f => f.id === targetId);
            if (targetFolder) {
              await updateFolder(draggedId, { parentId: targetFolder.parentId || null });
            }
          } else if (targetType === 'note') {
            const targetNote = notes.find(n => n.id === targetId);
            if (targetNote && targetNote.folderId) {
              const noteFolder = folders.find(f => f.id === targetNote.folderId!);
              await updateFolder(draggedId, { parentId: noteFolder?.parentId || null });
            } else {
              await updateFolder(draggedId, { parentId: null });
            }
          }
        }
        await Promise.all([loadNotes(false), loadFolders()]);
      } catch (error) {
        console.error('Drop failed:', error);
        alert('Failed to move item: ' + (error as Error).message);
        await Promise.all([loadNotes(false), loadFolders()]);
      }
    };

    // Add native event listeners (these work better in Tauri than React synthetic events)
    // Use capture phase to ensure we catch the event before any child handlers
    treeContainer.addEventListener('dragover', handleNativeDragOver, true);
    treeContainer.addEventListener('drop', handleNativeDrop, true);
    
    // CRITICAL: Also prevent default on drag events to avoid browser's default drag behavior
    const preventDefaults = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    treeContainer.addEventListener('dragenter', preventDefaults, true);
    treeContainer.addEventListener('dragleave', preventDefaults, true);

    return () => {
      treeContainer.removeEventListener('dragover', handleNativeDragOver, true);
      treeContainer.removeEventListener('drop', handleNativeDrop, true);
      treeContainer.removeEventListener('dragenter', preventDefaults, true);
      treeContainer.removeEventListener('dragleave', preventDefaults, true);
    };
  }, [notes, folders, moveNoteToFolder, reorderNotes, updateFolder, loadNotes, loadFolders, clearHighlight, applyHighlight]);

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

  const handleNoteClick = (noteId: string, e: React.MouseEvent) => {
    if (isDraggingRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
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

  const handleDragStart = useCallback((e: React.DragEvent, itemType: 'note' | 'folder', itemId: string) => {
    if (editingFolderId || contextMenu) {
      e.preventDefault();
      return;
    }
    
    console.log('🎯 DragStart:', itemType, itemId);
    
    const element = e.currentTarget as HTMLElement;
    if (element) {
      element.style.opacity = '0.4';
      element.classList.add('dragging');
    }
    
    isDraggingRef.current = true;
    const dragData: DragData = { type: itemType, id: itemId };
    dragDataRef.current = dragData;
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.setData('text/plain', itemId);

    if (rootDropZoneRef.current) {
      rootDropZoneRef.current.style.display = 'block';
    }
  }, [editingFolderId, contextMenu]);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    console.log('🏁 DragEnd');
    
    const element = e.currentTarget as HTMLElement;
    if (element) {
      element.style.opacity = '1';
      element.classList.remove('dragging');
    }
    
    clearHighlight(previousHighlightRef.current);
    previousHighlightRef.current = null;
    isDraggingRef.current = false;
    dragDataRef.current = null;
    dragOverRef.current = null;
    dropPositionRef.current = null;
    
    if (rootDropZoneRef.current) {
      rootDropZoneRef.current.style.display = 'none';
    }
    if (dragExpandTimerRef.current) {
      clearTimeout(dragExpandTimerRef.current);
      dragExpandTimerRef.current = null;
    }
  }, [clearHighlight]);

  const handleDropOnRoot = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('📦 Drop on root');
    
    let dragData = dragDataRef.current;
    if (!dragData) {
      try {
        const dataStr = e.dataTransfer.getData('application/json');
        if (dataStr) dragData = JSON.parse(dataStr);
      } catch (err) { return; }
    }
    if (!dragData) return;
    const { type, id } = dragData;
    try {
      if (type === 'note') {
        await moveNoteToFolder(id, null);
      } else if (type === 'folder') {
        await updateFolder(id, { parentId: null });
      }
      await Promise.all([loadNotes(false), loadFolders()]);
    } catch (error) {
      console.error('Drop on root failed:', error);
      await Promise.all([loadNotes(false), loadFolders()]);
    }
  }, [moveNoteToFolder, updateFolder, loadNotes, loadFolders]);

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

  const renderNote = (note: FileTreeNote, depth = 0) => {
    const isSelected = currentNoteId === note.id;
    const isPinned = note.sticky;

    return (
      <div
        key={note.id}
        data-drag-id={note.id}
        data-drag-type="note"
        style={{ paddingLeft: `${depth * 16 + 20}px` }}
        draggable={!editingFolderId}
        onDragStart={(e) => handleDragStart(e, 'note', note.id)}
        onDragEnd={handleDragEnd}
        onClick={(e) => handleNoteClick(note.id, e)}
        onContextMenu={(e) => handleContextMenu(e, 'note', note.id)}
        className={`sb-note${isSelected ? ' selected' : ''}${isPinned ? ' pinned' : ''}`}
      >
        <FileText size={14} className="sb-note-icon" />
        <span className="sb-note-title">{note.title}</span>
      </div>
    );
  };

  const renderPinnedNote = (note: typeof notes[0]) => {
    const isSelected = currentNoteId === note.id;
    return (
      <div
        key={note.id}
        onClick={(e) => handleNoteClick(note.id, e)}
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
    const folderColor = getFolderColor(folder.id);

    return (
      <div key={folder.id}>
        <div
          data-drag-id={folder.id}
          data-drag-type="folder"
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
          draggable={!isEditing}
          onDragStart={(e) => handleDragStart(e, 'folder', folder.id)}
          onDragEnd={handleDragEnd}
          onClick={(e) => {
            if (!isEditing) toggleFolder(folder.id, e);
          }}
          onContextMenu={(e) => handleContextMenu(e, 'folder', folder.id)}
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
              onChange={(e) => setEditingFolderName(e.target.value)}
              onBlur={() => handleRenameFolder(folder.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameFolder(folder.id);
                if (e.key === 'Escape') { setEditingFolderId(null); setEditingFolderName(''); }
                e.stopPropagation();
              }}
              className="sb-rename-input"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="sb-folder-name">{folder.name}</span>
          )}
          <span className="sb-folder-badge">{folder.notes.length}</span>
        </div>

        {isExpanded && (
          <div>
            {folder.children.map(child => renderFolder(child, depth + 1))}
            {folder.notes.map(note => renderNote(note, depth + 1))}
            {folder.notes.length === 0 && folder.children.length === 0 && (
              <div className="sb-empty-folder" style={{ paddingLeft: `${(depth + 1) * 16 + 20}px` }}>
                No items
              </div>
            )}
          </div>
        )}
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

  return (
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
          <div className="sb-tree" ref={treeContainerRef}>
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

            <div
              ref={rootDropZoneRef}
              style={{ display: 'none' }}
              className="sb-root-drop"
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onDrop={handleDropOnRoot}
            >
              Move to root level
            </div>
          </div>
        )}
      </div>

      <div className="sb-footer">
        <span>{lastSync ? `Synced ${formatRelativeTime(lastSync)}` : 'Not synced'}</span>
        <span className="sb-footer-sep">·</span>
        <span>{notes.length} {notes.length === 1 ? 'note' : 'notes'}</span>
      </div>

      {renderContextMenu()}
    </div>
  );
}

export default Sidebar;