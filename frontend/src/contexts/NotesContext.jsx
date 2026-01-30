import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import FileService from '../services/FileService';

const NotesContext = createContext(null);

export const useNotes = () => {
  const context = useContext(NotesContext);
  if (!context) {
    throw new Error('useNotes must be used within NotesProvider');
  }
  return context;
};

export const NotesProvider = ({ children }) => {
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]); // Kept for compatibility, not used in local version
  const [isLoading, setIsLoading] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const createNoteInProgressRef = useRef(false);

  // Initialize app on mount
  useEffect(() => {
    const init = async () => {
      try {
        await FileService.init();
        setInitialized(true);
        await loadNotes(true);
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
    };
    init();
  }, []);

  const loadNotes = useCallback(async (showLoader = false) => {
    if (showLoader) setIsLoading(true);

    try {
      const serverNotes = await FileService.getNotes();
      setNotes(serverNotes);
      setLastSync(Date.now());
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadFolders = useCallback(async () => {
    // Folders are not used in local version, but kept for compatibility
    setFolders([]);
  }, []);

  // FIXED: Return current note from state, not from a ref
  const getNote = useCallback((noteId) => {
    return notes.find(n => n.id === noteId);
  }, [notes]);

  const updateNoteLocal = useCallback((noteId, updates) => {
    console.log('🔄 updateNoteLocal called for:', noteId, 'with updates:', updates);
    
    setNotes(prev => {
      const index = prev.findIndex(n => n.id === noteId);
      if (index === -1) {
        console.warn('⚠️ Note not found in context:', noteId);
        return prev;
      }

      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };

      console.log('✅ Note updated in context:', {
        id: updated[index].id,
        title: updated[index].title,
        hasContent: !!updated[index].content,
        hasRawText: !!updated[index].rawText
      });

      // Move to front if title changed
      if (updates.title || updates.updatedAt) {
        const [note] = updated.splice(index, 1);
        updated.unshift(note);
      }

      return updated;
    });
  }, []);

  const updateNote = useCallback(async (noteId, updates) => {
    // Optimistically update local state first
    updateNoteLocal(noteId, updates);

    try {
      const updatedNote = await FileService.updateNote(noteId, updates);

      setNotes(prev => {
        const index = prev.findIndex(n => n.id === noteId);
        if (index === -1) return prev;

        const updated = [...prev];
        updated[index] = updatedNote;

        if (updates.title) {
          const [note] = updated.splice(index, 1);
          updated.unshift(note);
        }

        return updated;
      });

      setLastSync(Date.now());
    } catch (error) {
      console.error('Failed to update note:', error);
      await loadNotes(false);
    }
  }, [updateNoteLocal, loadNotes]);

  const createNote = useCallback(async (data = {}) => {
    if (createNoteInProgressRef.current) {
      console.warn('Note creation already in progress');
      return;
    }

    createNoteInProgressRef.current = true;

    try {
      const newNote = await FileService.createNote(data);
      setNotes(prev => [newNote, ...prev]);
      setLastSync(Date.now());
      return newNote;
    } catch (error) {
      console.error('Failed to create note:', error);
      throw error;
    } finally {
      createNoteInProgressRef.current = false;
    }
  }, []);

  const deleteNote = useCallback(async (noteId) => {
    // Optimistically remove from local state
    setNotes(prev => prev.filter(n => n.id !== noteId));

    try {
      await FileService.deleteNote(noteId);
      setLastSync(Date.now());
    } catch (error) {
      console.error('Failed to delete note:', error);
      await loadNotes(false);
    }
  }, [loadNotes]);

  const deleteAllNotes = useCallback(async () => {
    let previousNotes = [];
    setNotes(prev => {
      previousNotes = prev;
      return [];
    });

    try {
      await FileService.deleteAllNotes();
      setLastSync(Date.now());
    } catch (error) {
      console.error('Failed to delete all notes:', error);
      setNotes(previousNotes);
      throw error;
    }
  }, []);

  const createFolder = useCallback(async (name) => {
    // Folders not implemented in local version
    console.warn('Folders not implemented in local version');
    return null;
  }, []);

  const updateFolder = useCallback(async (folderId, updates) => {
    console.warn('Folders not implemented in local version');
  }, []);

  const deleteFolder = useCallback(async (folderId) => {
    console.warn('Folders not implemented in local version');
  }, []);

  const refresh = useCallback(async () => {
    await loadNotes(false);
  }, [loadNotes]);

  const value = {
    notes,
    folders,
    isLoading,
    lastSync,
    initialized,
    loadNotes,
    loadFolders,
    getNote,
    updateNoteLocal,
    updateNote,
    createNote,
    deleteNote,
    deleteAllNotes,
    createFolder,
    updateFolder,
    deleteFolder,
    refresh
  };

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
};