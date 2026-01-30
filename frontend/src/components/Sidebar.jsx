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
  const [draggedItem, setDraggedItem] = useState(null); // { type: 'note' | 'folder', id: string }
  const [dragOverItem, setDragOverItem] = useState(null);
  const [dropPosition, setDropPosition] = useState(null); // 'before' | 'after' | 'inside'
  const dragCounter = useRef(0);

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

  // Drag and Drop handlers
  const handleDragStart = (e, type, id) => {
    e.stopPropagation();
    setDraggedItem({ type, id });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type, id }));
  };

  const handleDragEnd = (e) => {
    setDraggedItem(null);
    setDragOverItem(null);
    setDropPosition(null);
    dragCounter.current = 0;
  };

  const handleDragEnter = (e, type, id) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    
    if (!draggedItem || (draggedItem.type === type && draggedItem.id === id)) {
      return;
    }
    
    setDragOverItem({ type, id });
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    
    if (dragCounter.current === 0) {
      setDragOverItem(null);
      setDropPosition(null);
    }
  };

  const handleDragOver = (e, type, id) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    
    if (!draggedItem || (draggedItem.type === type && draggedItem.id === id)) {
      return;
    }
    
    // Calculate drop position based on mouse position
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const itemHeight = rect.height;
    
    if (type === 'folder') {
      // For folders: more generous "inside" zone (40% of height in middle)
      if (mouseY < itemHeight * 0.3) {
        setDropPosition('before');
      } else if (mouseY > itemHeight * 0.7) {
        setDropPosition('after');
      } else {
        setDropPosition('inside');
      }
    } else {
      // For notes: can only drop before or after
      if (mouseY < itemHeight * 0.5) {
        setDropPosition('before');
      } else {
        setDropPosition('after');
      }
    }
  };

  const handleDrop = async (e, targetType, targetId) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedItem) return;
    
    const { type: draggedType, id: draggedId } = draggedItem;
    
    // Don't allow dropping on self
    if (draggedType === targetType && draggedId === targetId) {
      setDraggedItem(null);
      setDragOverItem(null);
      setDropPosition(null);
      dragCounter.current = 0;
      return;
    }
    
    // Clear drag state immediately for visual feedback
    const currentDropPosition = dropPosition;
    const wasInside = currentDropPosition === 'inside';
    const targetFolderId = targetType === 'folder' ? targetId : null;
    
    setDraggedItem(null);
    setDragOverItem(null);
    setDropPosition(null);
    dragCounter.current = 0;
    
    let needsManualRefresh = true; // Track if we need to refresh manually
    
    try {
      if (draggedType === 'note') {
        const draggedNote = notes.find(n => n.id === draggedId);
        if (!draggedNote) return;
        
        // Dropping a note
        if (targetType === 'folder' && wasInside) {
          // Move note into folder
          await moveNoteToFolder(draggedId, targetId);
          
          // Auto-expand the folder to show the note was added
          if (!expandedFolders.has(targetId)) {
            setExpandedFolders(prev => {
              const next = new Set(prev);
              next.add(targetId);
              return next;
            });
            updateFolder(targetId, { expanded: true });
          }
        } else if (targetType === 'note') {
          // Reorder notes - drop on another note
          const targetNote = notes.find(n => n.id === targetId);
          if (!targetNote) return;
          
          const targetFolderId = targetNote.folderId || null;
          
          // Get all notes in the target folder, sorted by position
          const folderNotes = notes
            .filter(n => (n.folderId || null) === targetFolderId)
            .sort((a, b) => (a.position || 0) - (b.position || 0));
          
          // Find target position
          const targetIndex = folderNotes.findIndex(n => n.id === targetId);
          
          let newPosition;
          if (currentDropPosition === 'before') {
            // Insert before target
            newPosition = targetIndex;
          } else {
            // Insert after target
            newPosition = targetIndex + 1;
          }
          
          // If dragged note is already in this folder, adjust for removal
          const draggedIndex = folderNotes.findIndex(n => n.id === draggedId);
          if (draggedIndex !== -1 && draggedIndex < newPosition) {
            newPosition--;
          }
          
          // Call reorder API (this already handles refresh)
          await reorderNotes(draggedId, targetFolderId, newPosition);
          needsManualRefresh = false; // reorderNotes already refreshes
        } else if (targetType === 'folder' && !wasInside) {
          // Move note to same level as folder (root or parent)
          const targetFolder = folders.find(f => f.id === targetId);
          if (targetFolder) {
            await moveNoteToFolder(draggedId, targetFolder.parentId || null);
          }
        }
      } else if (draggedType === 'folder') {
        // Dropping a folder
        if (targetType === 'folder' && wasInside) {
          // Prevent nesting folder into itself or its descendants
          if (draggedId === targetId) {
            return;
          }
          
          // Check if target is a descendant of dragged folder
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
          
          // Move folder inside another folder (nest it)
          await updateFolder(draggedId, { parentId: targetId });
          
          // Auto-expand target folder
          if (!expandedFolders.has(targetId)) {
            setExpandedFolders(prev => {
              const next = new Set(prev);
              next.add(targetId);
              return next;
            });
            updateFolder(targetId, { expanded: true });
          }
        } else if (targetType === 'folder' && !wasInside) {
          // Move folder to same level as target folder
          const targetFolder = folders.find(f => f.id === targetId);
          if (targetFolder) {
            await updateFolder(draggedId, { parentId: targetFolder.parentId || null });
          }
        } else if (targetType === 'note') {
          // Move folder to same level as note (root or note's folder's parent)
          const targetNote = notes.find(n => n.id === targetId);
          if (targetNote && targetNote.folderId) {
            const noteFolder = folders.find(f => f.id === targetNote.folderId);
            await updateFolder(draggedId, { parentId: noteFolder?.parentId || null });
          } else {
            await updateFolder(draggedId, { parentId: null });
          }
        }
      }
      
      // Force refresh the list (only if not already refreshed)
      if (needsManualRefresh) {
        await Promise.all([loadNotes(false), loadFolders()]);
      }
    } catch (error) {
      console.error('Failed to move item:', error);
      alert('Failed to move item: ' + error.message);
      // Refresh on error to revert optimistic updates
      await Promise.all([loadNotes(false), loadFolders()]);
    }
  };

  const handleDropOnRoot = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedItem) return;
    
    const { type, id } = draggedItem;
    
    // Clear drag state immediately
    setDraggedItem(null);
    setDragOverItem(null);
    setDropPosition(null);
    dragCounter.current = 0;
    
    try {
      if (type === 'note') {
        await moveNoteToFolder(id, null);
      } else if (type === 'folder') {
        await updateFolder(id, { parentId: null });
      }
      
      // Force refresh the list
      await Promise.all([loadNotes(false), loadFolders()]);
    } catch (error) {
      console.error('Failed to move to root:', error);
      alert('Failed to move to root: ' + error.message);
      // Refresh on error
      await Promise.all([loadNotes(false), loadFolders()]);
    }
  };

  // Build unified file tree based on active section
  const buildFileTree = () => {
    let filteredNotes = notes.filter(n => 
      n.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    let filteredFolders = [...folders];

    // Apply section filtering
    if (activeSection === 'sticky') {
      // Show only pinned notes and folders containing pinned notes
      filteredNotes = filteredNotes.filter(n => n.sticky);
      
      const foldersWithPinnedNotes = new Set();
      filteredNotes.forEach(note => {
        if (note.folderId) {
          foldersWithPinnedNotes.add(note.folderId);
          // Add parent folders too
          let folder = folders.find(f => f.id === note.folderId);
          while (folder && folder.parentId) {
            foldersWithPinnedNotes.add(folder.parentId);
            folder = folders.find(f => f.id === folder.parentId);
          }
        }
      });
      
      filteredFolders = filteredFolders.filter(f => foldersWithPinnedNotes.has(f.id));
    } else if (activeSection === 'recent') {
      // Sort by most recent
      filteredNotes = filteredNotes.slice().sort((a, b) => 
        new Date(b.updatedAt) - new Date(a.updatedAt)
      ).slice(0, 20);
      
      filteredFolders = filteredFolders.slice().sort((a, b) => 
        new Date(b.updatedAt) - new Date(a.updatedAt)
      );
    }

    // Build folder map
    const folderMap = new Map();
    filteredFolders.forEach(folder => {
      folderMap.set(folder.id, {
        ...folder,
        type: 'folder',
        children: [],
        notes: []
      });
    });

    // Assign notes to folders
    filteredNotes.forEach(note => {
      if (note.folderId && folderMap.has(note.folderId)) {
        folderMap.get(note.folderId).notes.push({ ...note, type: 'note' });
      }
    });

    // Sort notes within each folder by position
    folderMap.forEach(folder => {
      folder.notes.sort((a, b) => (a.position || 0) - (b.position || 0));
    });

    // Build tree structure
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

    // For "recent" section, flatten and sort everything by date
    if (activeSection === 'recent') {
      const allItems = [...tree, ...rootNotes];
      return allItems.sort((a, b) => {
        const dateA = new Date(a.updatedAt);
        const dateB = new Date(b.updatedAt);
        return dateB - dateA;
      });
    }

    // For other sections, interleave folders and root notes
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
    if (isDragOver && dropPosition) {
      if (dropPosition === 'before') {
        dropIndicatorClass = 'border-t-2 border-blue-500';
      } else if (dropPosition === 'after') {
        dropIndicatorClass = 'border-b-2 border-blue-500';
      }
    }
    
    return (
      <div
        key={note.id}
        draggable
        onDragStart={(e) => handleDragStart(e, 'note', note.id)}
        onDragEnd={handleDragEnd}
        onDragEnter={(e) => handleDragEnter(e, 'note', note.id)}
        onDragLeave={handleDragLeave}
        onDragOver={(e) => handleDragOver(e, 'note', note.id)}
        onDrop={(e) => handleDrop(e, 'note', note.id)}
        onClick={(e) => handleNoteClick(note.id, e)}
        style={{ paddingLeft: `${depth * 12}px` }}
        className={`w-full flex items-center gap-2 px-2 py-2 rounded text-xs text-left transition-all duration-200 group cursor-pointer ${
          isSelected 
            ? 'bg-theme-tertiary text-theme-primary ring-2 ring-purple-500 ring-opacity-30' 
            : 'theme-bg-hover text-theme-secondary'
        } ${isDragging ? 'opacity-50' : ''} ${dropIndicatorClass}`}
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
    
    // Show as expanded when hovering with a draggable item to preview the drop
    const showAsExpanded = isExpanded || (isDragOver && dropPosition === 'inside');
    
    let dropIndicatorClass = '';
    let containerClass = '';
    if (isDragOver && dropPosition) {
      if (dropPosition === 'before') {
        dropIndicatorClass = 'border-t-2 border-blue-500';
      } else if (dropPosition === 'after') {
        dropIndicatorClass = 'border-b-2 border-blue-500';
      } else if (dropPosition === 'inside') {
        containerClass = 'bg-blue-500 bg-opacity-20 ring-2 ring-blue-400 ring-opacity-50 rounded';
      }
    }
    
    return (
      <div key={folder.id} style={{ paddingLeft: `${depth * 12}px` }}>
        <div 
          className={`relative group transition-all duration-200 ${containerClass}`}
          draggable
          onDragStart={(e) => handleDragStart(e, 'folder', folder.id)}
          onDragEnd={handleDragEnd}
          onDragEnter={(e) => handleDragEnter(e, 'folder', folder.id)}
          onDragLeave={handleDragLeave}
          onDragOver={(e) => handleDragOver(e, 'folder', folder.id)}
          onDrop={(e) => handleDrop(e, 'folder', folder.id)}
        >
          <div 
            className={`w-full flex items-center gap-1 px-2 py-2 rounded text-xs theme-bg-hover transition-all duration-200 cursor-pointer ${
              isDragging ? 'opacity-50' : ''
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
              style={{
                transform: showAsExpanded ? 'rotate(0deg)' : 'rotate(0deg)'
              }}
            >
              {showAsExpanded ? (
                <ChevronDown size={12} className="text-theme-tertiary transition-all duration-200" />
              ) : (
                <ChevronRight size={12} className="text-theme-tertiary transition-all duration-200" />
              )}
            </div>
            
            {/* Animate folder icon when drag hovering with "inside" position */}
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
        
        {/* Show children when expanded OR when hovering to drop inside */}
        {showAsExpanded && (
          <div className={`ml-2 transition-all duration-200 ${
            isDragOver && dropPosition === 'inside' && !isExpanded ? 'opacity-60' : ''
          }`}>
            {/* Render notes in folder */}
            {folder.notes.map(note => renderNote(note, depth + 1))}
            {/* Render child folders */}
            {folder.children.map(child => renderFolder(child, depth + 1))}
            
            {/* Show drop preview hint when hovering */}
            {isDragOver && dropPosition === 'inside' && !isExpanded && (
              <div className="px-2 py-1 text-[10px] text-blue-400 italic animate-pulse">
                Drop here to add to folder
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

  const getItemCount = () => {
    if (activeSection === 'sticky') {
      return notes.filter(n => n.sticky).length;
    } else if (activeSection === 'recent') {
      return Math.min(notes.length, 20);
    }
    return notes.length;
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
        {/* Navigation Section */}
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

        {/* Filter Section */}
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

        {/* Unified File Tree Section */}
        <div 
          className="px-2 pb-4"
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
            <div className="mb-2 flex gap-1">
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
            <div className="px-2 py-4 text-center text-xs text-theme-tertiary">
              No notes found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Sidebar;