import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Folder, FileText, Brain, Plus, Network, Search, LogOut, Sparkles } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Dashboard({ user }) {
  const [data, setData] = useState({ folders: [], recentNotes: [], stats: {} });
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    axios.get(`${API}/api/home`, { withCredentials: true })
      .then(res => setData(res.data));
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await axios.post(`${API}/api/folders`, { name: newFolderName }, { withCredentials: true });
      setNewFolderName('');
      setShowNewFolder(false);
      await loadData();
    } catch (error) {
      console.error('Failed to create folder:', error);
      alert('Failed to create folder. Please try again.');
    }
  };

  const handleLogout = async () => {
    await axios.post(`${API}/api/logout`, {}, { withCredentials: true });
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <header className="flex justify-between items-center mb-10 pb-6 border-b border-gray-200">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">
              Messy Notes
            </h1>
            <p className="text-gray-600">Welcome back, {user?.name || 'there'}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/mindmap')}
              className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-all duration-200 font-medium shadow-sm"
            >
              <Brain size={18} /> Open Mindmap
            </button>
            <button
              onClick={handleLogout}
              className="p-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-all duration-200"
              title="Logout"
            >
              <LogOut size={18} className="text-gray-700" />
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">Total Notes</p>
                <p className="text-2xl font-bold text-gray-900">{data.stats.totalNotes || 0}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <FileText className="text-blue-600" size={20} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">Connections</p>
                <p className="text-2xl font-bold text-gray-900">{data.stats.totalLinks || 0}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <Network className="text-green-600" size={20} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">Folders</p>
                <p className="text-2xl font-bold text-gray-900">{data.folders.length}</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <Folder className="text-purple-600" size={20} />
              </div>
            </div>
          </div>
        </div>

        {/* Folders Section */}
        <section className="mb-10">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-xl font-bold text-gray-900">Folders</h2>
            <button
              onClick={() => setShowNewFolder(!showNewFolder)}
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border border-gray-200 text-gray-700 font-medium text-sm"
            >
              <Plus size={16} /> New Folder
            </button>
          </div>

          {showNewFolder && (
            <div className="mb-5 bg-white rounded-lg p-5 shadow-sm border border-gray-200">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && createFolder()}
                  placeholder="Folder name..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
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
                  className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 gap-4">
            {data.folders.map((f, idx) => (
              <div
                key={f.id}
                onClick={() => navigate(`/mindmap/${f.id}`)}
                className="group bg-white rounded-lg p-5 shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 cursor-pointer transition-all duration-200"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-gray-100">
                    <Folder className="text-gray-600" size={20} />
                  </div>
                </div>
                <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                  {f.name}
                </h3>
                <p className="text-sm text-gray-500">{f._count?.notes || 0} notes</p>
              </div>
            ))}
            
            {data.folders.length === 0 && !showNewFolder && (
              <div
                onClick={() => setShowNewFolder(true)}
                className="border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:border-blue-400 hover:text-blue-400 transition-all duration-200 p-5 min-h-[140px]"
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
            <h2 className="text-xl font-bold text-gray-900">Recent Notes</h2>
            <button
              onClick={() => navigate('/mindmap')}
              className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 text-sm"
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
                  className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 cursor-pointer transition-all duration-200 group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="p-2 rounded-md bg-gray-100 flex-shrink-0">
                        <FileText size={16} className="text-gray-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors text-sm truncate">
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
            <div className="bg-white rounded-lg p-10 text-center shadow-sm border border-gray-200">
              <Sparkles className="mx-auto mb-3 text-gray-400" size={40} />
              <p className="text-gray-600 mb-3">No notes yet</p>
              <button
                onClick={() => navigate('/mindmap')}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                Create Note
              </button>
            </div>
          )}
        </section>

        {/* Quick Tip */}
        <div className="mt-8 bg-blue-50 rounded-lg p-5 border border-blue-100">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
              <Sparkles className="text-blue-600" size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1 text-sm">Quick Tip</h3>
              <p className="text-gray-700 text-sm">Press <kbd className="px-2 py-0.5 bg-white rounded shadow-sm border border-gray-300 font-mono text-xs">Ctrl+K</kbd> anywhere to quickly capture a thought!</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}