import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { Color } from '@tiptap/extension-color';
import { FontFamily } from '@tiptap/extension-font-family';
import { TextStyle } from '@tiptap/extension-text-style';
import { Typography } from '@tiptap/extension-typography';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Sparkles, MessageSquare, Layout, 
  Moon, Sun, Bold, Italic, Underline,
  Highlighter, Link as LinkIcon, Trash2, X, Save, Loader,
  List, ListOrdered, Code, Quote, Undo, Redo, Type,
  AlignLeft, AlignCenter, AlignRight, Cloud, HardDrive, Check
} from 'lucide-react';
import { useNotes } from '../contexts/NotesContext';
import FileService from '../services/FileService';

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

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getNote, updateNoteLocal, updateNote } = useNotes();
  
  const [note, setNote] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [isA4, setIsA4] = useState(true);
  const [theme, setTheme] = useState(() => {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  });
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Inter');
  const [selectedText, setSelectedText] = useState('');
  
  const isSavingRef = useRef(false);
  const currentNoteIdRef = useRef(null);
  const editorUpdateRef = useRef(false);
  const pendingChangesRef = useRef(false);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

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
      if (editorUpdateRef.current || !note?.id) return;
      
      const json = editor.getJSON();
      const text = editor.getText();
      const title = text.split('\n')[0].slice(0, 50) || 'Untitled Thought';
      
      updateNoteLocal(note.id, {
        title,
        content: json,
        rawText: text
      });
      
      setNote(prev => ({
        ...prev,
        title,
        content: json,
        rawText: text
      }));
      
      pendingChangesRef.current = true;
      
      // Auto-save after 2 seconds of no typing
      debouncedSave();
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, ' ');
      setSelectedText(text);
    }
  }, []);

  const saveToCloud = useCallback(async () => {
    if (!note?.id || isSavingRef.current) return;

    isSavingRef.current = true;
    setSaving(true);
    setSaveError(null);

    try {
      const currentContent = editor?.getJSON();
      const currentText = editor?.getText();
      const title = currentText?.split('\n')[0].slice(0, 50) || 'Untitled Thought';

      await updateNote(note.id, {
        content: currentContent,
        plainText: currentText,
        title
      });

      setLastSaved(new Date());
      pendingChangesRef.current = false;
      setSaveError(null);
    } catch (error) {
      console.error('Cloud save failed:', error);
      setSaveError('Failed to save');
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  }, [note?.id, editor, updateNote]);

  const debouncedSave = useDebounce(saveToCloud, 2000);

  // Load note when ID changes
  useEffect(() => {
    if (!id || currentNoteIdRef.current === id) {
      return;
    }

    // Save previous note before switching
    const savePreviousNote = async () => {
      if (currentNoteIdRef.current && pendingChangesRef.current && editor) {
        console.log('Saving previous note before switch:', currentNoteIdRef.current);
        await saveToCloud();
      }
    };

    savePreviousNote().then(() => {
      currentNoteIdRef.current = id;
      loadNote();
    });
  }, [id, editor, saveToCloud]);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (pendingChangesRef.current && editor && note?.id) {
        console.log('Saving note on unmount:', note.id);
        // Synchronous save on unmount
        const currentContent = editor.getJSON();
        const currentText = editor.getText();
        const title = currentText?.split('\n')[0].slice(0, 50) || 'Untitled Thought';
        
        updateNote(note.id, {
          content: currentContent,
          plainText: currentText,
          title
        }).catch(console.error);
      }
    };
  }, [editor, note?.id, updateNote]);

  const loadNote = async () => {
    if (id.startsWith('temp-')) {
      console.warn('Attempted to load temporary note, redirecting...');
      navigate('/', { replace: true });
      return;
    }

    setSaveError(null);

    try {
      const res = await FileService.getNote(id);

      if (currentNoteIdRef.current !== id) {
        return;
      }

      setNote(res);
      setLastSaved(new Date());
      pendingChangesRef.current = false;
      
      if (editor && !editor.isDestroyed) {
        editorUpdateRef.current = true;
        editor.commands.setContent(res.content || '');
        setTimeout(() => {
          editorUpdateRef.current = false;
        }, 0);
      }
    } catch (error) {
      if (currentNoteIdRef.current !== id) {
        return;
      }

      console.error('Failed to load note:', error);
      setSaveError('Failed to load note');
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 1000);
    }
  };

  if (saveError === 'Failed to load note') {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg-primary">
        <div className="text-center">
          <X className="text-red-500 mx-auto mb-4" size={48} />
          <p className="text-theme-primary text-lg mb-2">Note not found</p>
          <p className="text-theme-secondary mb-4">This note may have been deleted</p>
          <p className="text-sm text-theme-tertiary">Redirecting...</p>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg-primary">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-theme-secondary">Loading note...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen theme-bg-primary theme-text-primary overflow-hidden flex-col">
      <div className="toolbar-themed p-3 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 mr-4">
          {saving && (
            <div className="flex items-center gap-2 text-blue-400">
              <Loader size={14} className="animate-spin" />
              <span className="text-xs">Saving...</span>
            </div>
          )}
          {!saving && lastSaved && !pendingChangesRef.current && (
            <div className="flex items-center gap-2 text-green-400" title="All changes saved">
              <Check size={14} />
              <span className="text-xs">Saved</span>
            </div>
          )}
          {!saving && pendingChangesRef.current && (
            <div className="flex items-center gap-2 text-yellow-400">
              <Cloud size={14} />
              <span className="text-xs">Saving...</span>
            </div>
          )}
          {saveError && (
            <div className="flex items-center gap-2 text-red-400">
              <X size={14} />
              <span className="text-xs">{saveError}</span>
            </div>
          )}
        </div>

        <div className="h-6 w-px border-theme-primary" />

        <button
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={!editor?.can().undo()}
          className="p-2 theme-bg-hover rounded transition-colors disabled:opacity-30 text-theme-secondary"
          title="Undo"
        >
          <Undo size={16} />
        </button>
        <button
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={!editor?.can().redo()}
          className="p-2 theme-bg-hover rounded transition-colors disabled:opacity-30 text-theme-secondary"
          title="Redo"
        >
          <Redo size={16} />
        </button>

        <div className="h-6 w-px border-theme-primary" />

        <select
          value={fontFamily}
          onChange={(e) => {
            setFontFamily(e.target.value);
            editor?.chain().focus().setFontFamily(e.target.value).run();
          }}
          className="input-themed text-sm rounded px-2 py-1"
        >
          <option value="Inter">Inter</option>
          <option value="Georgia">Georgia</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Arial">Arial</option>
          <option value="Courier New">Courier New</option>
          <option value="Verdana">Verdana</option>
          <option value="Comic Sans MS">Comic Sans</option>
        </select>

        <select
          onChange={(e) => setFontSize(parseInt(e.target.value))}
          value={fontSize}
          className="input-themed text-sm rounded px-2 py-1"
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

        <div className="h-6 w-px border-theme-primary" />

        <button
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={`p-2 theme-bg-hover rounded transition-colors text-theme-secondary ${editor?.isActive('bold') ? 'bg-theme-tertiary' : ''}`}
          title="Bold"
        >
          <Bold size={16} />
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={`p-2 theme-bg-hover rounded transition-colors text-theme-secondary ${editor?.isActive('italic') ? 'bg-theme-tertiary' : ''}`}
          title="Italic"
        >
          <Italic size={16} />
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleHighlight().run()}
          className={`p-2 theme-bg-hover rounded transition-colors text-theme-secondary ${editor?.isActive('highlight') ? 'bg-theme-tertiary' : ''}`}
          title="Highlight"
        >
          <Highlighter size={16} />
        </button>

        <input
          type="color"
          onInput={(e) => editor?.chain().focus().setColor(e.target.value).run()}
          className="w-8 h-8 rounded cursor-pointer border border-theme-primary"
          title="Text Color"
        />

        <div className="h-6 w-px border-theme-primary" />

        <button
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className={`p-2 theme-bg-hover rounded transition-colors text-theme-secondary ${editor?.isActive('bulletList') ? 'bg-theme-tertiary' : ''}`}
          title="Bullet List"
        >
          <List size={16} />
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          className={`p-2 theme-bg-hover rounded transition-colors text-theme-secondary ${editor?.isActive('orderedList') ? 'bg-theme-tertiary' : ''}`}
          title="Numbered List"
        >
          <ListOrdered size={16} />
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          className={`p-2 theme-bg-hover rounded transition-colors text-theme-secondary ${editor?.isActive('codeBlock') ? 'bg-theme-tertiary' : ''}`}
          title="Code Block"
        >
          <Code size={16} />
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          className={`p-2 theme-bg-hover rounded transition-colors text-theme-secondary ${editor?.isActive('blockquote') ? 'bg-theme-tertiary' : ''}`}
          title="Quote"
        >
          <Quote size={16} />
        </button>

        <div className="flex-1" />

        <button
          onClick={() => setIsA4(!isA4)}
          className="p-2 theme-bg-hover rounded transition-colors text-theme-secondary"
          title="Toggle Width"
        >
          <Layout size={16} />
        </button>
        <button
          onClick={toggleTheme}
          className="p-2 theme-bg-hover rounded transition-colors text-theme-secondary"
          title="Toggle Theme"
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto flex justify-center pt-8 pb-20 relative">
          <div
            className={`relative ${isA4 ? 'w-[21cm]' : 'w-full max-w-4xl'} bg-theme-card theme-text-primary theme-shadow-sm p-16 rounded-lg`}
            style={{ minHeight: isA4 ? '29.7cm' : '800px' }}
          >
            <EditorContent
              editor={editor}
              style={{ fontSize: `${fontSize}px`, fontFamily }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}