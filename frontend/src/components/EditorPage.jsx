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
import { Sparkles, MessageSquare, ArrowLeft, Mic, Layout } from 'lucide-react';
import { Document as PDFDocument, Page } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import PdfHighlighter from 'react-pdf-highlighter';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

const API = import.meta.env.VITE_API_URL;

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
  const { transcript, resetTranscript } = useSpeechRecognition();

  useEffect(() => {
    axios.get(`${API}/api/notes/${id}`, { withCredentials: true }).then(res => {
      setNote(res.data);
      setAnnotations(res.data.annotations);
      if (res.data.content) editor?.commands.setContent(res.data.content);
    }).catch(() => navigate('/mindmap'));
  }, [id]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: 'Start messy thinking...' }),
      Color,
      FontFamily,
      TextStyle,
      Typography
    ],
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      const text = editor.getText();
      const title = text.split('\n')[0] || 'Untitled Thought';
      axios.put(`${API}/api/notes/${id}`, { content: json, plainText: text, title, messyMode: true }, { withCredentials: true });
    },
  });

  useEffect(() => {
    if (transcript && isVoice) {
      editor?.commands.insertContent(transcript);
      resetTranscript();
    }
  }, [transcript, isVoice]);

  const toggleVoice = () => {
    setIsVoice(!isVoice);
    if (!isVoice) SpeechRecognition.startListening({ continuous: true, language: 'en-US' });
    else SpeechRecognition.stopListening();
  };

  const runLinker = async () => {
    const selection = editor.state.selection;
    const text = editor.state.doc.textBetween(selection.from, selection.to, ' ');
    if (!text) return;
    const res = await axios.post(`${API}/api/linker`, { text, noteId: id }, { withCredentials: true });
    setLinkerSuggestions(res.data.suggestions);
    setShowLinker(true);
  };

  const addAnnotation = async () => {
    const selection = editor.state.selection;
    const text = editor.state.doc.textBetween(selection.from, selection.to, ' ');
    if (!text) return;
    const newAnn = { text, comment: '' };
    setAnnotations([...annotations, newAnn]);
    await axios.post(`${API}/api/notes/${id}/annotations`, newAnn, { withCredentials: true });
  };

  const updateAnnotation = async (index, comment) => {
    const ann = annotations[index];
    ann.comment = comment;
    setAnnotations([...annotations]);
    await axios.put(`${API}/api/annotations/${ann.id}`, { comment }, { withCredentials: true });
  };

  if (!note) return <div>Loading...</div>;

  const isPdf = note.type === 'pdf';
  const themeClass = theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-[#F5F5F5] text-black';
  const sidebarClass = theme === 'dark' ? 'bg-gray-800' : 'bg-white';

  return (
    <div className={`flex h-screen ${themeClass} overflow-hidden`}>
      <div className={`w-80 border-r p-4 overflow-y-auto ${sidebarClass}`}>
        <button onClick={() => navigate('/mindmap')} className="mb-4 flex items-center text-gray-500 hover:text-current">
          <ArrowLeft size={16} className="mr-2" /> Back to Mindmap
        </button>
        <h3 className="font-bold text-gray-400 uppercase text-xs mb-4">Annotations</h3>
        {annotations.map((ann, i) => (
          <div key={i} className="mb-4 p-3 bg-yellow-50 border rounded-lg">
            <div className="text-xs text-yellow-700 mb-2">"{ann.text}"</div>
            <textarea className="w-full text-sm bg-transparent focus:outline-none" placeholder="Comment..." value={ann.comment} onChange={(e) => updateAnnotation(i, e.target.value)} />
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto flex justify-center pt-10 pb-20">
        <div className={isA4 ? 'w-[800px]' : 'w-full max-w-4xl'} style={{ minHeight: '1100px' }} className={`${theme === 'dark' ? 'bg-gray-700' : 'bg-white'} shadow-xl p-16 relative`}>
          <div className="absolute top-4 right-4 flex gap-2">
            <button onClick={() => setIsA4(!isA4)} title="Toggle A4/Full Width"><Layout size={16} /></button>
            <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Toggle Theme">🌙/☀️</button>
            <button onClick={toggleVoice} title="Voice Input"><Mic size={16} color={isVoice ? 'red' : 'gray'} /></button>
          </div>
          {isPdf ? (
            <PdfHighlighter
              pdfDocument={PDFDocument}
              pdfUrl={note.fileUrl}
              onScrollChange={() => {}}
              scrollRef={() => {}}
              highlights={[]}
            >
              {({ getNow, resetHighlights }) => (
                <PDFDocument file={note.fileUrl}>
                  <Page pageNumber={1} /> {/* Extend for multi-page */}
                </PDFDocument>
              )}
            </PdfHighlighter>
          ) : (
            <>
              {editor && (
                <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
                  <div className="bg-black text-white rounded-full px-4 py-2 flex items-center gap-3 shadow-lg scale-90">
                    <button onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
                    <button onClick={() => editor.chain().focus().toggleItalic().run()}>I</button>
                    <button onClick={() => editor.chain().focus().toggleHighlight().run()}>H</button>
                    <select onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()}>
                      <option value="Arial">Arial</option>
                      <option value="serif">Serif</option>
                    </select>
                    <input type="color" onInput={(e) => editor.chain().focus().setColor(e.target.value).run()} value="#000000" />
                    <button onClick={runLinker} className="flex items-center gap-1 text-purple-300 hover:text-purple-100">
                      <Sparkles size={14} /> Linker
                    </button>
                    <button onClick={addAnnotation} className="flex items-center gap-1 text-yellow-300 hover:text-yellow-100">
                      <MessageSquare size={14} /> Comment
                    </button>
                  </div>
                </BubbleMenu>
              )}
              <EditorContent editor={editor} className="prose prose-lg max-w-none focus:outline-none" />
              <div className="absolute top-10 right-10 text-gray-400 text-sm rotate-6">
                Additional messy text...
              </div>
            </>
          )}
        </div>
      </div>
      {showLinker && (
        <div className="absolute top-20 right-[-250px] w-60 bg-white border border-purple-200 shadow-xl rounded-lg p-4 z-50">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-bold text-purple-700">Suggestions</h4>
            <button onClick={() => setShowLinker(false)} className="text-xs text-gray-400">✕</button>
          </div>
          {linkerSuggestions.map(s => (
            <div key={s.id} className="text-sm p-2 hover:bg-purple-50 rounded cursor-pointer border-b border-gray-100" onClick={async () => {
              await axios.post(`${API}/api/links`, { sourceId: id, targetId: s.id }, { withCredentials: true });
              setShowLinker(false);
            }}>
              🔗 {s.title}
            </div>
          ))}
          {linkerSuggestions.length === 0 && <div className="text-xs text-gray-400">No connections found.</div>}
        </div>
      )}
    </div>
  );
}