import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Loader } from 'lucide-react';

import EditorPage from './components/EditorPage';
import MessyMap from './components/MessyMap';
import Dashboard from './components/Dashboard';
import QuickCapture from './components/QuickCapture';
import Sidebar from './components/Sidebar';
import { NotesProvider, useNotes } from './contexts/NotesContext';

function EmptyState({ onNewNote }) {
  return (
    <div className="min-h-screen flex items-center justify-center theme-bg-primary">
      <div className="text-center max-w-md mx-4">
        <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <h1 className="text-3xl font-bold theme-text-primary mb-3">
          Start Your Messy Thinking
        </h1>
        <p className="text-theme-secondary mb-8">
          Create your first note and let your ideas flow freely.
        </p>
        <button
          onClick={onNewNote}
          className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:shadow-lg transition-all duration-200 font-medium text-lg inline-flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
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