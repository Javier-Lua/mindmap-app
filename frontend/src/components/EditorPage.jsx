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
  const [annotations, setAnnotations] = useState([]);
  const [linkerSuggestions, setLinkerSuggestions] = useState([]);
  const [showLinker, setShowLinker] = useState(false);
  const [isA4, setIsA4] = useState(true);
  const [theme, setTheme] = useState('light');
  const [isVoice, setIsVoice] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Inter');
  const [selectedText, setSelectedText] = useState('');
  const [floatingTexts, setFloatingTexts] = useState([]);
  const [showFloatingInput, setShowFloatingInput] = useState(false);
  const [connections, setConnections] = useState({ incoming: [], outgoing: [] });

  useEffect(() => {
    axios.get(`${API}/api/notes/${id}`, { withCredentials: true })
      .then(res => {
        setNote(res.data);
        setAnnotations(res.data.annotations || []);
        setConnections({
          incoming: res.data.incoming || [],
          outgoing: res.data.outgoing || []
        });
        if (res.data.content) {
          editor?.commands.setContent(res.data.content);
        }
      })
      .catch(() => navigate('/mindmap'));
  }, [id]);

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
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      const text = editor.getText();
      const title = text.split('\n')[0] || 'Untitled Thought';
      axios.put(`${API}/api/notes/${id}`, { 
        content: json, 
        plainText: text, 
        title, 
        messyMode: true 
      }, { withCredentials: true });
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, ' ');
      setSelectedText(text);
    }
  });

  useEffect(() => {
    if (editor) {
      editor.chain().focus().setFontSize(`${fontSize}px`).run();
    }
  }, [fontSize, editor]);

  const runLinker = async () => {
    if (!selectedText.trim()) return;
    const res = await axios.post(`${API}/api/linker`, { 
      text: selectedText, 
      noteId: id 
    }, { withCredentials: true });
    setLinkerSuggestions(res.data.suggestions);
    setShowLinker(true);
  };

  const addAnnotation = async () => {
    if (!selectedText.trim()) return;
    const newAnn = { text: selectedText, comment: '' };
    const res = await axios.post(`${API}/api/notes/${id}/annotations`, newAnn, { withCredentials: true });
    setAnnotations([...annotations, res.data]);
  };

  const updateAnnotation = async (ann, comment) => {
    await axios.put(`${API}/api/annotations/${ann.id}`, { comment }, { withCredentials: true });
    setAnnotations(annotations.map(a => a.id === ann.id ? { ...a, comment } : a));
  };

  const deleteAnnotation = async (annId) => {
    await axios.delete(`${API}/api/annotations/${annId}`, { withCredentials: true });
    setAnnotations(annotations.filter(a => a.id !== annId));
  };

  const createLink = async (targetId) => {
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

  if (!note) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-pulse text-xl text-gray-600">Loading note...</div>
    </div>
  );

  const isPdf = note.type === 'pdf';
  const themeClass = theme === 'dark' 
    ? 'bg-gray-900 text-white' 
    : 'bg-gradient-to-br from-gray-50 to-gray-100 text-gray-900';
  const sidebarClass = theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const paperClass = theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-900';

  return (
    <div className={`flex h-screen ${themeClass} overflow-hidden`}>
      {/* Left Sidebar - Annotations & Connections */}
      <div className={`w-80 border-r p-6 overflow-y-auto ${sidebarClass}`}>
        <button 
          onClick={() => navigate('/mindmap')} 
          className="mb-6 flex items-center text-gray-500 hover:text-current transition-colors"
        >
          <ArrowLeft size={18} className="mr-2" /> Back to Mindmap
        </button>

        {/* Connections */}
        <div className="mb-6">
          <h3 className="font-bold text-gray-400 uppercase text-xs mb-3 flex items-center gap-2">
            <LinkIcon size={14} /> Connections
          </h3>
          
          {connections.outgoing.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-2">Links to:</p>
              {connections.outgoing.map(link => (
                <div
                  key={link.id}
                  onClick={() => navigate(`/note/${link.target.id}`)}
                  className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors text-sm"
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
                  className="mb-2 p-2 bg-purple-50 border border-purple-200 rounded-lg cursor-pointer hover:bg-purple-100 transition-colors text-sm"
                >
                  ← {link.source.title}
                </div>
              ))}
            </div>
          )}

          {connections.incoming.length === 0 && connections.outgoing.length === 0 && (
            <p className="text-sm text-gray-400 italic">No connections yet. Highlight text and use the Linker!</p>
          )}
        </div>

        {/* Annotations */}
        <div>
          <h3 className="font-bold text-gray-400 uppercase text-xs mb-3 flex items-center gap-2">
            <MessageSquare size={14} /> Annotations
          </h3>
          
          {annotations.map((ann) => (
            <div key={ann.id} className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg group">
              <div className="flex items-start justify-between mb-2">
                <div className="text-xs text-yellow-800 font-medium italic line-clamp-2 flex-1">
                  "{ann.text}"
                </div>
                <button
                  onClick={() => deleteAnnotation(ann.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                >
                  <Trash2 size={12} className="text-red-500" />
                </button>
              </div>
              <textarea
                className="w-full text-sm bg-transparent focus:outline-none resize-none"
                placeholder="Add your comment..."
                value={ann.comment || ''}
                onChange={(e) => updateAnnotation(ann, e.target.value)}
                rows="2"
              />
            </div>
          ))}

          {annotations.length === 0 && (
            <p className="text-sm text-gray-400 italic">
              Highlight text and click "Comment" to add annotations
            </p>
          )}
        </div>
      </div>

      {/* Main Editor */}
      <div className="flex-1 overflow-y-auto flex justify-center pt-10 pb-20 relative">
        {/* Floating Toolbar */}
        <div className="absolute top-4 right-4 flex gap-2 z-10">
          <button
            onClick={() => setIsA4(!isA4)}
            className="p-3 bg-white rounded-xl shadow-md hover:shadow-lg transition-all border border-gray-200"
            title="Toggle A4/Full Width"
          >
            <Layout size={18} />
          </button>
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="p-3 bg-white rounded-xl shadow-md hover:shadow-lg transition-all border border-gray-200"
            title="Toggle Theme"
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button
            onClick={() => setShowFloatingInput(!showFloatingInput)}
            className="p-3 bg-purple-600 text-white rounded-xl shadow-md hover:shadow-lg transition-all"
            title="Add Floating Text"
          >
            <Plus size={18} />
          </button>
        </div>

        <div
          className={`relative ${isA4 ? 'w-[21cm]' : 'w-full max-w-4xl'} ${paperClass} shadow-2xl p-16`}
          style={{ minHeight: isA4 ? '29.7cm' : '1100px' }}
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
                maxWidth: '200px'
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
                  <div className="bg-gray-900 text-white rounded-2xl px-4 py-3 flex items-center gap-2 shadow-xl">
                    {/* Text Formatting */}
                    <button
                      onClick={() => editor.chain().focus().toggleBold().run()}
                      className={`p-2 rounded-lg hover:bg-gray-700 ${editor.isActive('bold') ? 'bg-gray-700' : ''}`}
                      title="Bold"
                    >
                      <Bold size={16} />
                    </button>
                    <button
                      onClick={() => editor.chain().focus().toggleItalic().run()}
                      className={`p-2 rounded-lg hover:bg-gray-700 ${editor.isActive('italic') ? 'bg-gray-700' : ''}`}
                      title="Italic"
                    >
                      <Italic size={16} />
                    </button>
                    <button
                      onClick={() => editor.chain().focus().toggleHighlight().run()}
                      className={`p-2 rounded-lg hover:bg-gray-700 ${editor.isActive('highlight') ? 'bg-gray-700' : ''}`}
                      title="Highlight"
                    >
                      <Highlighter size={16} />
                    </button>

                    <div className="w-px h-6 bg-gray-600" />

                    {/* Font Family */}
                    <select
                      onChange={(e) => {
                        setFontFamily(e.target.value);
                        editor.chain().focus().setFontFamily(e.target.value).run();
                      }}
                      value={fontFamily}
                      className="bg-gray-800 text-white text-sm rounded-lg px-2 py-1 border border-gray-600 focus:outline-none"
                    >
                      <option value="Inter">Inter</option>
                      <option value="serif">Serif</option>
                      <option value="monospace">Mono</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Arial">Arial</option>
                    </select>

                    {/* Font Size */}
                    <select
                      onChange={(e) => setFontSize(parseInt(e.target.value))}
                      value={fontSize}
                      className="bg-gray-800 text-white text-sm rounded-lg px-2 py-1 border border-gray-600 focus:outline-none w-16"
                    >
                      <option value="12">12px</option>
                      <option value="14">14px</option>
                      <option value="16">16px</option>
                      <option value="18">18px</option>
                      <option value="20">20px</option>
                      <option value="24">24px</option>
                    </select>

                    {/* Text Color */}
                    <input
                      type="color"
                      onInput={(e) => editor.chain().focus().setColor(e.target.value).run()}
                      className="w-8 h-8 rounded cursor-pointer"
                      title="Text Color"
                    />

                    <div className="w-px h-6 bg-gray-600" />

                    {/* Linker */}
                    <button
                      onClick={runLinker}
                      className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                      title="Find related notes"
                    >
                      <Sparkles size={14} />
                      <span className="text-sm font-medium">Link</span>
                    </button>

                    {/* Annotate */}
                    <button
                      onClick={addAnnotation}
                      className="flex items-center gap-1.5 px-3 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg transition-colors"
                      title="Add annotation"
                    >
                      <MessageSquare size={14} />
                      <span className="text-sm font-medium">Note</span>
                    </button>
                  </div>
                </BubbleMenu>
              )}

              <EditorContent
                editor={editor}
                className="prose prose-lg max-w-none focus:outline-none"
                style={{ fontSize: `${fontSize}px`, fontFamily }}
              />
            </>
          )}
        </div>
      </div>

      {/* Linker Suggestions Panel */}
      {showLinker && (
        <div className="absolute top-20 right-8 w-80 bg-white rounded-2xl shadow-2xl border-2 border-purple-200 p-5 z-50">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-bold text-purple-700 flex items-center gap-2">
              <Sparkles size={18} />
              Related Notes
            </h4>
            <button
              onClick={() => setShowLinker(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
          </div>

          {linkerSuggestions.length > 0 ? (
            <div className="space-y-2">
              {linkerSuggestions.map(s => (
                <div
                  key={s.id}
                  onClick={() => createLink(s.id)}
                  className="p-3 bg-purple-50 hover:bg-purple-100 rounded-xl cursor-pointer transition-colors border border-purple-100"
                >
                  <div className="font-medium text-gray-800 text-sm mb-1">
                    {s.title}
                  </div>
                  <div className="text-xs text-purple-600">
                    {s.reason}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">No similar notes found</p>
              <p className="text-xs text-gray-400 mt-2">Try selecting different text</p>
            </div>
          )}
        </div>
      )}

      {/* Floating Text Input */}
      {showFloatingInput && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl p-6 z-50 border-2 border-purple-200">
          <h3 className="font-bold text-gray-800 mb-3">Add Floating Text</h3>
          <p className="text-sm text-gray-600 mb-4">
            Add non-linear thoughts anywhere on your page!
          </p>
          <div className="flex gap-3">
            <button
              onClick={addFloatingText}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => setShowFloatingInput(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}