import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FileText, Network, Search, Plus, Folder,
  ChevronRight, ChevronDown, LayoutGrid, RefreshCw, Trash2, Edit3,
  Star, Clock, FolderPlus, MoreHorizontal, FolderOpen
} from 'lucide-react';
import { useNotes } from '../contexts/NotesContext';
import type { SidebarProps, DragData, DropPosition, FileTreeFolder, FileTreeItem, FileTreeNote } from '../types';

type ActiveSection = 'all' | 'recent' | 'sticky';

function Sidebar({ currentNoteId, onSelectNote, onNewNote }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { notes, folders, loadNotes, loadFolders, deleteNote, createFolder, updateFolder, deleteFolder, moveNoteToFolder, updateNote, reorderNotes, lastSync, initialized } = useNotes();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<ActiveSection>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);

  // Drag state - ALL refs, ZERO useState during drag lifecycle.
  // React re-renders during drag destroy DOM elements, cancelling the drag.
  const isDraggingRef = useRef(false);
  const dragDataRef = useRef<DragData | null>(null);
  const dragOverRef = useRef<{ type: 'note' | 'folder'; id: string } | null>(null);
  const dropPositionRef = useRef<DropPosition | null>(null);
  const previousHighlightRef = useRef<HTMLElement | null>(null);
  const rootDropZoneRef = useRef<HTMLDivElement>(null);

  // Clean up any visual highlights on a DOM element
  const clearHighlight = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    el.classList.remove(
      'border-t-2', 'border-t-blue-500',
      'border-b-2', 'border-b-blue-500',
      'bg-blue-500/20', 'ring-2', 'ring-blue-400/50'
    );
  }, []);

  // Apply visual highlight to a DOM element based on drop position
  const applyHighlight = useCallback((el: HTMLElement, position: DropPosition) => {
    clearHighlight(el);
    if (position === 'before') {
      el.classList.add('border-t-2', 'border-t-blue-500');
    } else if (position === 'after') {
      el.classList.add('border-b-2', 'border-b-blue-500');
    } else if (position === 'inside') {
      el.classList.add('bg-blue-500/20', 'ring-2', 'ring-blue-400/50');
    }
  }, [clearHighlight]);

  // Auto-expand folders on mount
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

  const handleDeleteNote = async (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!confirm('Delete this note?')) return;

    await deleteNote(noteId);

    if (currentNoteId === noteId) {
      navigate('/');
    }
  };

  const handleTogglePin = async (noteId: string, currentlyPinned: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

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

    if ((e.target as HTMLElement).closest('.delete-button') || (e.target as HTMLElement).closest('.pin-button')) {
      return;
    }

    if (currentNoteId === noteId) {
      return;
    }

    onSelectNote(noteId);
  };

  const toggleFolder = (folderId: string, e?: React.MouseEvent) => {
    if (e) {
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
      setFolderMenuId(null);
    } catch (error) {
      alert('Failed to delete folder: ' + (error as Error).message);
    }
  };

  // ==================== DRAG AND DROP HANDLERS ====================
  // KEY INSIGHT: We must NOT call setState during drag operations (dragEnter/dragOver)
  // because React re-renders recreate DOM elements, which causes the browser to lose
  // track of the drop target and the drop event never fires.
  // Instead, we use refs + direct DOM manipulation for visual feedback.

  const handleDragStart = useCallback((e: React.DragEvent, itemType: 'note' | 'folder', itemId: string) => {
    console.log('🟢 DRAG START:', itemType, itemId);

    if (editingFolderId || folderMenuId) {
      e.preventDefault();
      return;
    }

    isDraggingRef.current = true;

    const dragData: DragData = { type: itemType, id: itemId };
    dragDataRef.current = dragData;

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.setData('text/plain', itemId);

    // Show root drop zone via direct DOM manipulation (NO setState!)
    if (rootDropZoneRef.current) {
      rootDropZoneRef.current.style.display = 'block';
    }

    requestAnimationFrame(() => {
      const element = e.currentTarget as HTMLElement;
      if (element) {
        element.style.opacity = '0.4';
      }
    });
  }, [editingFolderId, folderMenuId]);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    console.log('🔴 DRAG END');

    if (e.currentTarget) {
      (e.currentTarget as HTMLElement).style.opacity = '1';
    }

    // Clean up visual highlights
    clearHighlight(previousHighlightRef.current);
    previousHighlightRef.current = null;

    // Reset all refs
    isDraggingRef.current = false;
    dragDataRef.current = null;
    dragOverRef.current = null;
    dropPositionRef.current = null;

    // Hide root drop zone via direct DOM manipulation (NO setState!)
    if (rootDropZoneRef.current) {
      rootDropZoneRef.current.style.display = 'none';
    }
  }, [clearHighlight]);

  const handleDragOver = useCallback((e: React.DragEvent, itemType: 'note' | 'folder', itemId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const dragData = dragDataRef.current;
    if (!dragData) return;
    if (dragData.type === itemType && dragData.id === itemId) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const itemHeight = rect.height;

    let newPosition: DropPosition;

    if (itemType === 'folder') {
      const topThreshold = itemHeight * 0.3;
      const bottomThreshold = itemHeight * 0.7;

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

    // Only update if something changed
    const prevOver = dragOverRef.current;
    if (prevOver?.type === itemType && prevOver?.id === itemId && dropPositionRef.current === newPosition) {
      return;
    }

    // Clean up previous element
    if (previousHighlightRef.current && previousHighlightRef.current !== e.currentTarget) {
      clearHighlight(previousHighlightRef.current);
    }

    // Update refs (NO setState!)
    dragOverRef.current = { type: itemType, id: itemId };
    dropPositionRef.current = newPosition;

    // Apply visual highlight directly to DOM
    const el = e.currentTarget as HTMLElement;
    applyHighlight(el, newPosition);
    previousHighlightRef.current = el;
  }, [clearHighlight, applyHighlight]);

  const handleDrop = useCallback(async (e: React.DragEvent, targetType: 'note' | 'folder', targetId: string) => {
    e.preventDefault();
    e.stopPropagation();

    console.log('🟣🟣🟣 DROP EVENT FIRED on', targetType, targetId);

    // Clean up visual highlight immediately
    clearHighlight(e.currentTarget as HTMLElement);
    clearHighlight(previousHighlightRef.current);
    previousHighlightRef.current = null;

    // Get drag data from ref or dataTransfer
    let dragData = dragDataRef.current;

    if (!dragData) {
      try {
        const dataStr = e.dataTransfer.getData('application/json');
        if (dataStr) {
          dragData = JSON.parse(dataStr);
        }
      } catch (err) {
        console.error('Failed to parse drag data:', err);
      }
    }

    const currentDropPosition = dropPositionRef.current;

    if (!dragData || !currentDropPosition) {
      console.warn('No drag data or drop position', { dragData, dropPosition: currentDropPosition });
      return;
    }

    const { type: draggedType, id: draggedId } = dragData;

    if (draggedType === targetType && draggedId === targetId) {
      console.log('Cannot drop on self');
      return;
    }

    try {
      if (draggedType === 'note') {
        console.log('📝 Dropping NOTE');

        if (targetType === 'folder' && currentDropPosition === 'inside') {
          console.log(`  → Moving note ${draggedId} INTO folder ${targetId}`);
          await moveNoteToFolder(draggedId, targetId);

          setExpandedFolders(prev => {
            const next = new Set(prev);
            next.add(targetId);
            return next;
          });
          updateFolder(targetId, { expanded: true });
        }
        else if (targetType === 'note') {
          const targetNote = notes.find(n => n.id === targetId);
          if (!targetNote) {
            console.error('Target note not found');
            return;
          }

          const targetFolderId = targetNote.folderId || null;

          const folderNotes = notes
            .filter(n => (n.folderId || null) === targetFolderId)
            .sort((a, b) => (a.position || 0) - (b.position || 0));

          const targetIndex = folderNotes.findIndex(n => n.id === targetId);
          if (targetIndex === -1) {
            console.error('Target not found in folder notes');
            return;
          }

          let newPosition: number;
          if (currentDropPosition === 'before') {
            newPosition = targetIndex;
          } else {
            newPosition = targetIndex + 1;
          }

          const draggedIndex = folderNotes.findIndex(n => n.id === draggedId);
          if (draggedIndex !== -1 && draggedIndex < newPosition) {
            newPosition--;
          }

          console.log(`  → Reordering note ${draggedId} to position ${newPosition} in folder ${targetFolderId}`);
          await reorderNotes(draggedId, targetFolderId, newPosition);
        }
        else if (targetType === 'folder') {
          const targetFolder = folders.find(f => f.id === targetId);
          if (targetFolder) {
            console.log(`  → Moving note ${draggedId} to same level as folder ${targetId}`);
            await moveNoteToFolder(draggedId, targetFolder.parentId || null);
          }
        }
      }
      else if (draggedType === 'folder') {
        console.log('📁 Dropping FOLDER');

        if (targetType === 'folder' && currentDropPosition === 'inside') {
          if (draggedId === targetId) {
            alert('Cannot move a folder into itself');
            return;
          }

          let isDescendant = false;
          let checkFolder = folders.find(f => f.id === targetId);
          while (checkFolder && checkFolder.parentId) {
            if (checkFolder.parentId === draggedId) {
              isDescendant = true;
              break;
            }
            checkFolder = folders.find(f => f.id === checkFolder!.parentId!);
          }

          if (isDescendant) {
            alert('Cannot move a folder into its own subfolder');
            return;
          }

          console.log(`  → Moving folder ${draggedId} INTO folder ${targetId}`);
          await updateFolder(draggedId, { parentId: targetId });

          setExpandedFolders(prev => {
            const next = new Set(prev);
            next.add(targetId);
            return next;
          });
          updateFolder(targetId, { expanded: true });
        }
        else if (targetType === 'folder') {
          const targetFolder = folders.find(f => f.id === targetId);
          if (targetFolder) {
            console.log(`  → Moving folder ${draggedId} to same level as folder ${targetId}`);
            await updateFolder(draggedId, { parentId: targetFolder.parentId || null });
          }
        }
        else if (targetType === 'note') {
          const targetNote = notes.find(n => n.id === targetId);
          if (targetNote && targetNote.folderId) {
            const noteFolder = folders.find(f => f.id === targetNote.folderId!);
            console.log(`  → Moving folder ${draggedId} to parent of note's folder`);
            await updateFolder(draggedId, { parentId: noteFolder?.parentId || null });
          } else {
            console.log(`  → Moving folder ${draggedId} to root`);
            await updateFolder(draggedId, { parentId: null });
          }
        }
      }

      console.log('  ✅ Drop complete, refreshing...');
      await Promise.all([loadNotes(false), loadFolders()]);

    } catch (error) {
      console.error('❌ Drop failed:', error);
      alert('Failed to move item: ' + (error as Error).message);
      await Promise.all([loadNotes(false), loadFolders()]);
    }
  }, [notes, folders, moveNoteToFolder, reorderNotes, updateFolder, loadNotes, loadFolders, clearHighlight]);

  const handleDropOnRoot = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();

    console.log('🟣 DROP ON ROOT');

    let dragData = dragDataRef.current;

    if (!dragData) {
      try {
        const dataStr = e.dataTransfer.getData('application/json');
        if (dataStr) {
          dragData = JSON.parse(dataStr);
        }
      } catch (err) {
        console.error('Failed to get drag data:', err);
        return;
      }
    }

    if (!dragData) {
      console.warn('No drag data available for root drop');
      return;
    }

    const { type, id } = dragData;

    try {
      console.log(`  → Moving ${type} ${id} to root`);

      if (type === 'note') {
        await moveNoteToFolder(id, null);
      } else if (type === 'folder') {
        await updateFolder(id, { parentId: null });
      }

      console.log('  ✅ Move to root complete');
      await Promise.all([loadNotes(false), loadFolders()]);
    } catch (error) {
      console.error('❌ Drop on root failed:', error);
      alert('Failed to move to root: ' + (error as Error).message);
      await Promise.all([loadNotes(false), loadFolders()]);
    }
  }, [moveNoteToFolder, updateFolder, loadNotes, loadFolders]);

  // Build unified file tree
  const buildFileTree = (): FileTreeItem[] => {
    let filteredNotes = notes.filter(n =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    let filteredFolders = [...folders];

    if (activeSection === 'sticky') {
      filteredNotes = filteredNotes.filter(n => n.sticky);

      const foldersWithPinnedNotes = new Set<string>();
      filteredNotes.forEach(note => {
        if (note.folderId) {
          foldersWithPinnedNotes.add(note.folderId);
          let folder = folders.find(f => f.id === note.folderId!);
          while (folder && folder.parentId) {
            foldersWithPinnedNotes.add(folder.parentId);
            folder = folders.find(f => f.id === folder!.parentId!);
          }
        }
      });

      filteredFolders = filteredFolders.filter(f => foldersWithPinnedNotes.has(f.id));
    } else if (activeSection === 'recent') {
      filteredNotes = filteredNotes.slice().sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ).slice(0, 20);

      filteredFolders = filteredFolders.slice().sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    }

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

    if (activeSection === 'recent') {
      const allItems: FileTreeItem[] = [...tree, ...rootNotes];
      return allItems.sort((a, b) => {
        const dateA = new Date(a.updatedAt);
        const dateB = new Date(b.updatedAt);
        return dateB.getTime() - dateA.getTime();
      });
    }

    // Sort folders by position (or createdAt if no position)
    const sortedFolders = tree.sort((a, b) => {
      const posA = a.position ?? Number.MAX_SAFE_INTEGER;
      const posB = b.position ?? Number.MAX_SAFE_INTEGER;
      if (posA !== posB) return posA - posB;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Combine: folders first (by position), then root notes (by position)
    return [...sortedFolders, ...rootNotes];
  };

  const fileTree = buildFileTree();

  const renderNote = (note: FileTreeNote, depth = 0) => {
    const isSelected = currentNoteId === note.id;
    const isPinned = note.sticky;

    return (
      <div
        key={note.id}
        data-drag-id={note.id}
        data-drag-type="note"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        draggable={true}
        onDragStart={(e) => handleDragStart(e, 'note', note.id)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, 'note', note.id)}
        onDrop={(e) => handleDrop(e, 'note', note.id)}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('.pin-button') && !(e.target as HTMLElement).closest('.delete-button')) {
            handleNoteClick(note.id, e);
          }
        }}
        className={`relative w-full flex items-center gap-2 px-2 py-2 rounded text-xs text-left transition-colors duration-200 group cursor-pointer select-none ${
          isSelected
            ? 'bg-theme-tertiary text-theme-primary ring-2 ring-purple-500 ring-opacity-30'
            : 'theme-bg-hover text-theme-secondary'
        }`}
      >
        <FileText size={12} className={`pointer-events-none ${isPinned ? 'text-yellow-400' : 'text-theme-tertiary'}`} />
        <div className="flex-1 min-w-0 pointer-events-none">
          <div className="truncate">{note.title}</div>
          <div className="text-[10px] text-theme-tertiary">
            {new Date(note.updatedAt).toLocaleDateString()}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleTogglePin(note.id, isPinned, e);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="pin-button opacity-0 group-hover:opacity-100 p-0.5 hover:bg-yellow-600 rounded transition-opacity cursor-pointer z-10"
          title={isPinned ? "Unpin" : "Pin"}
        >
          <Star size={10} className={isPinned ? 'text-yellow-400' : 'text-gray-400'} fill={isPinned ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteNote(note.id, e);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="delete-button opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-600 rounded transition-opacity cursor-pointer z-10"
          title="Delete"
        >
          <Trash2 size={10} className="text-red-400" />
        </button>
      </div>
    );
  };

  const renderFolder = (folder: FileTreeFolder, depth = 0): JSX.Element => {
    const isExpanded = expandedFolders.has(folder.id);
    const isEditing = editingFolderId === folder.id;
    const showMenu = folderMenuId === folder.id;

    return (
      <div key={folder.id}>
        <div
          data-drag-id={folder.id}
          data-drag-type="folder"
          style={{ paddingLeft: `${depth * 12}px` }}
          draggable={!isEditing && !showMenu}
          onDragStart={(e) => handleDragStart(e, 'folder', folder.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, 'folder', folder.id)}
          onDrop={(e) => handleDrop(e, 'folder', folder.id)}
          onClick={(e) => {
            if (!isEditing && !showMenu && !(e.target as HTMLElement).closest('.folder-menu-button')) {
              toggleFolder(folder.id, e);
            }
          }}
          className="relative w-full flex items-center gap-1 px-2 py-2 rounded text-xs theme-bg-hover transition-colors duration-200 cursor-pointer select-none group"
        >
          <div className="p-0.5 hover:bg-white/10 rounded pointer-events-none">
            {isExpanded ? (
              <ChevronDown size={12} className="text-theme-tertiary" />
            ) : (
              <ChevronRight size={12} className="text-theme-tertiary" />
            )}
          </div>

          <div className="pointer-events-none">
            {isExpanded ? (
              <FolderOpen size={12} className="text-blue-400" />
            ) : (
              <Folder size={12} className="text-blue-400" />
            )}
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
                if (e.key === 'Escape') {
                  setEditingFolderId(null);
                  setEditingFolderName('');
                }
              }}
              className="flex-1 px-1 py-0.5 bg-black/20 border border-blue-500 rounded text-theme-primary outline-none"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 truncate text-theme-primary font-medium pointer-events-none">
              {folder.name}
            </span>
          )}

          <span className="text-[10px] text-theme-tertiary pointer-events-none">
            {folder.notes.length}
          </span>

          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFolderMenuId(showMenu ? null : folder.id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="folder-menu-button opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded transition-opacity"
            >
              <MoreHorizontal size={12} className="text-theme-tertiary" />
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-1 bg-theme-card border border-theme-primary rounded shadow-lg z-50 py-1 min-w-[120px]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingFolderId(folder.id);
                    setEditingFolderName(folder.name);
                    setFolderMenuId(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-theme-tertiary text-theme-primary flex items-center gap-2"
                >
                  <Edit3 size={12} />
                  Rename
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFolder(folder.id);
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-red-600 text-red-400 flex items-center gap-2"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {isExpanded && (
          <div>
            {folder.notes.map(note => renderNote(note, depth + 1))}
            {folder.children.map(child => renderFolder(child, depth + 1))}

            {folder.notes.length === 0 && folder.children.length === 0 && (
              <div className="px-2 py-1 text-[10px] text-theme-tertiary italic" style={{ paddingLeft: `${(depth + 1) * 12}px` }}>
                Empty folder
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderItem = (item: FileTreeItem, depth = 0) => {
    if (item.type === 'folder') {
      return renderFolder(item, depth);
    } else {
      return renderNote(item, depth);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  const getSectionTitle = () => {
    switch (activeSection) {
      case 'all': return 'All Notes';
      case 'recent': return 'Recent';
      case 'sticky': return 'Pinned';
      default: return 'All Notes';
    }
  };

  return (
    <div className="w-64 h-screen sidebar-themed flex flex-col">
      <div className="p-4 border-b border-theme-primary">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-sm font-semibold text-theme-primary">Messy Notes</h1>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 theme-bg-hover rounded transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={14} className={`text-theme-secondary ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="relative">
          <Search size={12} className="absolute left-2 top-2 text-theme-tertiary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="w-full pl-7 pr-2 py-1.5 input-themed rounded text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1 border-b border-theme-primary">
          <button
            onClick={onNewNote}
            className="w-full flex items-center gap-2 px-2 py-1.5 theme-bg-hover rounded text-xs text-left transition-colors text-theme-primary"
          >
            <Plus size={14} className="text-blue-400" />
            <span>New Note</span>
          </button>

          <button
            onClick={() => navigate('/dashboard')}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${
              isActive('/dashboard')
                ? 'bg-theme-tertiary text-theme-primary ring-2 ring-purple-500 ring-opacity-30'
                : 'theme-bg-hover text-theme-primary'
            }`}
          >
            <LayoutGrid size={14} className="text-purple-400" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => navigate('/mindmap')}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${
              isActive('/mindmap')
                ? 'bg-theme-tertiary text-theme-primary ring-2 ring-purple-500 ring-opacity-30'
                : 'theme-bg-hover text-theme-primary'
            }`}
          >
            <Network size={14} className="text-green-400" />
            <span>Mindmap</span>
          </button>
        </div>

        <div className="px-2 py-2 space-y-1 border-b border-theme-primary">
          <button
            onClick={() => setActiveSection('all')}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${
              activeSection === 'all' ? 'bg-theme-tertiary text-theme-primary' : 'theme-bg-hover text-theme-secondary'
            }`}
          >
            <FileText size={14} />
            <span>All Notes</span>
            <span className="ml-auto text-[10px] text-theme-tertiary">{notes.length}</span>
          </button>

          <button
            onClick={() => setActiveSection('recent')}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${
              activeSection === 'recent' ? 'bg-theme-tertiary text-theme-primary' : 'theme-bg-hover text-theme-secondary'
            }`}
          >
            <Clock size={14} />
            <span>Recent</span>
          </button>

          <button
            onClick={() => setActiveSection('sticky')}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${
              activeSection === 'sticky' ? 'bg-theme-tertiary text-theme-primary' : 'theme-bg-hover text-theme-secondary'
            }`}
          >
            <Star size={14} className="text-yellow-400" />
            <span>Pinned</span>
            <span className="ml-auto text-[10px] text-theme-tertiary">{notes.filter(n => n.sticky).length}</span>
          </button>
        </div>

        <div
          className="px-2 pb-4 min-h-[200px]"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={handleDropOnRoot}
        >
          <div className="flex items-center justify-between px-2 py-2">
            <div className="text-[10px] uppercase tracking-wider text-theme-tertiary">
              {getSectionTitle()}
            </div>
            {activeSection === 'all' && (
              <button
                onClick={() => setShowNewFolderInput(true)}
                className="p-0.5 hover:bg-white/10 rounded"
                title="New Folder"
              >
                <FolderPlus size={12} className="text-blue-400" />
              </button>
            )}
          </div>

          {showNewFolderInput && (
            <div className="mb-2 flex gap-1 px-2">
              <input
                autoFocus
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onBlur={() => {
                  if (!newFolderName.trim()) setShowNewFolderInput(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') {
                    setNewFolderName('');
                    setShowNewFolderInput(false);
                  }
                }}
                placeholder="Folder name..."
                className="flex-1 px-2 py-1 text-xs input-themed rounded"
              />
            </div>
          )}

          <div className="space-y-0.5">
            {fileTree.map(item => renderItem(item, 0))}
          </div>

          {fileTree.length === 0 && (
            <div className="px-2 py-8 text-center text-xs text-theme-tertiary">
              {searchQuery ? 'No notes found' : 'No notes yet'}
              <div className="mt-2">
                <button
                  onClick={onNewNote}
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Create your first note
                </button>
              </div>
            </div>
          )}

          <div
            ref={rootDropZoneRef}
            style={{ display: 'none' }}
            className="mt-4 px-2 py-3 border-2 border-dashed border-blue-400 border-opacity-50 rounded text-center text-[10px] text-blue-400 bg-blue-500 bg-opacity-5"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDropOnRoot(e);
            }}
          >
            Drop here to move to root
          </div>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
