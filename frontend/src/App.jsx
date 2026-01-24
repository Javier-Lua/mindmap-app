import React, { useEffect, useState, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  FileText, Home, Network, Search, Plus, Folder, 
  LogOut, Star, Clock, Archive, ChevronRight, ChevronDown,
  LayoutGrid, Zap, RefreshCw, Loader, Trash2, Edit3, X, Check, FolderPlus
} from 'lucide-react';

import EditorPage from './components/EditorPage';
import MessyMap from './components/MessyMap';
import Dashboard from './components/Dashboard';
import QuickCapture from './components/QuickCapture';
import { NotesProvider, useNotes } from './contexts/NotesContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

window.isLoggingOut = false;
window.isRefreshing = false;
window.failedQueue = [];

const processQueue = (error, token = null) => {
  window.failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  window.failedQueue = [];
};

// Configure axios interceptors ONCE
let interceptorConfigured = false;
if (!interceptorConfigured) {
  interceptorConfigured = true;

  axios.interceptors.request.use(
    config => {
      if (config.url?.includes('/refresh-token')) {
        return config;
      }
      config.metadata = { startTime: new Date() };
      return config;
    },
    error => Promise.reject(error)
  );

  axios.interceptors.response.use(
    response => {
      if (process.env.NODE_ENV === 'development' && response.config.metadata) {
        const duration = new Date() - response.config.metadata.startTime;
        if (duration > 2000) {
          console.warn(`Slow request: ${response.config.url} took ${duration}ms`);
        }
      }
      return response;
    },
    async error => {
      const originalRequest = error.config;
      
      if (window.isLoggingOut) {
        return Promise.reject(error);
      }
      
      if (error.response?.status === 401 && !originalRequest._retry) {
        if (originalRequest.url?.includes('/api/me') || 
            originalRequest.url?.includes('/refresh-token')) {
          // Don't redirect on /api/me failures - let the component handle it
          return Promise.reject(error);
        }
        
        originalRequest._retry = true;
        
        if (window.isRefreshing) {
          return new Promise((resolve, reject) => {
            window.failedQueue.push({ resolve, reject });
          })
            .then(() => axios(originalRequest))
            .catch(err => Promise.reject(err));
        }
        
        window.isRefreshing = true;
        
        try {
          await axios.post(`${API}/api/refresh-token`, {}, {
            withCredentials: true,
            timeout: 5000
          });
          
          window.isRefreshing = false;
          processQueue(null);
          
          return axios(originalRequest);
        } catch (refreshError) {
          window.isRefreshing = false;
          processQueue(refreshError);
          
          try {
            localStorage.clear();
            sessionStorage.clear();
          } catch (e) {}
          
          window.location.href = '/';
          return Promise.reject(refreshError);
        }
      }
      
      if (!error.response && !originalRequest._retryCount) {
        originalRequest._retryCount = 0;
      }
      
      if (!error.response && originalRequest._retryCount < 3) {
        originalRequest._retryCount++;
        const delay = Math.pow(2, originalRequest._retryCount - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return axios(originalRequest);
      }
      
      if (error.response?.status !== 401) {
        console.error('API Error:', {
          status: error.response?.status,
          url: originalRequest?.url,
          method: originalRequest?.method,
          message: error.message
        });
      }
      
      return Promise.reject(error);
    }
  );
}

function Sidebar({ user, currentNoteId, onSelectNote, onNewNote, onLogout }) {
  const { notes, folders, loadNotes, loadFolders, createFolder, updateFolder, deleteFolder, deleteNote, lastSync } = useNotes();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState('recent');
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Only reload if data is stale (older than 5 seconds)
    const now = Date.now();
    const isStale = !lastSync || (now - lastSync) > 5000;
    
    // Only load if stale AND we don't have any data yet
    // Don't reload just because notes are empty (user might have deleted all)
    if (isStale && notes.length === 0 && !lastSync) {
      loadNotes(true);
    }
    
    if (folders.length === 0 && !lastSync) {
      loadFolders();
    }

    const interval = setInterval(() => {
      if (!window.isLoggingOut) {
        loadNotes(false);
        loadFolders();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [loadNotes, loadFolders, lastSync, notes.length, folders.length]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadNotes(false), loadFolders()]);
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

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      await createFolder(newFolderName);
      setNewFolderName('');
      setIsCreatingFolder(false);
    } catch (error) {
      alert('Failed to create folder. Please try again.');
    }
  };

  const startEditFolder = (folder, e) => {
    e.stopPropagation();
    setEditingFolder(folder.id);
    setEditingFolderName(folder.name);
  };

  const saveEditFolder = async (folderId) => {
    if (!editingFolderName.trim()) return;
    
    try {
      await updateFolder(folderId, { name: editingFolderName });
      setEditingFolder(null);
    } catch (error) {
      alert('Failed to update folder. Please try again.');
    }
  };

  const handleDeleteFolder = async (folderId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this folder? Notes will be moved to root.')) return;
    
    try {
      await deleteFolder(folderId);
    } catch (error) {
      alert('Failed to delete folder. Please try again.');
    }
  };

  const filteredNotes = notes
    .filter(n => !n.id.startsWith('temp-')) // Filter out temporary notes
    .filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const recentNotes = filteredNotes.slice(0, 10);
  const stickyNotes = filteredNotes.filter(n => n.sticky);
  const ephemeralNotes = filteredNotes.filter(n => n.ephemeral);

  const getDisplayNotes = () => {
    const activeNotes = filteredNotes.filter(n => !n.id.startsWith('temp-'));
    
    switch (activeSection) {
      case 'sticky': 
        return activeNotes.filter(n => n.sticky);
      case 'ephemeral': 
        return activeNotes.filter(n => n.ephemeral);
      case 'recent':
      default: 
        return activeNotes.slice(0, 10);
    }
  };

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  return (
    <div className="w-64 h-screen sidebar-themed flex flex-col">
      <div className="p-4 border-b border-theme-primary">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-sm font-semibold text-theme-primary">Messy Notes</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1.5 theme-bg-hover rounded transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={14} className={`text-theme-secondary ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onLogout}
              className="p-1.5 theme-bg-hover rounded transition-colors"
              title="Logout"
            >
              <LogOut size={14} className="text-theme-secondary" />
            </button>
          </div>
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

        <div className="px-2">
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <div className="text-[10px] uppercase tracking-wider text-theme-tertiary">
              Folders
            </div>
            <button
              onClick={() => setIsCreatingFolder(!isCreatingFolder)}
              className="p-1 theme-bg-hover rounded transition-colors"
              title="New Folder"
            >
              <FolderPlus size={12} className="text-blue-400" />
            </button>
          </div>

          {isCreatingFolder && (
            <div className="mb-2 bg-theme-tertiary rounded p-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') setIsCreatingFolder(false);
                }}
                placeholder="Folder name..."
                className="w-full px-2 py-1 input-themed rounded text-xs mb-2"
                autoFocus
              />
              <div className="flex gap-1">
                <button
                  onClick={handleCreateFolder}
                  className="flex-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setIsCreatingFolder(false);
                    setNewFolderName('');
                  }}
                  className="px-2 py-1 bg-theme-tertiary text-theme-secondary rounded text-xs theme-bg-hover"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {folders.map(folder => (
            <div key={folder.id} className="group">
              {editingFolder === folder.id ? (
                <div className="mb-1 bg-theme-tertiary rounded p-2">
                  <input
                    type="text"
                    value={editingFolderName}
                    onChange={(e) => setEditingFolderName(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') saveEditFolder(folder.id);
                      if (e.key === 'Escape') setEditingFolder(null);
                    }}
                    className="w-full px-2 py-1 input-themed rounded text-xs mb-2"
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={() => saveEditFolder(folder.id)}
                      className="flex-1 px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                    >
                      <Check size={12} className="inline" />
                    </button>
                    <button
                      onClick={() => setEditingFolder(null)}
                      className="px-2 py-1 bg-theme-tertiary text-theme-secondary rounded text-xs theme-bg-hover"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    toggleFolder(folder.id);
                    navigate(`/mindmap/${folder.id}`);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 theme-bg-hover rounded text-xs text-left transition-colors mb-1 text-theme-primary"
                >
                  {expandedFolders.has(folder.id) ? (
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronRight size={12} />
                  )}
                  <Folder size={14} className="text-blue-400" />
                  <span className="flex-1 truncate">{folder.name}</span>
                  <span className="text-[10px] text-theme-tertiary">{folder._count?.notes || 0}</span>
                  <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                    <button
                      onClick={(e) => startEditFolder(folder, e)}
                      className="p-0.5 theme-bg-hover rounded"
                      title="Rename"
                    >
                      <Edit3 size={10} className="text-blue-400" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteFolder(folder.id, e)}
                      className="p-0.5 theme-bg-hover rounded"
                      title="Delete"
                    >
                      <Trash2 size={10} className="text-red-400" />
                    </button>
                  </div>
                </button>
              )}
            </div>
          ))}
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
              <button
                onClick={(e) => handleDeleteNote(note.id, e)}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-600 rounded transition-opacity"
                title="Delete"
              >
                <Trash2 size={10} className="text-red-400" />
              </button>
            </button>
          ))}
          
          {getDisplayNotes().length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-theme-tertiary">
              No notes found
            </div>
          )}
        </div>
      </div>

      <div className="p-3 border-t border-theme-primary">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-semibold">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-theme-primary truncate">{user?.name || 'User'}</div>
            <div className="text-[10px] text-theme-tertiary truncate">{user?.email}</div>
          </div>
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
          Create your first note and let your ideas flow freely. We'll help you organize them later.
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

function MainLayout({ user }) {
  const { notes, createNote } = useNotes();
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

  const handleNewNote = useCallback(async () => {
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
  }, [isCreatingNote, createNote, navigate]);

  const handleSelectNote = useCallback((noteId) => {
    if (currentNoteId === noteId) return;
    navigate(`/note/${noteId}`);
    setCurrentNoteId(noteId);
  }, [currentNoteId, navigate]);

  const handleLogout = async () => {
    window.isLoggingOut = true;
    window.isRefreshing = false;
    window.failedQueue = [];
    
    try {
      await axios.post(`${API}/api/logout`, {}, { 
        withCredentials: true,
        timeout: 2000
      }).catch(() => {});
    } catch (e) {}
    
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {}
    
    window.location.href = '/';
  };

  const handleQuickCaptureClose = () => {
    setShowQuickCapture(false);
  };

  return (
    <div className="flex h-screen overflow-hidden theme-bg-primary">
      <Sidebar
        user={user}
        currentNoteId={currentNoteId}
        onSelectNote={handleSelectNote}
        onNewNote={handleNewNote}
        onLogout={handleLogout}
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
          <Route path="/dashboard" element={<Dashboard user={user} />} />
          <Route path="/mindmap" element={<MessyMap />} />
          <Route path="/mindmap/:folderId" element={<MessyMap />} />
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
  const [authenticated, setAuthenticated] = useState(null);
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });
  
  // Use a ref to track if we're currently checking auth
  const isCheckingAuth = useRef(false);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!authenticated) return;

    const refreshInterval = setInterval(async () => {
      if (window.isLoggingOut) return;

      try {
        await axios.post(`${API}/api/refresh-token`, {}, {
          withCredentials: true,
          timeout: 5000
        });
      } catch (error) {
        console.error('Auto-refresh failed:', error);
      }
    }, 6 * 24 * 60 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [authenticated]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Single auth check on mount
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    
    // Small delay to ensure cookies are set after OAuth redirect
    setTimeout(() => {
      checkAuth();
    }, 100);
  }, []);

  const checkAuth = async () => {
    // Prevent concurrent auth checks
    if (isCheckingAuth.current) {
      return;
    }
    
    if (window.isLoggingOut) {
      setAuthenticated(false);
      return;
    }
    
    isCheckingAuth.current = true;
    
    try {
      const res = await axios.get(`${API}/api/me`, { 
        withCredentials: true,
        timeout: 10000
      });
      
      setAuthenticated(true);
      setUser(res.data);
      setAuthError(null);
      window.isLoggingOut = false;
    } catch (error) {
      // If this is the first check after potential OAuth redirect, retry once
      if (!hasInitialized.current && error.response?.status === 401) {
        console.log('Auth check failed, retrying once...');
        try {
          await new Promise(resolve => setTimeout(resolve, 500));
          const retryRes = await axios.get(`${API}/api/me`, { 
            withCredentials: true,
            timeout: 10000
          });
          
          setAuthenticated(true);
          setUser(retryRes.data);
          setAuthError(null);
          window.isLoggingOut = false;
          isCheckingAuth.current = false;
          return;
        } catch (retryError) {
          console.error('Auth retry failed:', retryError);
        }
      }
      
      setAuthenticated(false);
      setUser(null);
      
      if (error.response?.status !== 401) {
        console.error('Auth check failed:', error);
        setAuthError('Authentication check failed. Please try again.');
      } else {
        setAuthError(null);
      }
    } finally {
      isCheckingAuth.current = false;
    }
  };

  if (authenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg-primary">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-theme-secondary">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50">
        <div className="text-center max-w-md mx-4">
          <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            Messy Notes
          </h1>
          <p className="text-gray-600 mb-8 text-lg">Your thoughts, beautifully connected</p>
          
          {authError && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800 text-sm font-medium">{authError}</p>
            </div>
          )}
          
          <a 
            href={`${API}/auth/google`}
            className="inline-flex items-center gap-3 bg-white px-8 py-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 border border-gray-200 text-lg font-medium"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </a>
          
          <p className="mt-6 text-sm text-gray-500">
            Free forever • No credit card required
          </p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <NotesProvider>
        <MainLayout user={user} />
      </NotesProvider>
    </BrowserRouter>
  );
}