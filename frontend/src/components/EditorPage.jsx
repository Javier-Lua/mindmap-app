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
  Moon, Sun, Bold, Italic,
  Highlighter,
  List, ListOrdered, Code, Quote, Undo, Redo,
  Layout
} from 'lucide-react';
import { useNotes } from '../contexts/NotesContext';
import FileService from '../services/FileService';

/**
 * DEBUG VERSION - This will help us understand what's happening
 */

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notes, updateNoteLocal, getNote } = useNotes();
  
  const [note, setNote] = useState(null);
  const [isA4, setIsA4] = useState(true);
  const [theme, setTheme] = useState(() => {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  });
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Inter');
  
  // Refs to prevent race conditions
  const currentNoteIdRef = useRef(null);
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

  // Debounced save to file system (background operation)
  const saveToFileSystem = useCallback(async (noteId, updates) => {
    console.log('💾 Saving to file system:', noteId, updates);
    try {
      await FileService.updateNote(noteId, updates);
      console.log('✅ Saved to file system successfully');
    } catch (error) {
      console.error('❌ Failed to save to file system:', error);
    }
  }, []);

  // Schedule a save (debounced)
  const scheduleSave = useCallback((noteId, updates) => {
    console.log('⏱️ Scheduling save for:', noteId);
    
    // Merge with pending updates
    pendingUpdatesRef.current = {
      ...pendingUpdatesRef.current,
      ...updates
    };

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Schedule new save (300ms debounce)
    saveTimeoutRef.current = setTimeout(() => {
      const toSave = { ...pendingUpdatesRef.current };
      pendingUpdatesRef.current = {};
      console.log('🚀 Debounce completed, saving now:', toSave);
      saveToFileSystem(noteId, toSave);
    }, 300);
  }, [saveToFileSystem]);

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
      // Ignore programmatic updates
      if (editorUpdateRef.current || !note?.id) return;
      
      const json = editor.getJSON();
      const text = editor.getText();
      const title = text.split('\n')[0].slice(0, 50) || 'Untitled Thought';
      
      const updates = {
        title,
        content: json,
        rawText: text
      };

      console.log('✏️ Editor updated, title:', title);

      // 1. Update local state immediately
      setNote(prev => {
        console.log('📝 Updating local note state');
        return {
          ...prev,
          ...updates
        };
      });

      // 2. Update context immediately (this updates sidebar instantly)
      console.log('🌐 Calling updateNoteLocal for:', note.id);
      updateNoteLocal(note.id, updates);

      // 3. Schedule background save to file system
      scheduleSave(note.id, updates);
    }
  }, [note?.id, updateNoteLocal, scheduleSave]);

  // Load note when ID changes
  useEffect(() => {
    console.log('🔄 ID changed to:', id, 'Current:', currentNoteIdRef.current);
    
    if (!id || currentNoteIdRef.current === id) {
      console.log('⏭️ Skipping load (same ID or no ID)');
      return;
    }

    // Save previous note immediately before switching
    const savePreviousNote = async () => {
      if (currentNoteIdRef.current && saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        const toSave = { ...pendingUpdatesRef.current };
        pendingUpdatesRef.current = {};
        if (Object.keys(toSave).length > 0) {
          console.log('💾 Saving previous note before switch:', currentNoteIdRef.current);
          await saveToFileSystem(currentNoteIdRef.current, toSave);
        }
      }
    };

    savePreviousNote().then(() => {
      currentNoteIdRef.current = id;
      loadNote();
    });
  }, [id, saveToFileSystem]);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        const toSave = { ...pendingUpdatesRef.current };
        if (note?.id && Object.keys(toSave).length > 0) {
          console.log('🔚 Component unmounting, saving:', note.id);
          saveToFileSystem(note.id, toSave);
        }
      }
    };
  }, [note?.id, saveToFileSystem]);

  const loadNote = async () => {
    console.log('📖 Loading note:', id);
    
    if (id.startsWith('temp-')) {
      console.warn('⚠️ Attempted to load temporary note, redirecting...');
      navigate('/', { replace: true });
      return;
    }

    if (isLoadingRef.current) {
      console.log('⏸️ Already loading, skipping...');
      return;
    }
    isLoadingRef.current = true;

    try {
      // Check what getNote returns
      console.log('🔍 Checking context for note:', id);
      const cachedNote = getNote(id);
      console.log('📦 Context returned:', cachedNote ? {
        id: cachedNote.id,
        title: cachedNote.title,
        hasContent: !!cachedNote.content,
        hasRawText: !!cachedNote.rawText,
        rawTextPreview: cachedNote.rawText?.substring(0, 50)
      } : 'NULL');

      // Also check notes array directly
      const noteFromArray = notes.find(n => n.id === id);
      console.log('📋 Notes array has:', noteFromArray ? {
        id: noteFromArray.id,
        title: noteFromArray.title,
        hasContent: !!noteFromArray.content,
        hasRawText: !!noteFromArray.rawText,
        rawTextPreview: noteFromArray.rawText?.substring(0, 50)
      } : 'NULL');
      
      if (cachedNote) {
        console.log('✅ Using cached note from context');
        setNote(cachedNote);
        
        if (editor && !editor.isDestroyed) {
          editorUpdateRef.current = true;
          console.log('📄 Setting editor content from cache');
          
          if (cachedNote.content && typeof cachedNote.content === 'object') {
            console.log('   Using content object');
            editor.commands.setContent(cachedNote.content);
          } else if (cachedNote.rawText) {
            console.log('   Using rawText:', cachedNote.rawText.substring(0, 50));
            editor.commands.setContent({
              type: 'doc',
              content: [{
                type: 'paragraph',
                content: [{ type: 'text', text: cachedNote.rawText }]
              }]
            });
          } else {
            console.log('   No content, using empty');
            editor.commands.setContent('');
          }
          
          setTimeout(() => {
            editorUpdateRef.current = false;
          }, 0);
        }
        
        isLoadingRef.current = false;
        return; // CRITICAL: Don't load from file!
      }

      // If not in context, load from file system
      console.log('📂 Loading from file system:', id);
      const res = await FileService.getNote(id);
      console.log('📄 File system returned:', {
        id: res.id,
        title: res.title,
        hasContent: !!res.content,
        hasRawText: !!res.rawText,
        rawTextPreview: res.rawText?.substring(0, 50)
      });

      // Check if we're still on the same note
      if (currentNoteIdRef.current !== id) {
        console.log('⚠️ Note ID changed during load, aborting');
        return;
      }

      setNote(res);
      
      if (editor && !editor.isDestroyed) {
        editorUpdateRef.current = true;
        console.log('📄 Setting editor content from file');
        
        if (res.content && typeof res.content === 'object') {
          editor.commands.setContent(res.content);
        } else if (res.rawText) {
          editor.commands.setContent({
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{ type: 'text', text: res.rawText }]
            }]
          });
        } else {
          editor.commands.setContent('');
        }
        
        setTimeout(() => {
          editorUpdateRef.current = false;
        }, 0);
      }
    } catch (error) {
      if (currentNoteIdRef.current !== id) {
        return;
      }

      console.error('❌ Failed to load note:', error);
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 1000);
    } finally {
      isLoadingRef.current = false;
    }
  };

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