import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
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
  Sparkles, MessageSquare, Layout, 
  Moon, Sun, Bold, Italic, Underline,
  Highlighter, Link as LinkIcon, Trash2, X, Save, Loader,
  List, ListOrdered, Code, Quote, Undo, Redo, Type,
  AlignLeft, AlignCenter, AlignRight, Cloud, HardDrive
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function useDebounce(callback, delay) {
  const timeoutRef = useRef(null);
  return useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);
}

export default function EditorPage({ onNoteUpdate, onLiveUpdate }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [lastLocalSave, setLastLocalSave] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [linkerSuggestions, setLinkerSuggestions] = useState([]);
  const [showLinker, setShowLinker] = useState(false);
  const [isA4, setIsA4] = useState(true);
  const [theme, setTheme] = useState(() => {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  });
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Inter');
  const [selectedText, setSelectedText] = useState('');
  const [connections, setConnections] = useState({ incoming: [], outgoing: [] });
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Critical refs for preventing race conditions
  const isSavingRef = useRef(false);
  const currentNoteIdRef = useRef(null);
  const activeLoadRef = useRef(null); // Track active load promise
  const editorUpdateRef = useRef(false); // Flag to prevent update loops
  const cloudSaveIntervalRef = useRef(null);
  const lastChangeTimeRef = useRef(Date.now());

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // Initialize editor ONCE
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
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-none focus:outline-none min-h-[400px]',
      },
    },
    onUpdate: ({ editor }) => {
      if (editorUpdateRef.current) return;
      if (!note?.id || loading) return;
      
      const json = editor.getJSON();
      const text = editor.getText();
      const title = text.split('\n')[0].slice(0, 50) || 'Untitled Thought';
      
      const updatedNote = {
        ...note,
        title,
        content: json,
        rawText: text
      };
      
      setNote(updatedNote);
      saveToLocalStorage(updatedNote);
      setHasUnsavedChanges(true);
      
      // NEW: Notify sidebar of title change
      if (onLiveUpdate) {
        onLiveUpdate(note.id, {
          title,
          rawText: text,
          updatedAt: new Date().toISOString()
        });
      }
      
      const timeSinceLastChange = Date.now() - lastChangeTimeRef.current;
      if (timeSinceLastChange > 5000) {
        const charDiff = Math.abs((text?.length || 0) - (note.rawText?.length || 0));
        if (charDiff > 100) {
          saveToCloud();
        }
      }
      lastChangeTimeRef.current = Date.now();
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, ' ');
      setSelectedText(text);
    }
  }, []);

  // Load note when ID changes - with proper cleanup
  useEffect(() => {
    // If ID hasn't changed, don't reload
    if (currentNoteIdRef.current === id && note?.id === id) {
      return;
    }

    // Cancel any pending load
    if (activeLoadRef.current) {
      activeLoadRef.current.cancelled = true;
    }

    currentNoteIdRef.current = id;
    const loadPromise = { cancelled: false };
    activeLoadRef.current = loadPromise;

    loadOrCreateNote(loadPromise);

    return () => {
      if (activeLoadRef.current === loadPromise) {
        loadPromise.cancelled = true;
      }
    };
  }, [id]);

  // Auto-save to cloud every 1 minute
  useEffect(() => {
    cloudSaveIntervalRef.current = setInterval(() => {
      if (hasUnsavedChanges && !loading && note?.id) {
        saveToCloud();
      }
    }, 60000);

    return () => {
      if (cloudSaveIntervalRef.current) {
        clearInterval(cloudSaveIntervalRef.current);
      }
    };
  }, [hasUnsavedChanges, loading, note?.id]);

  // Manual save with Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (note?.id) {
          saveToCloud();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [note?.id]);

  const saveToLocalStorage = (noteData) => {
    if (!noteData?.id) return;
    
    const dataToSave = {
      ...noteData,
      lastLocalSave: new Date().toISOString()
    };
    
    try {
      localStorage.setItem(`note_${noteData.id}`, JSON.stringify(dataToSave));
      setLastLocalSave(new Date());
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  };

  const loadOrCreateNote = async (loadPromise) => {
    setLoading(true);
    setSaveError(null);

    try {
      if (!id || id === 'new') {
        await createNewNote(loadPromise);
        return;
      }

      // Load from server
      const res = await axios.get(`${API}/api/notes/${id}`, { 
        withCredentials: true,
        timeout: 10000
      });

      // Check if this load was cancelled
      if (loadPromise.cancelled || currentNoteIdRef.current !== id) {
        console.log('Load cancelled for note', id);
        return;
      }

      // Update state
      setNote(res.data);
      setAnnotations(res.data.annotations || []);
      setConnections({
        incoming: res.data.incoming || [],
        outgoing: res.data.outgoing || []
      });
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      
      // Update editor content - set flag to prevent triggering onUpdate
      if (editor && !editor.isDestroyed) {
        editorUpdateRef.current = true;
        editor.commands.setContent(res.data.content || '');
        // Reset flag after a tick
        setTimeout(() => {
          editorUpdateRef.current = false;
        }, 0);
      }
      
      // Save to localStorage
      saveToLocalStorage(res.data);
    } catch (error) {
      // Check if cancelled
      if (loadPromise.cancelled || currentNoteIdRef.current !== id) {
        return;
      }

      console.error('Failed to load note:', error);
      
      // Only create new note if we're still on 'new' or the same ID
      if (id === 'new' || currentNoteIdRef.current === id) {
        await createNewNote(loadPromise);
      }
    } finally {
      if (!loadPromise.cancelled && currentNoteIdRef.current === id) {
        setLoading(false);
      }
    }
  };

  const createNewNote = async (loadPromise) => {
    if (isCreatingNote) return;
    
    setIsCreatingNote(true);
    try {
      const res = await axios.post(`${API}/api/notes`, {
        ephemeral: true
      }, { 
        withCredentials: true,
        timeout: 10000
      });
      
      // Check if cancelled
      if (loadPromise?.cancelled) {
        return;
      }
      
      const newNote = res.data;
      setNote(newNote);
      setAnnotations([]);
      setConnections({ incoming: [], outgoing: [] });
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      saveToLocalStorage(newNote);
      
      // Update editor
      if (editor && !editor.isDestroyed) {
        editorUpdateRef.current = true;
        editor.commands.setContent('');
        setTimeout(() => {
          editorUpdateRef.current = false;
        }, 0);
      }
      
      // Update URL without triggering reload
      navigate(`/note/${newNote.id}`, { replace: true });
      currentNoteIdRef.current = newNote.id;
      
      if (onNoteUpdate) {
        onNoteUpdate();
      }
    } catch (error) {
      console.error('Failed to create note:', error);
      setSaveError('Failed to create note');
    } finally {
      setLoading(false);
      setIsCreatingNote(false);
    }
  };

  const saveToCloud = async () => {
    if (!note?.id || isSavingRef.current || loading) return;

    isSavingRef.current = true;
    setSaving(true);
    setSaveError(null);

    try {
      const currentContent = editor?.getJSON();
      const currentText = editor?.getText();
      const title = currentText?.split('\n')[0].slice(0, 50) || 'Untitled Thought';

      const response = await axios.put(`${API}/api/notes/${note.id}`, {
        content: currentContent,
        plainText: currentText,
        title,
        messyMode: true
      }, { 
        withCredentials: true,
        timeout: 10000
      });

      if (response.status === 200) {
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
        setSaveError(null);
        
        if (onNoteUpdate) {
          onNoteUpdate();
        }
      }
    } catch (error) {
      console.error('Cloud save failed:', error);
      if (error.response?.status === 401) {
        setSaveError('Session expired - please refresh');
      } else {
        setSaveError('Failed to save to cloud');
      }
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  };

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
      const res = await axios.post(`${API}/api/notes/${note.id}/annotations`, newAnn, { 
        withCredentials: true 
      });
      setAnnotations([...annotations, res.data]);
    } catch (error) {
      console.error('Failed to add annotation:', error);
    }
  };

  const updateAnnotation = useDebounce(async (ann, comment) => {
    try {
      await axios.put(`${API}/api/annotations/${ann.id}`, { comment }, { 
        withCredentials: true 
      });
      setAnnotations(annotations.map(a => a.id === ann.id ? { ...a, comment } : a));
    } catch (error) {
      console.error('Failed to update annotation:', error);
    }
  }, 500);

  const deleteAnnotation = async (annId) => {
    try {
      setAnnotations(annotations.filter(a => a.id !== annId));
      await axios.delete(`${API}/api/annotations/${annId}`, { withCredentials: true });
    } catch (error) {
      console.error('Failed to delete annotation:', error);
      if (note?.id) {
        const res = await axios.get(`${API}/api/notes/${note.id}`, { withCredentials: true });
        setAnnotations(res.data.annotations || []);
      }
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
      <div className="min-h-screen flex items-center justify-center theme-bg-primary">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="theme-text-secondary">Loading note...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen theme-bg-primary theme-text-primary overflow-hidden flex-col">
      {/* Static Toolbar */}
      <div className="border-b p-3 theme-bg-secondary theme-border-primary flex items-center gap-2 flex-wrap">
        {/* Save Status */}
        <div className="flex items-center gap-2 mr-4">
          {saving && (
            <div className="flex items-center gap-2 text-blue-400">
              <Loader size={14} className="animate-spin" />
              <span className="text-xs">Saving...</span>
            </div>
          )}
          {!saving && lastLocalSave && (
            <div className="flex items-center gap-2 text-green-400" title="Saved locally">
              <HardDrive size={14} />
              <span className="text-xs">Local</span>
            </div>
          )}
          {!saving && lastSaved && !hasUnsavedChanges && (
            <div className="flex items-center gap-2 text-green-400" title="Synced to cloud">
              <Cloud size={14} />
              <span className="text-xs">{new Date(lastSaved).toLocaleTimeString()}</span>
            </div>
          )}
          {hasUnsavedChanges && !saving && (
            <button
              onClick={saveToCloud}
              className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
              title="Save to cloud (Ctrl+S)"
            >
              <Save size={12} />
              Save
            </button>
          )}
          {saveError && (
            <div className="flex items-center gap-2 text-red-400">
              <X size={14} />
              <span className="text-xs">{saveError}</span>
            </div>
          )}
        </div>

        <div className="h-6 w-px theme-border-primary" />

        {/* Undo/Redo */}
        <button
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={!editor?.can().undo()}
          className="p-2 theme-bg-hover rounded transition-colors disabled:opacity-30"
          title="Undo"
        >
          <Undo size={16} />
        </button>
        <button
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={!editor?.can().redo()}
          className="p-2 theme-bg-hover rounded transition-colors disabled:opacity-30"
          title="Redo"
        >
          <Redo size={16} />
        </button>

        <div className="h-6 w-px theme-border-primary" />

        {/* Font Selection */}
        <select
          value={fontFamily}
          onChange={(e) => {
            setFontFamily(e.target.value);
            editor?.chain().focus().setFontFamily(e.target.value).run();
          }}
          className="theme-bg-primary theme-text-primary text-sm rounded px-2 py-1 border theme-border-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="Inter">Inter</option>
          <option value="Georgia">Georgia</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Arial">Arial</option>
          <option value="Courier New">Courier New</option>
          <option value="Verdana">Verdana</option>
          <option value="Comic Sans MS">Comic Sans</option>
        </select>

        {/* Font Size */}
        <select
          onChange={(e) => setFontSize(parseInt(e.target.value))}
          value={fontSize}
          className="theme-bg-primary theme-text-primary text-sm rounded px-2 py-1 border theme-border-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="12">12</option>
          <option value="14">14</option>
          <option value="16">16</option>
          <option value="18">18</option>
          <option value="20">20</option>
          <option value="24">24</option>
          <option value="28">28</option>
          <option value="32">32</option>
        </select>

        <div className="h-6 w-px theme-border-primary" />

        {/* Formatting */}
        <button
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={`p-2 theme-bg-hover rounded transition-colors ${editor?.isActive('bold') ? 'theme-bg-tertiary' : ''}`}
          title="Bold"
        >
          <Bold size={16} />
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={`p-2 theme-bg-hover rounded transition-colors ${editor?.isActive('italic') ? 'theme-bg-tertiary' : ''}`}
          title="Italic"
        >
          <Italic size={16} />
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleHighlight().run()}
          className={`p-2 theme-bg-hover rounded transition-colors ${editor?.isActive('highlight') ? 'theme-bg-tertiary' : ''}`}
          title="Highlight"
        >
          <Highlighter size={16} />
        </button>

        {/* Text Color */}
        <input
          type="color"
          onInput={(e) => editor?.chain().focus().setColor(e.target.value).run()}
          className="w-8 h-8 rounded cursor-pointer border theme-border-primary"
          title="Text Color"
        />

        <div className="h-6 w-px theme-border-primary" />

        {/* Lists */}
        <button
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className={`p-2 theme-bg-hover rounded transition-colors ${editor?.isActive('bulletList') ? 'theme-bg-tertiary' : ''}`}
          title="Bullet List"
        >
          <List size={16} />
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          className={`p-2 theme-bg-hover rounded transition-colors ${editor?.isActive('orderedList') ? 'theme-bg-tertiary' : ''}`}
          title="Numbered List"
        >
          <ListOrdered size={16} />
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          className={`p-2 theme-bg-hover rounded transition-colors ${editor?.isActive('codeBlock') ? 'theme-bg-tertiary' : ''}`}
          title="Code Block"
        >
          <Code size={16} />
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          className={`p-2 theme-bg-hover rounded transition-colors ${editor?.isActive('blockquote') ? 'theme-bg-tertiary' : ''}`}
          title="Quote"
        >
          <Quote size={16} />
        </button>

        <div className="h-6 w-px theme-border-primary" />

        {/* AI Features */}
        <button
          onClick={runLinker}
          disabled={!selectedText.trim()}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          title="Find related notes"
        >
          <Sparkles size={14} />
          Link
        </button>

        <button
          onClick={addAnnotation}
          disabled={!selectedText.trim()}
          className="flex items-center gap-1 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          title="Add annotation"
        >
          <MessageSquare size={14} />
          Annotate
        </button>

        <div className="flex-1" />

        {/* View Options */}
        <button
          onClick={() => setIsA4(!isA4)}
          className="p-2 theme-bg-hover rounded transition-colors"
          title="Toggle Width"
        >
          <Layout size={16} />
        </button>
        <button
          onClick={toggleTheme}
          className="p-2 theme-bg-hover rounded transition-colors"
          title="Toggle Theme"
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Annotations & Connections */}
        <div className="w-80 border-r p-5 overflow-y-auto theme-bg-secondary theme-border-primary">
          {/* Connections */}
          <div className="mb-6">
            <h3 className="font-semibold theme-text-secondary text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
              <LinkIcon size={14} /> Connections
            </h3>
            
            {connections.outgoing.length > 0 && (
              <div className="mb-3">
                <p className="text-xs theme-text-tertiary mb-2">Links to:</p>
                {connections.outgoing.map(link => (
                  <div
                    key={link.id}
                    onClick={() => navigate(`/note/${link.target.id}`)}
                    className="mb-2 p-2.5 theme-bg-tertiary border theme-border-primary rounded-md cursor-pointer hover:border-blue-500 theme-bg-hover transition-colors text-sm"
                  >
                    → {link.target.title}
                  </div>
                ))}
              </div>
            )}

            {connections.incoming.length > 0 && (
              <div>
                <p className="text-xs theme-text-tertiary mb-2">Linked from:</p>
                {connections.incoming.map(link => (
                  <div
                    key={link.id}
                    onClick={() => navigate(`/note/${link.source.id}`)}
                    className="mb-2 p-2.5 theme-bg-tertiary border theme-border-primary rounded-md cursor-pointer hover:border-purple-500 theme-bg-hover transition-colors text-sm"
                  >
                    ← {link.source.title}
                  </div>
                ))}
              </div>
            )}

            {connections.incoming.length === 0 && connections.outgoing.length === 0 && (
              <p className="text-sm theme-text-tertiary italic">No connections yet</p>
            )}
          </div>

          {/* Annotations */}
          <div>
            <h3 className="font-semibold theme-text-secondary text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
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
                  className="w-full text-sm bg-transparent focus:outline-none resize-none theme-text-primary"
                  placeholder="Add your comment..."
                  defaultValue={ann.comment || ''}
                  onChange={(e) => updateAnnotation(ann, e.target.value)}
                  rows="2"
                />
              </div>
            ))}

            {annotations.length === 0 && (
              <p className="text-sm theme-text-tertiary italic">
                Select text and click Annotate
              </p>
            )}
          </div>
        </div>

        {/* Main Editor */}
        <div className="flex-1 overflow-y-auto flex justify-center pt-8 pb-20 relative">
          <div
            className={`relative ${isA4 ? 'w-[21cm]' : 'w-full max-w-4xl'} theme-bg-secondary theme-text-primary shadow-sm p-16 rounded-lg`}
            style={{ minHeight: isA4 ? '29.7cm' : '800px' }}
          >
            <EditorContent
              editor={editor}
              style={{ fontSize: `${fontSize}px`, fontFamily }}
            />
          </div>
        </div>
      </div>

      {/* Linker Suggestions Panel */}
      {showLinker && (
        <div className="absolute top-20 right-8 w-80 theme-bg-secondary rounded-lg shadow-xl border theme-border-primary p-4 z-50">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-base font-semibold theme-text-primary flex items-center gap-2">
              <Sparkles size={16} className="text-blue-500" />
              Related Notes
            </h4>
            <button
              onClick={() => setShowLinker(false)}
              className="theme-text-tertiary hover:theme-text-primary"
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
                  <div className="font-medium theme-text-primary text-sm mb-1">
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
              <p className="theme-text-secondary text-sm">No similar notes found</p>
              <p className="text-xs theme-text-tertiary mt-1">Try selecting different text</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}