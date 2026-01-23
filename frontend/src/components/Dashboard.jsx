import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Folder, FileText, Brain, Plus, Network, Sparkles, Trash2, Edit3, AlertTriangle } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Dashboard({ user, onUpdate }) {
  const [data, setData] = useState({ folders: [], recentNotes: [], stats: {} });
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState('');
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    axios.get(`${API}/api/home`, { withCredentials: true })
      .then(res => setData(res.data))
      .catch(err => console.error('Failed to load dashboard:', err));
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await axios.post(`${API}/api/folders`, { name: newFolderName }, { withCredentials: true });
      setNewFolderName('');
      setShowNewFolder(false);
      await loadData();
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Failed to create folder:', error);
      alert('Failed to create folder. Please try again.');
    }
  };

  const deleteFolder = async (folderId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this folder? Notes will be moved to root.')) return;
    
    try {
      await axios.delete(`${API}/api/folders/${folderId}`, { withCredentials: true });
      await loadData();
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Failed to delete folder:', error);
      alert('Failed to delete folder. Please try again.');
    }
  };

  const deleteNote = async (noteId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this note?')) return;
    
    try {
      // Optimistic update
      setData(prev => ({
        ...prev,
        recentNotes: prev.recentNotes.filter(n => n.id !== noteId),
        stats: { ...prev.stats, totalNotes: (prev.stats.totalNotes || 0) - 1 }
      }));
      
      await axios.delete(`${API}/api/notes/${noteId}`, { withCredentials: true });
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Failed to delete note:', error);
      alert('Failed to delete note.');
      loadData(); // Rollback on error
    }
  };

  const deleteAllNotes = async () => {
    if (deleteAllConfirm !== 'DELETE ALL') {
      alert('Please type "DELETE ALL" to confirm');
      return;
    }

    setIsDeletingAll(true);
    try {
      // Optimistic update
      setData(prev => ({
        ...prev,
        recentNotes: [],
        stats: { ...prev.stats, totalNotes: 0, totalLinks: 0 }
      }));

      const response = await axios.delete(`${API}/api/notes/all?confirm=DELETE_ALL`, { 
        withCredentials: true,
        timeout: 30000 // 30 second timeout for large deletions
      });

      console.log(`Deleted ${response.data.deleted} notes`);
      
      setShowDeleteAllModal(false);
      setDeleteAllConfirm('');
      
      if (onUpdate) onUpdate();
      
      // Show success message
      alert(`Successfully deleted ${response.data.deleted} notes`);
    } catch (error) {
      console.error('Failed to delete all notes:', error);
      alert('Failed to delete all notes. Some notes may have been deleted.');
      loadData(); // Reload to get accurate state
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-gray-100">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <header className="flex justify-between items-center mb-10 pb-6 border-b border-[#3d3d3d]">
          <div>
            <h1 className="text-3xl font-bold text-gray-100 mb-1">
              Dashboard
            </h1>
            <p className="text-gray-400">Overview of your notes and connections</p>
          </div>
          <div className="flex items-center gap-3">
            {data.stats.totalNotes > 0 && (
              <button
                onClick={() => setShowDeleteAllModal(true)}
                className="flex items-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-lg hover:bg-red-700 transition-all duration-200 font-medium shadow-sm"
              >
                <Trash2 size={18} /> Delete All
              </button>
            )}
            <button
              onClick={() => navigate('/mindmap')}
              className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-all duration-200 font-medium shadow-sm"
            >
              <Brain size={18} /> Open Mindmap
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-[#252526] rounded-lg p-5 shadow-sm border border-[#3d3d3d]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm mb-1">Total Notes</p>
                <p className="text-2xl font-bold text-gray-100">{data.stats.totalNotes || 0}</p>
              </div>
              <div className="p-3 bg-blue-500 bg-opacity-20 rounded-lg">
                <FileText className="text-blue-400" size={20} />
              </div>
            </div>
          </div>
          <div className="bg-[#252526] rounded-lg p-5 shadow-sm border border-[#3d3d3d]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm mb-1">Connections</p>
                <p className="text-2xl font-bold text-gray-100">{data.stats.totalLinks || 0}</p>
              </div>
              <div className="p-3 bg-green-500 bg-opacity-20 rounded-lg">
                <Network className="text-green-400" size={20} />
              </div>
            </div>
          </div>
          <div className="bg-[#252526] rounded-lg p-5 shadow-sm border border-[#3d3d3d]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm mb-1">Folders</p>
                <p className="text-2xl font-bold text-gray-100">{data.folders.length}</p>
              </div>
              <div className="p-3 bg-purple-500 bg-opacity-20 rounded-lg">
                <Folder className="text-purple-400" size={20} />
              </div>
            </div>
          </div>
        </div>

        {/* Folders Section */}
        <section className="mb-10">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-xl font-bold text-gray-100">Folders</h2>
            <button
              onClick={() => setShowNewFolder(!showNewFolder)}
              className="flex items-center gap-2 px-4 py-2 bg-[#252526] rounded-lg shadow-sm hover:bg-[#2a2d2e] transition-all duration-200 border border-[#3d3d3d] text-gray-300 font-medium text-sm"
            >
              <Plus size={16} /> New Folder
            </button>
          </div>

          {showNewFolder && (
            <div className="mb-5 bg-[#252526] rounded-lg p-5 shadow-sm border border-[#3d3d3d]">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && createFolder()}
                  placeholder="Folder name..."
                  className="flex-1 px-4 py-2 bg-[#1e1e1e] border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-gray-200"
                  autoFocus
                />
                <button
                  onClick={createFolder}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowNewFolder(false);
                    setNewFolderName('');
                  }}
                  className="px-5 py-2 bg-[#3d3d3d] text-gray-300 rounded-lg hover:bg-[#4d4d4d] transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 gap-4">
            {data.folders.map((f) => (
              <div
                key={f.id}
                onClick={() => navigate(`/mindmap/${f.id}`)}
                className="group bg-[#252526] rounded-lg p-5 shadow-sm border border-[#3d3d3d] hover:border-blue-500 cursor-pointer transition-all duration-200 relative"
              >
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={(e) => deleteFolder(f.id, e)}
                    className="p-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                    title="Delete folder"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-[#3d3d3d]">
                    <Folder className="text-gray-400" size={20} />
                  </div>
                </div>
                <h3 className="font-semibold text-gray-100 mb-1 group-hover:text-blue-400 transition-colors">
                  {f.name}
                </h3>
                <p className="text-sm text-gray-500">{f._count?.notes || 0} notes</p>
              </div>
            ))}
            
            {data.folders.length === 0 && !showNewFolder && (
              <div
                onClick={() => setShowNewFolder(true)}
                className="border-2 border-dashed border-[#3d3d3d] rounded-lg flex flex-col items-center justify-center text-gray-500 cursor-pointer hover:border-blue-500 hover:text-blue-400 transition-all duration-200 p-5 min-h-[140px]"
              >
                <Plus size={28} className="mb-2" />
                <p className="font-medium text-sm">Create folder</p>
              </div>
            )}
          </div>
        </section>

        {/* Recent Notes */}
        <section>
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-xl font-bold text-gray-100">Recent Notes</h2>
            <button
              onClick={() => navigate('/mindmap')}
              className="text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 text-sm"
            >
              View all →
            </button>
          </div>
          
          {data.recentNotes.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {data.recentNotes.map((n) => (
                <div
                  key={n.id}
                  onClick={() => navigate(`/note/${n.id}`)}
                  className="bg-[#252526] rounded-lg p-4 shadow-sm border border-[#3d3d3d] hover:border-blue-500 cursor-pointer transition-all duration-200 group relative"
                >
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => deleteNote(n.id, e)}
                      className="p-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                      title="Delete note"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="p-2 rounded-md bg-[#3d3d3d] flex-shrink-0">
                        <FileText size={16} className="text-gray-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-100 group-hover:text-blue-400 transition-colors text-sm truncate">
                          {n.title}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(n.updatedAt).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#252526] rounded-lg p-10 text-center shadow-sm border border-[#3d3d3d]">
              <Sparkles className="mx-auto mb-3 text-gray-500" size={40} />
              <p className="text-gray-400 mb-3">No notes yet</p>
              <button
                onClick={() => navigate('/')}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                Create Note
              </button>
            </div>
          )}
        </section>

        {/* Quick Tip */}
        <div className="mt-8 bg-blue-500 bg-opacity-10 rounded-lg p-5 border border-blue-500 border-opacity-30">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-500 bg-opacity-20 rounded-lg flex-shrink-0">
              <Sparkles className="text-blue-400" size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-100 mb-1 text-sm">Quick Tip</h3>
              <p className="text-gray-300 text-sm">Press <kbd className="px-2 py-0.5 bg-[#3d3d3d] rounded shadow-sm border border-[#4d4d4d] font-mono text-xs">Ctrl+K</kbd> anywhere to quickly capture a thought!</p>
            </div>
          </div>
        </div>
      </div>

      {/* Delete All Confirmation Modal */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-[#252526] rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border border-red-500">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-500 bg-opacity-20 rounded-lg">
                <AlertTriangle className="text-red-500" size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-100">Delete All Notes?</h3>
                <p className="text-sm text-gray-400">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-gray-300 mb-4 text-sm">
              You are about to delete <span className="font-bold text-red-400">{data.stats.totalNotes}</span> notes and all their connections.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Type <span className="font-mono bg-[#1e1e1e] px-2 py-0.5 rounded text-red-400">DELETE ALL</span> to confirm:
              </label>
              <input
                type="text"
                value={deleteAllConfirm}
                onChange={(e) => setDeleteAllConfirm(e.target.value)}
                className="w-full px-3 py-2 bg-[#1e1e1e] border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-200"
                placeholder="DELETE ALL"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteAllModal(false);
                  setDeleteAllConfirm('');
                }}
                disabled={isDeletingAll}
                className="flex-1 px-4 py-2 bg-[#3d3d3d] text-gray-300 rounded-lg hover:bg-[#4d4d4d] transition-colors font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={deleteAllNotes}
                disabled={deleteAllConfirm !== 'DELETE ALL' || isDeletingAll}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeletingAll ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}