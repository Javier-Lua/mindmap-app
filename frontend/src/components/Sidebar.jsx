import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FileText, Home, Network, Search, Plus, Folder, 
  ChevronRight, ChevronDown, LayoutGrid, RefreshCw, Loader, Trash2, Edit3,
  Star, Clock, FolderPlus, MoreHorizontal, FolderOpen
} from 'lucide-react';
import { useNotes } from '../contexts/NotesContext';

function Sidebar({ currentNoteId, onSelectNote, onNewNote }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { notes, folders, loadNotes, loadFolders, deleteNote, createFolder, updateFolder, deleteFolder, moveNoteToFolder, updateNote, reorderNotes, lastSync, initialized } = useNotes();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [folderMenuId, setFolderMenuId] = useState(null);
  
  // Drag state
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverItem, setDragOverItem] = useState(null);
  const [dropPosition, setDropPosition] = useState(null);

  // Auto-expand folders on mount
  useEffect(() => {
    const expanded = new Set();
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

  const handleDeleteNote = async (noteId, e) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (!confirm('Delete this note?')) return;
    
    await deleteNote(noteId);
    
    if (currentNoteId === noteId) {
      navigate('/');
    }
  };

  const handleTogglePin = async (noteId, currentlyPinned, e) => {
    e.stopPropagation();
    e.preventDefault();
    
    try {
      await updateNote(noteId, { sticky: !currentlyPinned });
    } catch (error) {
      console.error('Failed to toggle pin:', error);
    }
  };

  const handleNoteClick = (noteId, e) => {
    if (e.target.closest('.delete-button') || e.target.closest('.pin-button')) {
      return;
    }
    
    if (currentNoteId === noteId) {
      return;
    }
    
    onSelectNote(noteId);
  };

  const toggleFolder = (folderId, e) => {
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
      alert('Failed to create folder: ' + error.message);
    }
  };

  const handleRenameFolder = async (folderId) => {
    if (!editingFolderName.trim()) return;
    
    try {
      await updateFolder(folderId, { name: editingFolderName.trim() });
      setEditingFolderId(null);
      setEditingFolderName('');
    } catch (error) {
      alert('Failed to rename folder: ' + error.message);
    }
  };

  const handleDeleteFolder = async (folderId) => {
    if (!confirm('Delete this folder? Notes will be moved to root.')) return;
    
    try {
      await deleteFolder(folderId);
      setFolderMenuId(null);
    } catch (error) {
      alert('Failed to delete folder: ' + error.message);
    }
  };

  // ==================== DRAG AND DROP HANDLERS ====================
  
  const handleDragStart = useCallback((e, itemType, itemId) => {
    console.log('🟢 DRAG START:', itemType, itemId);
    
    // Prevent dragging while editing
    if (editingFolderId || folderMenuId) {
      e.preventDefault();
      return;
    }
    
    // Set drag data
    const dragData = JSON.stringify({ type: itemType, id: itemId });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', dragData);
    e.dataTransfer.setData('text/plain', dragData); // Fallback
    
    // Update state
    setDraggedItem({ type: itemType, id: itemId });
    
    // Add visual feedback
    setTimeout(() => {
      const element = e.target;
      if (element) {
        element.style.opacity = '0.4';
      }
    }, 0);
  }, [editingFolderId, folderMenuId]);

  const handleDragEnd = useCallback((e) => {
    console.log('🔴 DRAG END');
    
    // Reset visual feedback
    if (e.target) {
      e.target.style.opacity = '1';
    }
    
    // Clear all drag state
    setDraggedItem(null);
    setDragOverItem(null);
    setDropPosition(null);
  }, []);

  const handleDragEnter = useCallback((e, itemType, itemId) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('🟡 DRAG ENTER:', itemType, itemId);
    
    // Don't highlight self
    if (draggedItem && draggedItem.type === itemType && draggedItem.id === itemId) {
      return;
    }
    
    setDragOverItem({ type: itemType, id: itemId });
  }, [draggedItem]);

  const handleDragOver = useCallback((e, itemType, itemId) => {
    e.preventDefault();
    e.stopPropagation();
    
    // CRITICAL: Must prevent default to allow drop
    e.dataTransfer.dropEffect = 'move';
    
    if (!draggedItem) {
      // Try to read from dataTransfer
      try {
        const data = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
        if (data) {
          const parsed = JSON.parse(data);
          setDraggedItem(parsed);
        }
      } catch (err) {
        // Ignore
      }
      return;
    }
    
    // Don't process self
    if (draggedItem.type === itemType && draggedItem.id === itemId) {
      return;
    }
    
    // Calculate drop position based on mouse Y
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const itemHeight = rect.height;
    
    let newPosition;
    
    if (itemType === 'folder') {
      // Folders: 30% top = before, 30% bottom = after, 40% middle = inside
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
      // Notes: 50/50 split for before/after
      newPosition = mouseY < itemHeight / 2 ? 'before' : 'after';
    }
    
    // Only update if changed
    if (newPosition !== dropPosition || 
        !dragOverItem || 
        dragOverItem.type !== itemType || 
        dragOverItem.id !== itemId) {
      setDragOverItem({ type: itemType, id: itemId });
      setDropPosition(newPosition);
    }
  }, [draggedItem, dropPosition, dragOverItem]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check if we're leaving for a child element
    const relatedTarget = e.relatedTarget;
    if (relatedTarget && e.currentTarget.contains(relatedTarget)) {
      return; // Still inside, don't clear
    }
    
    console.log('🟠 DRAG LEAVE');
    
    // Clear drag over state
    setDragOverItem(null);
    setDropPosition(null);
  }, []);

  const handleDrop = useCallback(async (e, targetType, targetId) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('🟣 DROP on', targetType, targetId, 'at position', dropPosition);
    
    // Get drag data
    let dragData = draggedItem;
    if (!dragData) {
      try {
        const dataStr = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
        if (dataStr) {
          dragData = JSON.parse(dataStr);
        }
      } catch (err) {
        console.error('Failed to parse drag data:', err);
        return;
      }
    }
    
    if (!dragData || !dropPosition) {
      console.warn('No drag data or drop position');
      return;
    }
    
    const { type: draggedType, id: draggedId } = dragData;
    
    // Prevent dropping on self
    if (draggedType === targetType && draggedId === targetId) {
      console.log('Cannot drop on self');
      setDraggedItem(null);
      setDragOverItem(null);
      setDropPosition(null);
      return;
    }
    
    // Clear drag state immediately
    const currentDropPosition = dropPosition;
    setDraggedItem(null);
    setDragOverItem(null);
    setDropPosition(null);
    
    try {
      if (draggedType === 'note') {
        console.log('📝 Dropping NOTE');
        
        if (targetType === 'folder' && currentDropPosition === 'inside') {
          // Move note INTO folder
          console.log(`  → Moving note ${draggedId} INTO folder ${targetId}`);
          await moveNoteToFolder(draggedId, targetId);
          
          // Auto-expand folder
          setExpandedFolders(prev => {
            const next = new Set(prev);
            next.add(targetId);
            return next;
          });
          updateFolder(targetId, { expanded: true });
        } 
        else if (targetType === 'note') {
          // Reorder note relative to target note
          const targetNote = notes.find(n => n.id === targetId);
          if (!targetNote) {
            console.error('Target note not found');
            return;
          }
          
          const targetFolderId = targetNote.folderId || null;
          
          // Get all notes in target folder, sorted by position
          const folderNotes = notes
            .filter(n => (n.folderId || null) === targetFolderId)
            .sort((a, b) => (a.position || 0) - (b.position || 0));
          
          // Find target index
          const targetIndex = folderNotes.findIndex(n => n.id === targetId);
          if (targetIndex === -1) {
            console.error('Target not found in folder notes');
            return;
          }
          
          let newPosition;
          if (currentDropPosition === 'before') {
            newPosition = targetIndex;
          } else {
            newPosition = targetIndex + 1;
          }
          
          // Adjust if moving within same folder
          const draggedIndex = folderNotes.findIndex(n => n.id === draggedId);
          if (draggedIndex !== -1 && draggedIndex < newPosition) {
            newPosition--;
          }
          
          console.log(`  → Reordering note ${draggedId} to position ${newPosition} in folder ${targetFolderId}`);
          await reorderNotes(draggedId, targetFolderId, newPosition);
        }
        else if (targetType === 'folder') {
          // Drop BEFORE/AFTER folder (move to same level)
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
          // Prevent circular nesting
          if (draggedId === targetId) {
            alert('Cannot move a folder into itself');
            return;
          }
          
          // Check if target is descendant of dragged
          let isDescendant = false;
          let checkFolder = folders.find(f => f.id === targetId);
          while (checkFolder && checkFolder.parentId) {
            if (checkFolder.parentId === draggedId) {
              isDescendant = true;
              break;
            }
            checkFolder = folders.find(f => f.id === checkFolder.parentId);
          }
          
          if (isDescendant) {
            alert('Cannot move a folder into its own subfolder');
            return;
          }
          
          // Move folder inside target
          console.log(`  → Moving folder ${draggedId} INTO folder ${targetId}`);
          await updateFolder(draggedId, { parentId: targetId });
          
          // Auto-expand target
          setExpandedFolders(prev => {
            const next = new Set(prev);
            next.add(targetId);
            return next;
          });
          updateFolder(targetId, { expanded: true });
        }
        else if (targetType === 'folder') {
          // Move to same level as target folder
          const targetFolder = folders.find(f => f.id === targetId);
          if (targetFolder) {
            console.log(`  → Moving folder ${draggedId} to same level as folder ${targetId}`);
            await updateFolder(draggedId, { parentId: targetFolder.parentId || null });
          }
        }
        else if (targetType === 'note') {
          // Move to same level as note
          const targetNote = notes.find(n => n.id === targetId);
          if (targetNote && targetNote.folderId) {
            const noteFolder = folders.find(f => f.id === targetNote.folderId);
            console.log(`  → Moving folder ${draggedId} to parent of note's folder`);
            await updateFolder(draggedId, { parentId: noteFolder?.parentId || null });
          } else {
            console.log(`  → Moving folder ${draggedId} to root`);
            await updateFolder(draggedId, { parentId: null });
          }
        }
      }
      
      // Force refresh to show new order
      console.log('  ✅ Drop complete, refreshing...');
      await Promise.all([loadNotes(false), loadFolders()]);
      
    } catch (error) {
      console.error('❌ Drop failed:', error);
      alert('Failed to move item: ' + error.message);
      await Promise.all([loadNotes(false), loadFolders()]);
    }
  }, [draggedItem, dropPosition, notes, folders, moveNoteToFolder, reorderNotes, updateFolder, loadNotes, loadFolders]);

  const handleDropOnRoot = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('🟣 DROP ON ROOT');
    
    // Get drag data
    let dragData = draggedItem;
    if (!dragData) {
      try {
        const dataStr = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
        if (dataStr) {
          dragData = JSON.parse(dataStr);
        }
      } catch (err) {
        return;
      }
    }
    
    if (!dragData) return;
    
    const { type, id } = dragData;
    
    // Clear drag state
    setDraggedItem(null);
    setDragOverItem(null);
    setDropPosition(null);
    
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
      alert('Failed to move to root: ' + error.message);
      await Promise.all([loadNotes(false), loadFolders()]);
    }
  }, [draggedItem, moveNoteToFolder, updateFolder, loadNotes, loadFolders]);

  // Build unified file tree
  const buildFileTree = () => {
    let filteredNotes = notes.filter(n => 
      n.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    let filteredFolders = [...folders];

    if (activeSection === 'sticky') {
      filteredNotes = filteredNotes.filter(n => n.sticky);
      
      const foldersWithPinnedNotes = new Set();
      filteredNotes.forEach(note => {
        if (note.folderId) {
          foldersWithPinnedNotes.add(note.folderId);
          let folder = folders.find(f => f.id === note.folderId);
          while (folder && folder.parentId) {
            foldersWithPinnedNotes.add(folder.parentId);
            folder = folders.find(f => f.id === folder.parentId);
          }
        }
      });
      
      filteredFolders = filteredFolders.filter(f => foldersWithPinnedNotes.has(f.id));
    } else if (activeSection === 'recent') {
      filteredNotes = filteredNotes.slice().sort((a, b) => 
        new Date(b.updatedAt) - new Date(a.updatedAt)
      ).slice(0, 20);
      
      filteredFolders = filteredFolders.slice().sort((a, b) => 
        new Date(b.updatedAt) - new Date(a.updatedAt)
      );
    }

    const folderMap = new Map();
    filteredFolders.forEach(folder => {
      folderMap.set(folder.id, {
        ...folder,
        type: 'folder',
        children: [],
        notes: []
      });
    });

    filteredNotes.forEach(note => {
      if (note.folderId && folderMap.has(note.folderId)) {
        folderMap.get(note.folderId).notes.push({ ...note, type: 'note' });
      }
    });

    folderMap.forEach(folder => {
      folder.notes.sort((a, b) => (a.position || 0) - (b.position || 0));
    });

    const tree = [];
    const rootNotes = filteredNotes
      .filter(n => !n.folderId)
      .map(n => ({ ...n, type: 'note' }))
      .sort((a, b) => (a.position || 0) - (b.position || 0));

    filteredFolders.forEach(folder => {
      const node = folderMap.get(folder.id);
      if (folder.parentId && folderMap.has(folder.parentId)) {
        folderMap.get(folder.parentId).children.push(node);
      } else {
        tree.push(node);
      }
    });

    if (activeSection === 'recent') {
      const allItems = [...tree, ...rootNotes];
      return allItems.sort((a, b) => {
        const dateA = new Date(a.updatedAt);
        const dateB = new Date(b.updatedAt);
        return dateB - dateA;
      });
    }

    const result = [];
    let folderIndex = 0;
    let noteIndex = 0;

    while (folderIndex < tree.length || noteIndex < rootNotes.length) {
      if (folderIndex < tree.length) {
        result.push(tree[folderIndex]);
        folderIndex++;
      }
      if (noteIndex < rootNotes.length) {
        result.push(rootNotes[noteIndex]);
        noteIndex++;
      }
    }

    return result;
  };

  const fileTree = buildFileTree();

  const renderNote = (note, depth = 0) => {
    const isSelected = currentNoteId === note.id;
    const isPinned = note.sticky;
    const isDragging = draggedItem?.type === 'note' && draggedItem?.id === note.id;
    const isDragOver = dragOverItem?.type === 'note' && dragOverItem?.id === note.id;
    
    let dropIndicatorClass = '';
    if (isDragOver && dropPosition && !isDragging) {
      if (dropPosition === 'before') {
        dropIndicatorClass = 'border-t-2 border-t-blue-500';
      } else if (dropPosition === 'after') {
        dropIndicatorClass = 'border-b-2 border-b-blue-500';
      }
    }
    
    return (
      <div
        key={note.id}
        draggable={true}
        onDragStart={(e) => handleDragStart(e, 'note', note.id)}
        onDragEnd={handleDragEnd}
        onDragEnter={(e) => handleDragEnter(e, 'note', note.id)}
        onDragOver={(e) => handleDragOver(e, 'note', note.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, 'note', note.id)}
        onClick={(e) => handleNoteClick(note.id, e)}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        className={`w-full flex items-center gap-2 px-2 py-2 rounded text-xs text-left transition-all duration-200 group cursor-pointer select-none ${
          isSelected 
            ? 'bg-theme-tertiary text-theme-primary ring-2 ring-purple-500 ring-opacity-30' 
            : 'theme-bg-hover text-theme-secondary'
        } ${isDragging ? 'opacity-40' : ''} ${dropIndicatorClass}`}
      >
        <FileText size={12} className={isPinned ? 'text-yellow-400' : 'text-theme-tertiary'} />
        <div className="flex-1 min-w-0">
          <div className="truncate">{note.title}</div>
          <div className="text-[10px] text-theme-tertiary">
            {new Date(note.updatedAt).toLocaleDateString()}
          </div>
        </div>
        <button
          onClick={(e) => handleTogglePin(note.id, isPinned, e)}
          className="pin-button opacity-0 group-hover:opacity-100 p-0.5 hover:bg-yellow-600 rounded transition-opacity cursor-pointer"
          title={isPinned ? "Unpin" : "Pin"}
        >
          <Star size={10} className={isPinned ? 'text-yellow-400' : 'text-gray-400'} fill={isPinned ? 'currentColor' : 'none'} />
        </button>
        <div
          onClick={(e) => handleDeleteNote(note.id, e)}
          className="delete-button opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-600 rounded transition-opacity cursor-pointer"
          title="Delete"
        >
          <Trash2 size={10} className="text-red-400" />
        </div>
      </div>
    );
  };

  const renderFolder = (folder, depth = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const isEditing = editingFolderId === folder.id;
    const showMenu = folderMenuId === folder.id;
    const isDragging = draggedItem?.type === 'folder' && draggedItem?.id === folder.id;
    const isDragOver = dragOverItem?.type === 'folder' && dragOverItem?.id === folder.id;
    
    const showAsExpanded = isExpanded || (isDragOver && dropPosition === 'inside');
    
    let dropIndicatorClass = '';
    let containerClass = '';
    
    if (isDragOver && dropPosition && !isDragging) {
      if (dropPosition === 'before') {
        dropIndicatorClass = 'border-t-2 border-t-blue-500';
      } else if (dropPosition === 'after') {
        dropIndicatorClass = 'border-b-2 border-b-blue-500';
      } else if (dropPosition === 'inside') {
        containerClass = 'bg-blue-500 bg-opacity-20 ring-2 ring-blue-400 ring-opacity-50 rounded';
      }
    }
    
    return (
      <div key={folder.id} style={{ paddingLeft: `${depth * 12}px` }}>
        <div 
          className={`relative group transition-all duration-200 ${containerClass}`}
          draggable={!isEditing && !showMenu}
          onDragStart={(e) => handleDragStart(e, 'folder', folder.id)}
          onDragEnd={handleDragEnd}
          onDragEnter={(e) => handleDragEnter(e, 'folder', folder.id)}
          onDragOver={(e) => handleDragOver(e, 'folder', folder.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, 'folder', folder.id)}
        >
          <div 
            className={`w-full flex items-center gap-1 px-2 py-2 rounded text-xs theme-bg-hover transition-all duration-200 cursor-pointer select-none ${
              isDragging ? 'opacity-40' : ''
            } ${dropIndicatorClass}`}
            onClick={(e) => {
              if (!isEditing && !showMenu) {
                toggleFolder(folder.id, e);
              }
            }}
          >
            <div 
              className="p-0.5 hover:bg-white/10 rounded transition-transform duration-200"
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(folder.id, e);
              }}
            >
              {showAsExpanded ? (
                <ChevronDown size={12} className="text-theme-tertiary transition-all duration-200" />
              ) : (
                <ChevronRight size={12} className="text-theme-tertiary transition-all duration-200" />
              )}
            </div>
            
            <div className="transition-all duration-200">
              {showAsExpanded ? (
                <FolderOpen 
                  size={12} 
                  className={`text-blue-400 transition-all duration-200 ${
                    isDragOver && dropPosition === 'inside' ? 'scale-110' : ''
                  }`} 
                />
              ) : (
                <Folder 
                  size={12} 
                  className={`text-blue-400 transition-all duration-200 ${
                    isDragOver && dropPosition === 'inside' ? 'scale-110' : ''
                  }`} 
                />
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
              />
            ) : (
              <span className="flex-1 truncate text-theme-primary font-medium">
                {folder.name}
              </span>
            )}
            
            <span className="text-[10px] text-theme-tertiary">
              {folder.notes.length}
            </span>
            
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFolderMenuId(showMenu ? null : folder.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded transition-opacity"
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
        </div>
        
        {showAsExpanded && (
          <div className={`ml-2 transition-all duration-200 ${
            isDragOver && dropPosition === 'inside' && !isExpanded ? 'opacity-60' : ''
          }`}>
            {folder.notes.map(note => renderNote(note, depth + 1))}
            {folder.children.map(child => renderFolder(child, depth + 1))}
            
            {isDragOver && dropPosition === 'inside' && !isExpanded && draggedItem && (
              <div className="px-2 py-1 text-[10px] text-blue-400 italic animate-pulse">
                Drop {draggedItem.type} here
              </div>
            )}
            
            {folder.notes.length === 0 && folder.children.length === 0 && isExpanded && (
              <div className="px-2 py-1 text-[10px] text-theme-tertiary italic">
                Empty folder
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderItem = (item, depth = 0) => {
    if (item.type === 'folder') {
      return renderFolder(item, depth);
    } else {
      return renderNote(item, depth);
    }
  };

  const isActive = (path) => location.pathname === path;

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
            e.stopPropagation();
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
          
          {draggedItem && fileTree.length > 0 && (
            <div className="mt-4 px-2 py-3 border-2 border-dashed border-blue-400 border-opacity-50 rounded text-center text-[10px] text-blue-400 bg-blue-500 bg-opacity-5">
              Drop here to move to root
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Sidebar;