import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { Color } from '@tiptap/extension-color';
import { FontFamily } from '@tiptap/extension-font-family';
import { TextStyle } from '@tiptap/extension-text-style';
import { Typography } from '@tiptap/extension-typography';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Moon, Sun, Bold, Italic, Underline as UnderlineIcon,
  Highlighter,
  List, ListOrdered, Code, Quote, Undo, Redo,
  Layout
} from 'lucide-react';
import { useNotes } from '../contexts/NotesContext';
import FileService from '../services/FileService';

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { updateNoteLocal } = useNotes();
  
  const [note, setNote] = useState(null);
  const [isA4, setIsA4] = useState(true);
  const [theme, setTheme] = useState(() => {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  });
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Arial');
  const [isLoading, setIsLoading] = useState(true);
  
  // Use refs to prevent race conditions
  const noteIdRef = useRef(null);
  const isSavingRef = useRef(false);
  const isLoadingRef = useRef(false);
  const editorUpdateRef = useRef(false);
  const saveTimeoutRef = useRef(null);
  const pendingUpdatesRef = useRef({});

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // Debounced save to file system
  const saveToFileSystem = useCallback(async (noteId, updates) => {
    if (isSavingRef.current) {
      // Queue the updates
      pendingUpdatesRef.current = {
        ...pendingUpdatesRef.current,
        ...updates
      };
      return;
    }

    isSavingRef.current = true;
    const allUpdates = { ...pendingUpdatesRef.current, ...updates };
    pendingUpdatesRef.current = {};

    try {
      await FileService.updateNote(noteId, allUpdates);
    } catch (error) {
      console.error('❌ Failed to save to file system:', error);
    } finally {
      isSavingRef.current = false;
      
      // If more updates came in while saving, save them now
      if (Object.keys(pendingUpdatesRef.current).length > 0) {
        const queued = { ...pendingUpdatesRef.current };
        pendingUpdatesRef.current = {};
        saveToFileSystem(noteId, queued);
      }
    }
  }, []);

  // Schedule a save (debounced)
  const scheduleSave = useCallback((noteId, updates) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    pendingUpdatesRef.current = {
      ...pendingUpdatesRef.current,
      ...updates
    };

    saveTimeoutRef.current = setTimeout(() => {
      const toSave = { ...pendingUpdatesRef.current };
      pendingUpdatesRef.current = {};
      saveToFileSystem(noteId, toSave);
    }, 300);
  }, [saveToFileSystem]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
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
      const currentId = noteIdRef.current;
      
      if (editorUpdateRef.current || !currentId) {
        return;
      }
      
      const json = editor.getJSON();
      const text = editor.getText();
      const title = text.split('\n')[0].slice(0, 50) || 'Untitled Thought';
      
      const updates = {
        title,
        content: json,
        rawText: text
      };

      // Update local state
      setNote(prev => {
        if (prev?.id !== currentId) return prev;
        return { ...prev, ...updates };
      });

      // Update context
      updateNoteLocal(currentId, updates);

      // Schedule save
      scheduleSave(currentId, updates);
    }
  }, [updateNoteLocal, scheduleSave]);

  // Update editor content when note changes (but avoid updates during typing)
  useEffect(() => {
    if (!editor || !note || editor.isDestroyed) {
      return;
    }

    // Don't update if user is typing
    if (document.activeElement?.closest('.ProseMirror')) {
      return;
    }

    // Only update if content actually changed
    const currentContent = editor.getJSON();
    if (JSON.stringify(currentContent) === JSON.stringify(note.content)) {
      return;
    }

    editorUpdateRef.current = true;
    
    try {
      if (note.content && typeof note.content === 'object') {
        editor.commands.setContent(note.content);
      } else if (note.rawText && note.rawText.trim()) {
        editor.commands.setContent({
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: note.rawText }]
          }]
        });
      } else {
        editor.commands.setContent('');
      }
    } finally {
      setTimeout(() => {
        editorUpdateRef.current = false;
      }, 100);
    }
  }, [editor, note?.id, note?.content]);

  // Load note when ID changes
  useEffect(() => {
    const loadNote = async () => {
      if (!id || noteIdRef.current === id) {
        return;
      }

      if (id.startsWith('temp-')) {
        navigate('/', { replace: true });
        return;
      }

      if (isLoadingRef.current) {
        return;
      }

      // Save previous note before switching
      if (noteIdRef.current && saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        const toSave = { ...pendingUpdatesRef.current };
        pendingUpdatesRef.current = {};
        if (Object.keys(toSave).length > 0) {
          await saveToFileSystem(noteIdRef.current, toSave);
        }
      }

      noteIdRef.current = id;
      isLoadingRef.current = true;
      setIsLoading(true);

      try {
        const loadedNote = await FileService.getNote(id);
        
        if (noteIdRef.current !== id) {
          return;
        }

        setNote(loadedNote);
      } catch (error) {
        if (noteIdRef.current !== id) {
          return;
        }
        console.error('❌ Failed to load note:', error);
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 1000);
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    };

    loadNote();
  }, [id, navigate, saveToFileSystem]);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      const toSave = { ...pendingUpdatesRef.current };
      if (noteIdRef.current && Object.keys(toSave).length > 0) {
        FileService.updateNote(noteIdRef.current, toSave);
      }
    };
  }, []);

  if (isLoading || !note) {
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
          <option value="Arial">Arial</option>
          <option value="Inter">Inter</option>
          <option value="Georgia">Georgia</option>
          <option value="Times New Roman">Times New Roman</option>
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
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          className={`p-2 theme-bg-hover rounded transition-colors text-theme-secondary ${editor?.isActive('underline') ? 'bg-theme-tertiary' : ''}`}
          title="Underline"
        >
          <UnderlineIcon size={16} />
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