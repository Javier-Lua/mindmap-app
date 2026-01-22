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

  const colors = ['#FEE2E2', '#DBEAFE', '#E0E7FF', '#FCE7F3', '#FEF3C7', '#D1FAE5'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
              Messy Notes
            </h1>
            <p className="text-gray-500">Welcome back, {user?.name || 'there'}!</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/mindmap')}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-xl hover:shadow-lg transition-all duration-200 font-medium"
            >
              <Brain size={20} /> Open Mindmap
            </button>
            <button
              onClick={handleLogout}
              className="p-3 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 border border-gray-200"
              title="Logout"
            >
              <LogOut size={20} className="text-gray-600" />
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm mb-1">Total Notes</p>
                <p className="text-3xl font-bold text-gray-800">{data.stats.totalNotes || 0}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-xl">
                <FileText className="text-purple-600" size={24} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm mb-1">Connections</p>
                <p className="text-3xl font-bold text-gray-800">{data.stats.totalLinks || 0}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-xl">
                <Network className="text-blue-600" size={24} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm mb-1">Folders</p>
                <p className="text-3xl font-bold text-gray-800">{data.folders.length}</p>
              </div>
              <div className="p-3 bg-pink-100 rounded-xl">
                <Folder className="text-pink-600" size={24} />
              </div>
            </div>
          </div>
        </div>

        {/* Folders Section */}
        <section className="mb-10">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Your Folders</h2>
            <button
              onClick={() => setShowNewFolder(!showNewFolder)}
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border border-gray-200 text-gray-700 font-medium"
            >
              <Plus size={18} /> New Folder
            </button>
          </div>

          {showNewFolder && (
            <div className="mb-6 bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && createFolder()}
                  placeholder="Folder name (e.g., GEC, ENC, Personal)"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                  autoFocus
                />
                <button
                  onClick={createFolder}
                  className="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors font-medium"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowNewFolder(false);
                    setNewFolderName('');
                  }}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors"
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
                className="group bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 cursor-pointer transition-all duration-200"
                style={{ borderTop: `4px solid ${colors[idx % colors.length]}` }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-3 rounded-xl" style={{ backgroundColor: colors[idx % colors.length] + '40' }}>
                    <Folder style={{ color: colors[idx % colors.length].replace('FE', '60') }} size={24} />
                  </div>
                </div>
                <h3 className="font-bold text-gray-800 mb-1 text-lg group-hover:text-purple-600 transition-colors">
                  {f.name}
                </h3>
                <p className="text-sm text-gray-500">{f._count?.notes || 0} notes</p>
              </div>
            ))}
            
            {data.folders.length === 0 && !showNewFolder && (
              <div
                onClick={() => setShowNewFolder(true)}
                className="border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:border-purple-400 hover:text-purple-400 transition-all duration-200 p-6 min-h-[160px]"
              >
                <Plus size={32} className="mb-2" />
                <p className="font-medium">Create your first folder</p>
              </div>
            )}
          </div>
        </section>

        {/* Recent Notes */}
        <section>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Recent Thoughts</h2>
            <button
              onClick={() => navigate('/mindmap')}
              className="text-purple-600 hover:text-purple-700 font-medium flex items-center gap-2"
            >
              View all in mindmap →
            </button>
          </div>
          
          {data.recentNotes.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {data.recentNotes.map((n) => (
                <div
                  key={n.id}
                  onClick={() => navigate(`/note/${n.id}`)}
                  className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer transition-all duration-200 group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ backgroundColor: n.color + '40' }}>
                        <FileText size={18} className="text-gray-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-800 group-hover:text-purple-600 transition-colors line-clamp-1">
                          {n.title}
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">
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
            <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
              <Sparkles className="mx-auto mb-4 text-purple-400" size={48} />
              <p className="text-gray-500 text-lg mb-4">No notes yet. Start capturing your thoughts!</p>
              <button
                onClick={() => navigate('/mindmap')}
                className="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors font-medium"
              >
                Open Mindmap
              </button>
            </div>
          )}
        </section>

        {/* Quick Tip */}
        <div className="mt-8 bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl p-6 border border-purple-100">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white rounded-xl shadow-sm">
              <Sparkles className="text-purple-600" size={24} />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 mb-2">Quick Tip</h3>
              <p className="text-gray-600">Press <kbd className="px-2 py-1 bg-white rounded shadow-sm border border-gray-200 font-mono text-sm">Ctrl+K</kbd> anywhere to quickly capture a thought without leaving your current page!</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}