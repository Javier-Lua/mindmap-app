import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { 
  FileText, Home, Network, Search, Plus, Folder, 
  ChevronRight, ChevronDown, LayoutGrid, Zap, RefreshCw, Loader, Trash2, Edit3, X, Check, FolderPlus,
  Star, Clock
} from 'lucide-react';

import EditorPage from './components/EditorPage';
import MessyMap from './components/MessyMap';
import Dashboard from './components/Dashboard';
import QuickCapture from './components/QuickCapture';
import { NotesProvider, useNotes } from './contexts/NotesContext';

function Sidebar({ currentNoteId, onSelectNote, onNewNote }) {
  const { notes, loadNotes, deleteNote, lastSync, initialized } = useNotes();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState('recent');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!initialized) return;
    
    const now = Date.now();
    const isStale = !lastSync || (now - lastSync) > 5000;
    
    if (isStale && notes.length === 0 && !lastSync) {
      loadNotes(true);
    }

    const interval = setInterval(() => {
      loadNotes(false);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [loadNotes, lastSync, notes.length, initialized]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadNotes(false);
    setIsRefreshing(false);
  };

  const handleDeleteNote = async (noteId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this note?')) return;
    
    await deleteNote(noteId);
    
    if (currentNoteId === noteId) {
      navigate('/');
    }
  };

  const filteredNotes = notes
    .filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const recentNotes = filteredNotes.slice(0, 10);
  const stickyNotes = filteredNotes.filter(n => n.sticky);
  const ephemeralNotes = filteredNotes.filter(n => n.ephemeral);

  const getDisplayNotes = () => {
    switch (activeSection) {
      case 'sticky': 
        return filteredNotes.filter(n => n.sticky);
      case 'ephemeral': 
        return filteredNotes.filter(n => n.ephemeral);
      case 'recent':
      default: 
        return filteredNotes.slice(0, 10);
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
        <div className="p-2 space-y-1">
          <button
            onClick={onNewNote}
            className="w-full flex items-center gap-2 px-2 py-1.5 theme-bg-hover rounded text-xs text-left transition-colors text-theme-primary"
          >
            <Plus size={14} className="text-blue-400" />
            <span>New Note</span>
          </button>
          
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center gap-2 px-2 py-1.5 theme-bg-hover rounded text-xs text-left transition-colors text-theme-primary"
          >
            <LayoutGrid size={14} className="text-purple-400" />
            <span>Dashboard</span>
          </button>
          
          <button
            onClick={() => navigate('/mindmap')}
            className="w-full flex items-center gap-2 px-2 py-1.5 theme-bg-hover rounded text-xs text-left transition-colors text-theme-primary"
          >
            <Network size={14} className="text-green-400" />
            <span>Mindmap</span>
          </button>
        </div>

        <div className="h-px border-theme-primary my-2" />

        <div className="px-2 space-y-1">
          <button
            onClick={() => setActiveSection('recent')}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${
              activeSection === 'recent' ? 'bg-theme-tertiary text-theme-primary' : 'theme-bg-hover text-theme-secondary'
            }`}
          >
            <Clock size={14} />
            <span>Recent</span>
            <span className="ml-auto text-[10px] text-theme-tertiary">{recentNotes.length}</span>
          </button>
          
          <button
            onClick={() => setActiveSection('sticky')}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${
              activeSection === 'sticky' ? 'bg-theme-tertiary text-theme-primary' : 'theme-bg-hover text-theme-secondary'
            }`}
          >
            <Star size={14} className="text-yellow-400" />
            <span>Pinned</span>
            <span className="ml-auto text-[10px] text-theme-tertiary">{stickyNotes.length}</span>
          </button>
          
          <button
            onClick={() => setActiveSection('ephemeral')}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${
              activeSection === 'ephemeral' ? 'bg-theme-tertiary text-theme-primary' : 'theme-bg-hover text-theme-secondary'
            }`}
          >
            <Zap size={14} className="text-gray-400" />
            <span>Quick Notes</span>
            <span className="ml-auto text-[10px] text-theme-tertiary">{ephemeralNotes.length}</span>
          </button>
        </div>

        <div className="h-px border-theme-primary my-2" />

        <div className="px-2 pb-4">
          <div className="text-[10px] uppercase tracking-wider text-theme-tertiary px-2 py-1 mb-1">
            Notes
          </div>
          
          {getDisplayNotes().map(note => (
            <button
              key={note.id}
              onClick={(e) => {
                e.preventDefault();
                if (currentNoteId === note.id) return;
                onSelectNote(note.id);
              }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors group ${
                currentNoteId === note.id ? 'bg-theme-tertiary text-theme-primary ring-2 ring-purple-500 ring-opacity-30' : 'theme-bg-hover text-theme-secondary'
              }`}
            >
              <FileText size={12} className={note.sticky ? 'text-yellow-400' : 'text-theme-tertiary'} />
              <div className="flex-1 min-w-0">
                <div className="truncate">{note.title}</div>
                <div className="text-[10px] text-theme-tertiary">
                  {new Date(note.updatedAt).toLocaleDateString()}
                </div>
              </div>
              {note.sticky && <Star size={10} className="text-yellow-400" fill="currentColor" />}
              {note.ephemeral && <Zap size={10} className="text-theme-tertiary" />}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteNote(note.id, e);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-600 rounded transition-opacity cursor-pointer"
                title="Delete"
              >
                <Trash2 size={10} className="text-red-400" />
              </div>
            </button>
          ))}
          
          {getDisplayNotes().length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-theme-tertiary">
              No notes found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onNewNote }) {
  return (
    <div className="min-h-screen flex items-center justify-center theme-bg-primary">
      <div className="text-center max-w-md mx-4">
        <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
          <FileText size={48} className="text-white" />
        </div>
        <h1 className="text-3xl font-bold theme-text-primary mb-3">
          Start Your Messy Thinking
        </h1>
        <p className="text-theme-secondary mb-8">
          Create your first note and let your ideas flow freely.
        </p>
        <button
          onClick={onNewNote}
          className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:shadow-lg transition-all duration-200 font-medium text-lg"
        >
          <Plus size={20} className="inline mr-2" />
          Create First Note
        </button>
        <p className="mt-6 text-sm text-theme-tertiary">
          Or press <kbd className="px-2 py-1 bg-theme-tertiary rounded shadow-sm border border-theme-primary font-mono text-xs">Ctrl+K</kbd> for quick capture
        </p>
      </div>
    </div>
  );
}

function MainLayout() {
  const { notes, createNote, initialized } = useNotes();
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [currentNoteId, setCurrentNoteId] = useState(null);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  
  const navigate = useNavigate();
  const params = useParams();

  useEffect(() => {
    if (params.id) {
      setCurrentNoteId(params.id);
    } else {
      setCurrentNoteId(null);
    }
  }, [params.id]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowQuickCapture(true);
      }
      if (e.key === 'Escape' && showQuickCapture) {
        e.preventDefault();
        setShowQuickCapture(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showQuickCapture]);

  const handleNewNote = async () => {
    if (isCreatingNote) return;
    
    setIsCreatingNote(true);
    try {
      const newNote = await createNote({});
      navigate(`/note/${newNote.id}`);
      setCurrentNoteId(newNote.id);
    } catch (error) {
      alert('Failed to create note. Please try again.');
    } finally {
      setIsCreatingNote(false);
    }
  };

  const handleSelectNote = (noteId) => {
    if (currentNoteId === noteId) return;
    navigate(`/note/${noteId}`);
    setCurrentNoteId(noteId);
  };

  const handleQuickCaptureClose = () => {
    setShowQuickCapture(false);
  };

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg-primary">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-theme-secondary">Initializing app...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden theme-bg-primary">
      <Sidebar
        currentNoteId={currentNoteId}
        onSelectNote={handleSelectNote}
        onNewNote={handleNewNote}
      />
      
      <div className="flex-1 overflow-hidden relative">
        {isCreatingNote && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="modal-themed rounded-lg p-6 flex items-center gap-3">
              <Loader className="animate-spin text-blue-500" size={24} />
              <span className="text-theme-primary">Creating note...</span>
            </div>
          </div>
        )}
        
        <Routes>
          <Route 
            path="/" 
            element={
              notes.length === 0 ? (
                <EmptyState onNewNote={handleNewNote} />
              ) : (
                <Navigate to={`/note/${notes[0].id}`} replace />
              )
            } 
          />
          <Route path="/note/:id" element={<EditorPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/mindmap" element={<MessyMap />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {showQuickCapture && (
        <QuickCapture onClose={handleQuickCaptureClose} />
      )}
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <NotesProvider>
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    </NotesProvider>
  );
}