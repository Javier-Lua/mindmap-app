import React, { useState, useEffect } from 'react';
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { Color } from '@tiptap/extension-color';
import { FontFamily } from '@tiptap/extension-font-family';
import { TextStyle } from '@tiptap/extension-text-style';
import { Typography } from '@tiptap/extension-typography';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Sparkles, MessageSquare, Mic, Layout, 
  Moon, Sun, Bold, Italic,
  Highlighter, Link as LinkIcon, Trash2, Plus, X
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function EditorPage({ onUserLoad }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState([]);
  const [linkerSuggestions, setLinkerSuggestions] = useState([]);
  const [showLinker, setShowLinker] = useState(false);
  const [isA4, setIsA4] = useState(true);
  const [theme, setTheme] = useState('dark');
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Inter');
  const [selectedText, setSelectedText] = useState('');
  const [connections, setConnections] = useState({ incoming: [], outgoing: [] });
  const [isCreatingNote, setIsCreatingNote] = useState(false);

  // Load or create note
  useEffect(() => {
    const loadOrCreateNote = async () => {
      // Handle "new" note case
      if (!id || id === 'new') {
        await createNewNote();
        return;
      }

      try {
        setLoading(true);
        const res = await axios.get(`${API}/api/notes/${id}`, { withCredentials: true });
        setNote(res.data);
        setAnnotations(res.data.annotations || []);
        setConnections({
          incoming: res.data.incoming || [],
          outgoing: res.data.outgoing || []
        });
        setLoading(false);
      } catch (error) {
        console.error('Failed to load note:', error);
        // If note doesn't exist, create a new one
        await createNewNote();
      }
    };
    
    loadOrCreateNote();
  }, [id]);

  // Load user data
  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await axios.get(`${API}/api/me`, { withCredentials: true });
        if (onUserLoad) {
          onUserLoad(res.data);
        }
      } catch (error) {
        console.error('Failed to load user:', error);
      }
    };
    loadUser();
  }, [onUserLoad]);

  const createNewNote = async () => {
    if (isCreatingNote) return;
    
    setIsCreatingNote(true);
    try {
      const res = await axios.post(`${API}/api/notes`, {
        ephemeral: true
      }, { withCredentials: true });
      
      setNote(res.data);
      setAnnotations([]);
      setConnections({ incoming: [], outgoing: [] });
      setLoading(false);
      
      // Update URL to the new note's ID
      navigate(`/note/${res.data.id}`, { replace: true });
    } catch (error) {
      console.error('Failed to create note:', error);
      setLoading(false);
    } finally {
      setIsCreatingNote(false);
    }
  };

  // Initialize editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: 'Start your messy thinking...' }),
      Color,
      FontFamily,
      TextStyle,
      Typography
    ],
    content: note?.content || '',
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-none focus:outline-none min-h-[400px]',
      },
    },
    onUpdate: ({ editor }) => {
      if (!note || !note.id) return;
      
      const json = editor.getJSON();
      const text = editor.getText();
      const title = text.split('\n')[0].slice(0, 50) || 'Untitled Thought';
      
      axios.put(`${API}/api/notes/${note.id}`, { 
        content: json, 
        plainText: text, 
        title, 
        messyMode: true 
      }, { withCredentials: true }).catch(err => console.error('Failed to save:', err));
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, ' ');
      setSelectedText(text);
    }
  });

  // Set editor content when note loads
  useEffect(() => {
    if (editor && note?.content && !loading) {
      editor.commands.setContent(note.content);
    }
  }, [editor, note, loading]);

  const runLinker = async () => {
    if (!selectedText.trim() || !note?.id) return;
    try {
      const res = await axios.post(`${API}/api/linker`, { 
        text: selectedText, 
        noteId: note.id 
      }, { withCredentials: true });
      setLinkerSuggestions(res.data.suggestions);
      setShowLinker(true);
    } catch (error) {
      console.error('Linker failed:', error);
    }
  };

  const addAnnotation = async () => {
    if (!selectedText.trim() || !note?.id) return;
    try {
      const newAnn = { text: selectedText, comment: '' };
      const res = await axios.post(`${API}/api/notes/${note.id}/annotations`, newAnn, { withCredentials: true });
      setAnnotations([...annotations, res.data]);
    } catch (error) {
      console.error('Failed to add annotation:', error);
    }
  };

  const updateAnnotation = async (ann, comment) => {
    try {
      await axios.put(`${API}/api/annotations/${ann.id}`, { comment }, { withCredentials: true });
      setAnnotations(annotations.map(a => a.id === ann.id ? { ...a, comment } : a));
    } catch (error) {
      console.error('Failed to update annotation:', error);
    }
  };

  const deleteAnnotation = async (annId) => {
    try {
      await axios.delete(`${API}/api/annotations/${annId}`, { withCredentials: true });
      setAnnotations(annotations.filter(a => a.id !== annId));
    } catch (error) {
      console.error('Failed to delete annotation:', error);
    }
  };

  const createLink = async (targetId) => {
    if (!note?.id) return;
    
    try {
      await axios.post(`${API}/api/links`, { 
        sourceId: note.id, 
        targetId 
      }, { withCredentials: true });
      setShowLinker(false);
      
      const res = await axios.get(`${API}/api/notes/${note.id}`, { withCredentials: true });
      setConnections({
        incoming: res.data.incoming || [],
        outgoing: res.data.outgoing || []
      });
    } catch (error) {
      console.error('Failed to create link:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e1e1e]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading note...</p>
        </div>
      </div>
    );
  }

  const themeClass = theme === 'dark' ? 'bg-[#1e1e1e] text-white' : 'bg-white text-gray-900';
  const sidebarClass = theme === 'dark' ? 'bg-[#252526] border-[#3d3d3d]' : 'bg-gray-50 border-gray-200';
  const paperClass = theme === 'dark' ? 'bg-[#252526] text-white' : 'bg-white text-gray-900';

  return (
    <div className={`flex h-screen ${themeClass} overflow-hidden`}>
      {/* Left Sidebar - Annotations & Connections */}
      <div className={`w-80 border-r p-5 overflow-y-auto ${sidebarClass}`}>
        {/* Connections */}
        <div className="mb-6">
          <h3 className="font-semibold text-gray-400 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
            <LinkIcon size={14} /> Connections
          </h3>
          
          {connections.outgoing.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-2">Links to:</p>
              {connections.outgoing.map(link => (
                <div
                  key={link.id}
                  onClick={() => navigate(`/note/${link.target.id}`)}
                  className="mb-2 p-2.5 bg-[#2a2d2e] border border-[#3d3d3d] rounded-md cursor-pointer hover:border-blue-500 hover:bg-[#2d3139] transition-colors text-sm"
                >
                  → {link.target.title}
                </div>
              ))}
            </div>
          )}

          {connections.incoming.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Linked from:</p>
              {connections.incoming.map(link => (
                <div
                  key={link.id}
                  onClick={() => navigate(`/note/${link.source.id}`)}
                  className="mb-2 p-2.5 bg-[#2a2d2e] border border-[#3d3d3d] rounded-md cursor-pointer hover:border-purple-500 hover:bg-[#2d3139] transition-colors text-sm"
                >
                  ← {link.source.title}
                </div>
              ))}
            </div>
          )}

          {connections.incoming.length === 0 && connections.outgoing.length === 0 && (
            <p className="text-sm text-gray-500 italic">No connections yet</p>
          )}
        </div>

        {/* Annotations */}
        <div>
          <h3 className="font-semibold text-gray-400 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
            <MessageSquare size={14} /> Annotations
          </h3>
          
          {annotations.map((ann) => (
            <div key={ann.id} className="mb-3 p-3 bg-yellow-900 bg-opacity-20 border border-yellow-700 border-opacity-30 rounded-md group">
              <div className="flex items-start justify-between mb-2">
                <div className="text-xs text-yellow-200 font-medium italic line-clamp-2 flex-1">
                  "{ann.text}"
                </div>
                <button
                  onClick={() => deleteAnnotation(ann.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0"
                >
                  <Trash2 size={12} className="text-red-400" />
                </button>
              </div>
              <textarea
                className="w-full text-sm bg-transparent focus:outline-none resize-none text-gray-300"
                placeholder="Add your comment..."
                value={ann.comment || ''}
                onChange={(e) => updateAnnotation(ann, e.target.value)}
                rows="2"
              />
            </div>
          ))}

          {annotations.length === 0 && (
            <p className="text-sm text-gray-500 italic">
              Highlight text to add annotations
            </p>
          )}
        </div>
      </div>

      {/* Main Editor */}
      <div className="flex-1 overflow-y-auto flex justify-center pt-8 pb-20 relative">
        {/* Floating Toolbar */}
        <div className="absolute top-4 right-4 flex gap-2 z-10">
          <button
            onClick={() => setIsA4(!isA4)}
            className="p-2 bg-[#2a2d2e] rounded-md shadow-sm hover:bg-[#37373d] transition-all border border-[#3d3d3d]"
            title="Toggle Width"
          >
            <Layout size={16} className="text-gray-400" />
          </button>
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="p-2 bg-[#2a2d2e] rounded-md shadow-sm hover:bg-[#37373d] transition-all border border-[#3d3d3d]"
            title="Toggle Theme"
          >
            {theme === 'light' ? <Moon size={16} className="text-gray-400" /> : <Sun size={16} className="text-gray-400" />}
          </button>
        </div>

        <div
          className={`relative ${isA4 ? 'w-[21cm]' : 'w-full max-w-4xl'} ${paperClass} shadow-sm p-16 rounded-lg`}
          style={{ minHeight: isA4 ? '29.7cm' : '800px' }}
        >
          {editor && (
            <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
              <div className="bg-[#2a2d2e] text-white rounded-lg px-3 py-2 flex items-center gap-1.5 shadow-xl border border-[#3d3d3d]">
                {/* Text Formatting */}
                <button
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  className={`p-1.5 rounded hover:bg-[#37373d] transition-colors ${editor.isActive('bold') ? 'bg-[#37373d]' : ''}`}
                  title="Bold"
                >
                  <Bold size={14} />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  className={`p-1.5 rounded hover:bg-[#37373d] transition-colors ${editor.isActive('italic') ? 'bg-[#37373d]' : ''}`}
                  title="Italic"
                >
                  <Italic size={14} />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleHighlight().run()}
                  className={`p-1.5 rounded hover:bg-[#37373d] transition-colors ${editor.isActive('highlight') ? 'bg-[#37373d]' : ''}`}
                  title="Highlight"
                >
                  <Highlighter size={14} />
                </button>

                <div className="w-px h-5 bg-[#3d3d3d] mx-1" />

                {/* Font Size */}
                <select
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  value={fontSize}
                  className="bg-[#1e1e1e] text-white text-xs rounded px-2 py-1 border border-[#3d3d3d] focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="12">12</option>
                  <option value="14">14</option>
                  <option value="16">16</option>
                  <option value="18">18</option>
                  <option value="20">20</option>
                  <option value="24">24</option>
                </select>

                {/* Text Color */}
                <input
                  type="color"
                  onInput={(e) => editor.chain().focus().setColor(e.target.value).run()}
                  className="w-6 h-6 rounded cursor-pointer border border-[#3d3d3d]"
                  title="Text Color"
                />

                <div className="w-px h-5 bg-[#3d3d3d] mx-1" />

                {/* Linker */}
                <button
                  onClick={runLinker}
                  className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                  title="Find related notes"
                >
                  <Sparkles size={12} />
                  <span className="text-xs font-medium">Link</span>
                </button>

                {/* Annotate */}
                <button
                  onClick={addAnnotation}
                  className="flex items-center gap-1 px-2 py-1 bg-yellow-600 hover:bg-yellow-700 rounded transition-colors"
                  title="Add annotation"
                >
                  <MessageSquare size={12} />
                  <span className="text-xs font-medium">Note</span>
                </button>
              </div>
            </BubbleMenu>
          )}

          <EditorContent
            editor={editor}
            style={{ fontSize: `${fontSize}px`, fontFamily }}
          />
        </div>
      </div>

      {/* Linker Suggestions Panel */}
      {showLinker && (
        <div className="absolute top-20 right-8 w-80 bg-[#252526] rounded-lg shadow-xl border border-[#3d3d3d] p-4 z-50">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-base font-semibold text-gray-200 flex items-center gap-2">
              <Sparkles size={16} className="text-blue-500" />
              Related Notes
            </h4>
            <button
              onClick={() => setShowLinker(false)}
              className="text-gray-500 hover:text-gray-300"
            >
              <X size={18} />
            </button>
          </div>

          {linkerSuggestions.length > 0 ? (
            <div className="space-y-2">
              {linkerSuggestions.map(s => (
                <div
                  key={s.id}
                  onClick={() => createLink(s.id)}
                  className="p-3 bg-blue-900 bg-opacity-20 hover:bg-opacity-30 rounded-md cursor-pointer transition-colors border border-blue-700 border-opacity-30"
                >
                  <div className="font-medium text-gray-200 text-sm mb-1">
                    {s.title}
                  </div>
                  <div className="text-xs text-blue-400">
                    {s.reason}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-gray-400 text-sm">No similar notes found</p>
              <p className="text-xs text-gray-600 mt-1">Try selecting different text</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}