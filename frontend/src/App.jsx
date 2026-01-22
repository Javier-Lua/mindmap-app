import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  FileText, Home, Network, Search, Plus, Folder, 
  LogOut, Star, Clock, Archive, ChevronRight, ChevronDown,
  LayoutGrid, Zap
} from 'lucide-react';

// Import components
import EditorPage from './components/EditorPage';
import MessyMap from './components/MessyMap';
import Dashboard from './components/Dashboard';
import QuickCapture from './components/QuickCapture';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Add global axios interceptor for auth errors
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.data?.action === 'REAUTH_REQUIRED') {
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

function Sidebar({ user, currentNoteId, onSelectNote, onNewNote, onLogout }) {
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState('recent');
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    loadNotes();
    loadFolders();
    
    // Refresh notes every 30 seconds
    const interval = setInterval(loadNotes, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadNotes = async () => {
    try {
      const res = await axios.get(`${API}/api/notes`, { withCredentials: true });
      setNotes(res.data);
    } catch (error) {
      console.error('Failed to load notes:', error);
    }
  };

  const loadFolders = async () => {
    try {
      const res = await axios.get(`${API}/api/home`, { withCredentials: true });
      setFolders(res.data.folders);
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  };

  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const recentNotes = filteredNotes.slice(0, 10);
  const stickyNotes = filteredNotes.filter(n => n.sticky);
  const ephemeralNotes = filteredNotes.filter(n => n.ephemeral);

  const getDisplayNotes = () => {
    switch (activeSection) {
      case 'sticky': return stickyNotes;
      case 'ephemeral': return ephemeralNotes;
      case 'recent':
      default: return recentNotes;
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
    <div className="w-64 h-screen bg-[#252526] text-gray-300 flex flex-col border-r border-[#3d3d3d]">
      {/* Header */}
      <div className="p-4 border-b border-[#3d3d3d]">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-sm font-semibold text-gray-100">Messy Notes</h1>
          <button
            onClick={onLogout}
            className="p-1.5 hover:bg-[#3d3d3d] rounded transition-colors"
            title="Logout"
          >
            <LogOut size={14} />
          </button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-2 top-2 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="w-full pl-7 pr-2 py-1.5 bg-[#3d3d3d] border border-[#4d4d4d] rounded text-xs focus:outline-none focus:border-blue-500 text-gray-200"
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto">
        {/* Quick Actions */}
        <div className="p-2 space-y-1">
          <button
            onClick={onNewNote}
            className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-[#2a2d2e] rounded text-xs text-left transition-colors"
          >
            <Plus size={14} className="text-blue-400" />
            <span>New Note</span>
          </button>
          
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-[#2a2d2e] rounded text-xs text-left transition-colors"
          >
            <LayoutGrid size={14} className="text-purple-400" />
            <span>Dashboard</span>
          </button>
          
          <button
            onClick={() => navigate('/mindmap')}
            className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-[#2a2d2e] rounded text-xs text-left transition-colors"
          >
            <Network size={14} className="text-green-400" />
            <span>Mindmap</span>
          </button>
        </div>

        <div className="h-px bg-[#3d3d3d] my-2" />

        {/* Sections */}
        <div className="px-2 space-y-1">
          <button
            onClick={() => setActiveSection('recent')}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${
              activeSection === 'recent' ? 'bg-[#37373d]' : 'hover:bg-[#2a2d2e]'
            }`}
          >
            <Clock size={14} />
            <span>Recent</span>
            <span className="ml-auto text-[10px] text-gray-500">{recentNotes.length}</span>
          </button>
          
          <button
            onClick={() => setActiveSection('sticky')}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${
              activeSection === 'sticky' ? 'bg-[#37373d]' : 'hover:bg-[#2a2d2e]'
            }`}
          >
            <Star size={14} className="text-yellow-400" />
            <span>Pinned</span>
            <span className="ml-auto text-[10px] text-gray-500">{stickyNotes.length}</span>
          </button>
          
          <button
            onClick={() => setActiveSection('ephemeral')}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${
              activeSection === 'ephemeral' ? 'bg-[#37373d]' : 'hover:bg-[#2a2d2e]'
            }`}
          >
            <Zap size={14} className="text-gray-400" />
            <span>Quick Notes</span>
            <span className="ml-auto text-[10px] text-gray-500">{ephemeralNotes.length}</span>
          </button>
        </div>

        <div className="h-px bg-[#3d3d3d] my-2" />

        {/* Folders */}
        <div className="px-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 px-2 py-1 mb-1">
            Folders
          </div>
          {folders.map(folder => (
            <button
              key={folder.id}
              onClick={() => {
                toggleFolder(folder.id);
                navigate(`/mindmap/${folder.id}`);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-[#2a2d2e] rounded text-xs text-left transition-colors"
            >
              {expandedFolders.has(folder.id) ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
              <Folder size={14} className="text-blue-400" />
              <span className="flex-1 truncate">{folder.name}</span>
              <span className="text-[10px] text-gray-500">{folder._count?.notes || 0}</span>
            </button>
          ))}
        </div>

        <div className="h-px bg-[#3d3d3d] my-2" />

        {/* Notes List */}
        <div className="px-2 pb-4">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 px-2 py-1 mb-1">
            Notes
          </div>
          {getDisplayNotes().map(note => (
            <button
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors group ${
                currentNoteId === note.id ? 'bg-[#37373d] text-white' : 'hover:bg-[#2a2d2e]'
              }`}
            >
              <FileText size={12} className={note.sticky ? 'text-yellow-400' : 'text-gray-500'} />
              <div className="flex-1 min-w-0">
                <div className="truncate">{note.title}</div>
                <div className="text-[10px] text-gray-500">
                  {new Date(note.updatedAt).toLocaleDateString()}
                </div>
              </div>
              {note.sticky && <Star size={10} className="text-yellow-400" fill="currentColor" />}
              {note.ephemeral && <Zap size={10} className="text-gray-500" />}
            </button>
          ))}
          
          {getDisplayNotes().length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-gray-500">
              No notes found
            </div>
          )}
        </div>
      </div>

      {/* User Info */}
      <div className="p-3 border-t border-[#3d3d3d]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-semibold">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-gray-200 truncate">{user?.name || 'User'}</div>
            <div className="text-[10px] text-gray-500 truncate">{user?.email}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MainLayout() {
  const [user, setUser] = useState(null);
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [currentNoteId, setCurrentNoteId] = useState(null);
  const navigate = useNavigate();
  const params = useParams();

  useEffect(() => {
    if (params.id) {
      setCurrentNoteId(params.id);
    }
  }, [params.id]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowQuickCapture(true);
      }
      if (e.key === 'Escape') {
        setShowQuickCapture(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNewNote = async () => {
    try {
      const res = await axios.post(`${API}/api/notes`, {}, { withCredentials: true });
      navigate(`/note/${res.data.id}`);
      setCurrentNoteId(res.data.id);
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  const handleSelectNote = (noteId) => {
    navigate(`/note/${noteId}`);
    setCurrentNoteId(noteId);
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/api/logout`, {}, { withCredentials: true });
      window.location.reload();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#1e1e1e]">
      <Sidebar
        user={user}
        currentNoteId={currentNoteId}
        onSelectNote={handleSelectNote}
        onNewNote={handleNewNote}
        onLogout={handleLogout}
      />
      
      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/note/new" replace />} />
          <Route path="/note/:id" element={<EditorPage onUserLoad={setUser} />} />
          <Route path="/dashboard" element={<Dashboard user={user} />} />
          <Route path="/mindmap" element={<MessyMap />} />
          <Route path="/mindmap/:folderId" element={<MessyMap />} />
          <Route path="*" element={<Navigate to="/note/new" replace />} />
        </Routes>
      </div>

      {showQuickCapture && (
        <QuickCapture onClose={() => setShowQuickCapture(false)} />
      )}
    </div>
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(null);
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await axios.get(`${API}/api/me`, { withCredentials: true });
      setAuthenticated(true);
      setUser(res.data);
      setAuthError(null);
    } catch (error) {
      console.error('Auth check failed:', error);
      setAuthenticated(false);
      
      if (error.response?.data?.action === 'REAUTH_REQUIRED') {
        setAuthError(error.response.data.error || 'Please sign in again');
      }
    }
  };

  if (authenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e1e1e]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
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
      <MainLayout user={user} />
    </BrowserRouter>
  );
}