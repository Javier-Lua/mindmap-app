import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Folder, FileText, Brain } from 'lucide-react';

const API = import.meta.env.VITE_API_URL;

export default function Dashboard() {
  const [data, setData] = useState({ folders: [], recentNotes: [] });
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API}/api/home`, { withCredentials: true }).then(res => setData(res.data));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-10">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-center mb-10">
          <h1 className="text-3xl font-bold text-gray-800">Messy Notes</h1>
          <button 
            onClick={() => navigate('/mindmap')} 
            className="flex items-center gap-2 bg-black text-white px-6 py-3 rounded-lg hover:scale-105 transition"
          >
            <Brain size={20} /> Enter Graph Mode
          </button>
        </header>

        <section className="mb-10">
          <h2 className="text-gray-500 font-bold uppercase text-sm mb-4">Folders</h2>
          <div className="grid grid-cols-4 gap-4">
            {data.folders.map(f => (
              <div key={f.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md cursor-pointer transition" onClick={() => navigate('/mindmap?folder=' + f.id)}>
                <Folder className="text-blue-500 mb-2" />
                <h3 className="font-semibold">{f.name}</h3>
                <p className="text-xs text-gray-400">{f._count?.notes || 0} items</p>
              </div>
            ))}
            <div className="border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-400 cursor-pointer h-32 hover:border-gray-400" onClick={() => { /* Create folder logic */ }}>
              + New Folder
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-gray-500 font-bold uppercase text-sm mb-4">Recent Thoughts</h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y">
            {data.recentNotes.map(n => (
              <div 
                key={n.id} 
                onClick={() => navigate(`/note/${n.id}`)}
                className="p-4 hover:bg-gray-50 cursor-pointer flex items-center gap-3"
              >
                <FileText size={18} className="text-gray-400" />
                <span>{n.title}</span>
                <span className="ml-auto text-xs text-gray-400">
                  {new Date(n.updatedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}