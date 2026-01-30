import React, { useState, useEffect, useCallback } from 'react';
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
  const { notes, folders, loadNotes, loadFolders, deleteNote, createFolder, updateFolder, deleteFolder, moveNoteToFolder, updateNote, lastSync, initialized } = useNotes();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [folderMenuId, setFolderMenuId] = useState(null);
  const [draggedNoteId, setDraggedNoteId] = useState(null);

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
    // Stop propagation to prevent folder menu from triggering
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

  const handleDragStart = (e, noteId) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', noteId);
    setDraggedNoteId(noteId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnFolder = async (e, folderId) => {
    e.preventDefault();
    e.stopPropagation();
    
    const noteId = e.dataTransfer.getData('text/plain');
    if (!noteId) return;
    
    try {
      await moveNoteToFolder(noteId, folderId);
      setDraggedNoteId(null);
    } catch (error) {
      alert('Failed to move note: ' + error.message);
    }
  };

  const handleDropOnRoot = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const noteId = e.dataTransfer.getData('text/plain');
    if (!noteId) return;
    
    try {
      await moveNoteToFolder(noteId, null);
      setDraggedNoteId(null);
    } catch (error) {
      alert('Failed to move note: ' + error.message);
    }
  };

  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getNotesForSection = () => {
    switch (activeSection) {
      case 'sticky':
        return filteredNotes.filter(n => n.sticky);
      case 'recent':
        return filteredNotes.slice(0, 20);
      case 'all':
      default:
        return filteredNotes;
    }
  };

  const displayNotes = getNotesForSection();

  const buildFolderTree = (notesToUse) => {
    const tree = [];
    const folderMap = new Map();
    
    // Create folder nodes
    folders.forEach(folder => {
      folderMap.set(folder.id, {
        ...folder,
        children: [],
        notes: notesToUse.filter(n => n.folderId === folder.id)
      });
    });
    
    // Build tree structure
    folders.forEach(folder => {
      const node = folderMap.get(folder.id);
      if (folder.parentId && folderMap.has(folder.parentId)) {
        folderMap.get(folder.parentId).children.push(node);
      } else {
        tree.push(node);
      }
    });
    
    return tree;
  };

  const folderTree = buildFolderTree(displayNotes);
  const rootNotes = displayNotes.filter(n => !n.folderId);

  const renderNote = (note) => {
    const isSelected = currentNoteId === note.id;
    const isPinned = note.sticky;
    
    return (
      <div
        key={note.id}
        draggable
        onDragStart={(e) => handleDragStart(e, note.id)}
        onClick={(e) => handleNoteClick(note.id, e)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors group cursor-pointer ${
          isSelected 
            ? 'bg-theme-tertiary text-theme-primary ring-2 ring-purple-500 ring-opacity-30' 
            : 'theme-bg-hover text-theme-secondary'
        }`}
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
    const hasNotes = folder.notes.length > 0;
    const hasChildren = folder.children.length > 0;
    const isEditing = editingFolderId === folder.id;
    const showMenu = folderMenuId === folder.id;
    
    return (
      <div key={folder.id} style={{ paddingLeft: `${depth * 12}px` }}>
        <div 
          className="relative group"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDropOnFolder(e, folder.id)}
        >
          <div 
            className="w-full flex items-center gap-1 px-2 py-1.5 rounded text-xs theme-bg-hover transition-colors cursor-pointer"
            onClick={(e) => {
              if (!isEditing && !showMenu) {
                toggleFolder(folder.id, e);
              }
            }}
          >
            <div 
              className="p-0.5 hover:bg-white/10 rounded"
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(folder.id, e);
              }}
            >
              {isExpanded ? (
                <ChevronDown size={12} className="text-theme-tertiary" />
              ) : (
                <ChevronRight size={12} className="text-theme-tertiary" />
              )}
            </div>
            
            {isExpanded ? (
              <FolderOpen size={12} className="text-blue-400" />
            ) : (
              <Folder size={12} className="text-blue-400" />
            )}
            
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
        
        {isExpanded && (
          <div className="ml-4">
            {folder.notes.map(note => renderNote(note))}
            {folder.children.map(child => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const isActive = (path) => location.pathname === path;

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

        {/* Folders and Notes Section */}
        <div className="px-2 pb-4">
          <div className="flex items-center justify-between px-2 py-2">
            <div className="text-[10px] uppercase tracking-wider text-theme-tertiary">
              {activeSection === 'all' ? 'All Notes' : activeSection === 'recent' ? 'Recent Notes' : 'Pinned Notes'}
            </div>
            <button
              onClick={() => setShowNewFolderInput(true)}
              className="p-0.5 hover:bg-white/10 rounded"
              title="New Folder"
            >
              <FolderPlus size={12} className="text-blue-400" />
            </button>
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
          
          <div 
            className="space-y-0.5"
            onDragOver={handleDragOver}
            onDrop={handleDropOnRoot}
          >
            {folderTree.map(folder => renderFolder(folder))}
            
            {rootNotes.length > 0 && (
              <div className="space-y-0.5 mt-2">
                {rootNotes.map(note => renderNote(note))}
              </div>
            )}
          </div>
          
          {displayNotes.length === 0 && (
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