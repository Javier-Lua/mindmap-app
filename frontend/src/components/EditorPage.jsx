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
  Sparkles, MessageSquare, ArrowLeft, Mic, Layout, 
  Moon, Sun, Type, Palette, Bold, Italic, Underline,
  Highlighter, Link as LinkIcon, Trash2, Plus, X
} from 'lucide-react';
import { Document as PDFDocument, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState([]);
  const [linkerSuggestions, setLinkerSuggestions] = useState([]);
  const [showLinker, setShowLinker] = useState(false);
  const [isA4, setIsA4] = useState(true);
  const [theme, setTheme] = useState('light');
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Inter');
  const [selectedText, setSelectedText] = useState('');
  const [floatingTexts, setFloatingTexts] = useState([]);
  const [showFloatingInput, setShowFloatingInput] = useState(false);
  const [connections, setConnections] = useState({ incoming: [], outgoing: [] });

  // Load note data
  useEffect(() => {
    const loadNote = async () => {
      if (!id) {
        navigate('/mindmap');
        return;
      }

      try {
        setLoading(true);
        const res = await axios.get(`${API}/api/notes/${id}`, { withCredentials: true });
        console.log('Note loaded:', res.data);
        setNote(res.data);
        setAnnotations(res.data.annotations || []);
        setConnections({
          incoming: res.data.incoming || [],
          outgoing: res.data.outgoing || []
        });
        setLoading(false);
      } catch (error) {
        console.error('Failed to load note:', error);
        alert('Failed to load note. Redirecting to mindmap.');
        navigate('/mindmap');
      }
    };
    
    loadNote();
  }, [id, navigate]);

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
      if (!note) return;
      const json = editor.getJSON();
      const text = editor.getText();
      const title = text.split('\n')[0] || 'Untitled Thought';
      axios.put(`${API}/api/notes/${id}`, { 
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
      console.log('Setting editor content:', note.content);
      editor.commands.setContent(note.content);
    }
  }, [editor, note, loading]);

  const runLinker = async () => {
    if (!selectedText.trim()) return;
    try {
      const res = await axios.post(`${API}/api/linker`, { 
        text: selectedText, 
        noteId: id 
      }, { withCredentials: true });
      setLinkerSuggestions(res.data.suggestions);
      setShowLinker(true);
    } catch (error) {
      console.error('Linker failed:', error);
    }
  };

  const addAnnotation = async () => {
    if (!selectedText.trim()) return;
    try {
      const newAnn = { text: selectedText, comment: '' };
      const res = await axios.post(`${API}/api/notes/${id}/annotations`, newAnn, { withCredentials: true });
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
    try {
      await axios.post(`${API}/api/links`, { 
        sourceId: id, 
        targetId 
      }, { withCredentials: true });
      setShowLinker(false);
      
      const res = await axios.get(`${API}/api/notes/${id}`, { withCredentials: true });
      setConnections({
        incoming: res.data.incoming || [],
        outgoing: res.data.outgoing || []
      });
    } catch (error) {
      console.error('Failed to create link:', error);
    }
  };

  const addFloatingText = () => {
    const newText = {
      id: Date.now(),
      content: '',
      x: Math.random() * 300,
      y: Math.random() * 300
    };
    setFloatingTexts([...floatingTexts, newText]);
    setShowFloatingInput(false);
  };

  const updateFloatingText = (id, content) => {
    setFloatingTexts(floatingTexts.map(t => t.id === id ? { ...t, content } : t));
  };

  const deleteFloatingText = (id) => {
    setFloatingTexts(floatingTexts.filter(t => t.id !== id));
  };

  if (loading || !note) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading note...</p>
        </div>
      </div>
    );
  }

  const isPdf = note.type === 'pdf';
  const themeClass = theme === 'dark' 
    ? 'bg-gray-900 text-white' 
    : 'bg-white text-gray-900';
  const sidebarClass = theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200';
  const paperClass = theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-900';

  return (
    <div className={`flex h-screen ${themeClass} overflow-hidden`}>
      {/* Left Sidebar - Annotations & Connections */}
      <div className={`w-80 border-r p-5 overflow-y-auto ${sidebarClass}`}>
        <button 
          onClick={() => navigate('/mindmap')} 
          className="mb-5 flex items-center text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium"
        >
          <ArrowLeft size={16} className="mr-2" /> Back to Mindmap
        </button>

        {/* Connections */}
        <div className="mb-6">
          <h3 className="font-semibold text-gray-700 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
            <LinkIcon size={14} /> Connections
          </h3>
          
          {connections.outgoing.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-2">Links to:</p>
              {connections.outgoing.map(link => (
                <div
                  key={link.id}
                  onClick={() => navigate(`/note/${link.target.id}`)}
                  className="mb-2 p-2.5 bg-white border border-gray-200 rounded-md cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm"
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
                  className="mb-2 p-2.5 bg-white border border-gray-200 rounded-md cursor-pointer hover:border-purple-300 hover:bg-purple-50 transition-colors text-sm"
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
          <h3 className="font-semibold text-gray-700 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
            <MessageSquare size={14} /> Annotations
          </h3>
          
          {annotations.map((ann) => (
            <div key={ann.id} className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md group">
              <div className="flex items-start justify-between mb-2">
                <div className="text-xs text-yellow-900 font-medium italic line-clamp-2 flex-1">
                  "{ann.text}"
                </div>
                <button
                  onClick={() => deleteAnnotation(ann.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0"
                >
                  <Trash2 size={12} className="text-red-500" />
                </button>
              </div>
              <textarea
                className="w-full text-sm bg-transparent focus:outline-none resize-none text-gray-700"
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
      <div className="flex-1 overflow-y-auto flex justify-center pt-8 pb-20 relative bg-gray-50">
        {/* Floating Toolbar */}
        <div className="absolute top-4 right-4 flex gap-2 z-10">
          <button
            onClick={() => setIsA4(!isA4)}
            className="p-2 bg-white rounded-md shadow-sm hover:shadow-md transition-all border border-gray-200"
            title="Toggle Width"
          >
            <Layout size={16} className="text-gray-700" />
          </button>
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="p-2 bg-white rounded-md shadow-sm hover:shadow-md transition-all border border-gray-200"
            title="Toggle Theme"
          >
            {theme === 'light' ? <Moon size={16} className="text-gray-700" /> : <Sun size={16} className="text-gray-700" />}
          </button>
          <button
            onClick={() => setShowFloatingInput(!showFloatingInput)}
            className="p-2 bg-blue-600 text-white rounded-md shadow-sm hover:shadow-md transition-all"
            title="Add Floating Text"
          >
            <Plus size={16} />
          </button>
        </div>

        <div
          className={`relative ${isA4 ? 'w-[21cm]' : 'w-full max-w-4xl'} ${paperClass} shadow-sm p-16 rounded-lg`}
          style={{ minHeight: isA4 ? '29.7cm' : '800px' }}
        >
          {/* Floating Texts */}
          {floatingTexts.map(ft => (
            <div
              key={ft.id}
              className="absolute bg-yellow-100 border-2 border-yellow-400 rounded-lg p-3 shadow-lg"
              style={{
                left: ft.x,
                top: ft.y,
                transform: 'rotate(-2deg)',
                maxWidth: '200px',
                zIndex: 10
              }}
            >
              <button
                onClick={() => deleteFloatingText(ft.id)}
                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
              >
                <X size={12} />
              </button>
              <textarea
                value={ft.content}
                onChange={(e) => updateFloatingText(ft.id, e.target.value)}
                className="w-full bg-transparent border-none focus:outline-none text-sm resize-none"
                placeholder="Messy thought..."
                rows="3"
              />
            </div>
          ))}

          {isPdf ? (
            <PDFDocument file={note.fileUrl} className="mx-auto">
              <Page pageNumber={1} width={isA4 ? 595 : 800} />
            </PDFDocument>
          ) : (
            <>
              {editor && (
                <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
                  <div className="bg-gray-900 text-white rounded-lg px-3 py-2 flex items-center gap-1.5 shadow-xl border border-gray-700">
                    {/* Text Formatting */}
                    <button
                      onClick={() => editor.chain().focus().toggleBold().run()}
                      className={`p-1.5 rounded hover:bg-gray-700 transition-colors ${editor.isActive('bold') ? 'bg-gray-700' : ''}`}
                      title="Bold"
                    >
                      <Bold size={14} />
                    </button>
                    <button
                      onClick={() => editor.chain().focus().toggleItalic().run()}
                      className={`p-1.5 rounded hover:bg-gray-700 transition-colors ${editor.isActive('italic') ? 'bg-gray-700' : ''}`}
                      title="Italic"
                    >
                      <Italic size={14} />
                    </button>
                    <button
                      onClick={() => editor.chain().focus().toggleHighlight().run()}
                      className={`p-1.5 rounded hover:bg-gray-700 transition-colors ${editor.isActive('highlight') ? 'bg-gray-700' : ''}`}
                      title="Highlight"
                    >
                      <Highlighter size={14} />
                    </button>

                    <div className="w-px h-5 bg-gray-600 mx-1" />

                    {/* Font Size */}
                    <select
                      onChange={(e) => setFontSize(parseInt(e.target.value))}
                      value={fontSize}
                      className="bg-gray-800 text-white text-xs rounded px-2 py-1 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                      className="w-6 h-6 rounded cursor-pointer border border-gray-600"
                      title="Text Color"
                    />

                    <div className="w-px h-5 bg-gray-600 mx-1" />

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
            </>
          )}
        </div>
      </div>

      {/* Linker Suggestions Panel */}
      {showLinker && (
        <div className="absolute top-20 right-8 w-80 bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-50">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles size={16} className="text-blue-600" />
              Related Notes
            </h4>
            <button
              onClick={() => setShowLinker(false)}
              className="text-gray-400 hover:text-gray-600"
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
                  className="p-3 bg-blue-50 hover:bg-blue-100 rounded-md cursor-pointer transition-colors border border-blue-100"
                >
                  <div className="font-medium text-gray-900 text-sm mb-1">
                    {s.title}
                  </div>
                  <div className="text-xs text-blue-600">
                    {s.reason}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-gray-600 text-sm">No similar notes found</p>
              <p className="text-xs text-gray-400 mt-1">Try selecting different text</p>
            </div>
          )}
        </div>
      )}

      {/* Floating Text Input */}
      {showFloatingInput && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-5 z-50 border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-2 text-sm">Add Floating Text</h3>
          <p className="text-sm text-gray-600 mb-4">
            Add non-linear thoughts anywhere on your page
          </p>
          <div className="flex gap-2">
            <button
              onClick={addFloatingText}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Add
            </button>
            <button
              onClick={() => setShowFloatingInput(false)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}