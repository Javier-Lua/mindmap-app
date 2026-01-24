import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Folder, FileText, Brain, Plus, Network, Sparkles, Trash2, Edit3, AlertTriangle } from 'lucide-react';
import { useNotes } from '../contexts/NotesContext';

export default function Dashboard({ user }) {
  const navigate = useNavigate();
  const { 
    notes, 
    folders, 
    loadNotes, 
    loadFolders, 
    createFolder, 
    updateFolder, 
    deleteFolder, 
    deleteNote, 
    deleteAllNotes,
    lastSync 
  } = useNotes();
  
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState('');
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  useEffect(() => {
    // Only reload if data is stale (older than 5 seconds)
    const now = Date.now();
    const isStale = !lastSync || (now - lastSync) > 5000;
    
    // Only load if stale AND we haven't loaded yet
    // Don't reload just because notes/folders are empty (user might have deleted all)
    if (isStale && notes.length === 0 && !lastSync) {
      loadNotes(true);
    }
    
    if (isStale && folders.length === 0 && !lastSync) {
      loadFolders();
    }
  }, [loadNotes, loadFolders, lastSync, notes.length, folders.length]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder(newFolderName);
      setNewFolderName('');
      setShowNewFolder(false);
    } catch (error) {
      alert('Failed to create folder. Please try again.');
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

  const handleDeleteNote = async (noteId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this note?')) return;
    
    try {
      await deleteNote(noteId);
    } catch (error) {
      alert('Failed to delete note.');
    }
  };

  const handleDeleteAllNotes = async () => {
    if (deleteAllConfirm !== 'DELETE ALL') {
      alert('Please type "DELETE ALL" to confirm');
      return;
    }

    setIsDeletingAll(true);
    try {
      await deleteAllNotes();
      setShowDeleteAllModal(false);
      setDeleteAllConfirm('');
      alert(`Successfully deleted all notes`);
    } catch (error) {
      alert('Failed to delete all notes: ' + error.message);
    } finally {
      setIsDeletingAll(false);
    }
  };

  const recentNotes = notes.slice(0, 8);
  const totalLinks = 0;

  return (
    <div className="min-h-screen theme-bg-primary theme-text-primary">
      <div className="max-w-7xl mx-auto p-8">
        <header className="flex justify-between items-center mb-10 pb-6 border-b border-theme-primary">
          <div>
            <h1 className="text-3xl font-bold theme-text-primary mb-1">
              Dashboard
            </h1>
            <p className="text-theme-secondary">Overview of your notes and connections</p>
          </div>
          <div className="flex items-center gap-3">
            {notes.length > 0 && (
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

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="card-themed rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-theme-secondary text-sm mb-1">Total Notes</p>
                <p className="text-2xl font-bold theme-text-primary">{notes.length}</p>
              </div>
              <div className="p-3 bg-blue-500 bg-opacity-20 rounded-lg">
                <FileText className="text-blue-400" size={20} />
              </div>
            </div>
          </div>
          <div className="card-themed rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-theme-secondary text-sm mb-1">Connections</p>
                <p className="text-2xl font-bold theme-text-primary">{totalLinks}</p>
              </div>
              <div className="p-3 bg-green-500 bg-opacity-20 rounded-lg">
                <Network className="text-green-400" size={20} />
              </div>
            </div>
          </div>
          <div className="card-themed rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-theme-secondary text-sm mb-1">Folders</p>
                <p className="text-2xl font-bold theme-text-primary">{folders.length}</p>
              </div>
              <div className="p-3 bg-purple-500 bg-opacity-20 rounded-lg">
                <Folder className="text-purple-400" size={20} />
              </div>
            </div>
          </div>
        </div>

        <section className="mb-10">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-xl font-bold theme-text-primary">Folders</h2>
            <button
              onClick={() => setShowNewFolder(!showNewFolder)}
              className="flex items-center gap-2 px-4 py-2 btn-secondary rounded-lg shadow-sm transition-all duration-200 font-medium text-sm"
            >
              <Plus size={16} /> New Folder
            </button>
          </div>

          {showNewFolder && (
            <div className="mb-5 card-themed rounded-lg p-5">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
                  placeholder="Folder name..."
                  className="flex-1 px-4 py-2 input-themed rounded-lg text-sm"
                  autoFocus
                />
                <button
                  onClick={handleCreateFolder}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowNewFolder(false);
                    setNewFolderName('');
                  }}
                  className="px-5 py-2 btn-secondary rounded-lg transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 gap-4">
            {folders.map((f) => (
              <div
                key={f.id}
                onClick={() => navigate(`/mindmap/${f.id}`)}
                className="group card-themed rounded-lg p-5 hover:border-blue-500 cursor-pointer transition-all duration-200 relative"
              >
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={(e) => handleDeleteFolder(f.id, e)}
                    className="p-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                    title="Delete folder"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-theme-tertiary">
                    <Folder className="text-theme-secondary" size={20} />
                  </div>
                </div>
                <h3 className="font-semibold theme-text-primary mb-1 group-hover:text-blue-400 transition-colors">
                  {f.name}
                </h3>
                <p className="text-sm text-theme-tertiary">{f._count?.notes || 0} notes</p>
              </div>
            ))}
            
            {folders.length === 0 && !showNewFolder && (
              <div
                onClick={() => setShowNewFolder(true)}
                className="border-2 border-dashed border-theme-primary rounded-lg flex flex-col items-center justify-center text-theme-tertiary cursor-pointer hover:border-blue-500 hover:text-blue-400 transition-all duration-200 p-5 min-h-[140px]"
              >
                <Plus size={28} className="mb-2" />
                <p className="font-medium text-sm">Create folder</p>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-xl font-bold theme-text-primary">Recent Notes</h2>
            <button
              onClick={() => navigate('/mindmap')}
              className="text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 text-sm"
            >
              View all →
            </button>
          </div>
          
          {recentNotes.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {recentNotes.map((n) => (
                <div
                  key={n.id}
                  onClick={() => navigate(`/note/${n.id}`)}
                  className="card-themed rounded-lg p-4 hover:border-blue-500 cursor-pointer transition-all duration-200 group relative"
                >
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleDeleteNote(n.id, e)}
                      className="p-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                      title="Delete note"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="p-2 rounded-md bg-theme-tertiary flex-shrink-0">
                        <FileText size={16} className="text-theme-secondary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold theme-text-primary group-hover:text-blue-400 transition-colors text-sm truncate">
                          {n.title}
                        </h3>
                        <p className="text-xs text-theme-tertiary mt-0.5">
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
            <div className="card-themed rounded-lg p-10 text-center">
              <Sparkles className="mx-auto mb-3 text-theme-tertiary" size={40} />
              <p className="text-theme-secondary mb-3">No notes yet</p>
              <button
                onClick={() => navigate('/')}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                Create Note
              </button>
            </div>
          )}
        </section>

        <div className="mt-8 bg-blue-500 bg-opacity-10 rounded-lg p-5 border border-blue-500 border-opacity-30">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-500 bg-opacity-20 rounded-lg flex-shrink-0">
              <Sparkles className="text-blue-400" size={20} />
            </div>
            <div>
              <h3 className="font-semibold theme-text-primary mb-1 text-sm">Quick Tip</h3>
              <p className="text-theme-secondary text-sm">Press <kbd className="px-2 py-0.5 bg-theme-tertiary rounded shadow-sm border border-theme-primary font-mono text-xs">Ctrl+K</kbd> anywhere to quickly capture a thought!</p>
            </div>
          </div>
        </div>
      </div>

      {showDeleteAllModal && (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50">
          <div className="modal-themed rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border border-red-500">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-500 bg-opacity-20 rounded-lg">
                <AlertTriangle className="text-red-500" size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold theme-text-primary">Delete All Notes?</h3>
                <p className="text-sm text-theme-secondary">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-theme-secondary mb-4 text-sm">
              You are about to delete <span className="font-bold text-red-400">{notes.length}</span> notes and all their connections.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-theme-secondary mb-2">
                Type <span className="font-mono bg-theme-tertiary px-2 py-0.5 rounded text-red-400">DELETE ALL</span> to confirm:
              </label>
              <input
                type="text"
                value={deleteAllConfirm}
                onChange={(e) => setDeleteAllConfirm(e.target.value)}
                className="w-full px-3 py-2 input-themed rounded-lg"
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
                className="flex-1 px-4 py-2 btn-secondary rounded-lg transition-colors font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAllNotes}
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