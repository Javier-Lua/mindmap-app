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
  const [folders, setFolders] = useState([]);
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
        await Promise.all([
          loadNotes(true),
          loadFolders()
        ]);
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
    try {
      const serverFolders = await FileService.getFolders();
      setFolders(serverFolders);
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  }, []);

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

  const createFolder = useCallback(async (name, parentId = null) => {
    try {
      const newFolder = await FileService.createFolder(name, parentId);
      setFolders(prev => [...prev, newFolder]);
      return newFolder;
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw error;
    }
  }, []);

  const updateFolder = useCallback(async (folderId, updates) => {
    // Optimistically update local state
    setFolders(prev => prev.map(f => 
      f.id === folderId ? { ...f, ...updates } : f
    ));

    try {
      await FileService.updateFolder(folderId, updates);
    } catch (error) {
      console.error('Failed to update folder:', error);
      await loadFolders();
    }
  }, [loadFolders]);

  const deleteFolder = useCallback(async (folderId) => {
    // Optimistically remove from local state
    setFolders(prev => prev.filter(f => f.id !== folderId));

    try {
      await FileService.deleteFolder(folderId);
      // Reload notes since they may have been moved
      await loadNotes(false);
    } catch (error) {
      console.error('Failed to delete folder:', error);
      await Promise.all([loadFolders(), loadNotes(false)]);
    }
  }, [loadFolders, loadNotes]);

  const moveNoteToFolder = useCallback(async (noteId, folderId) => {
    try {
      await updateNote(noteId, { folderId });
    } catch (error) {
      console.error('Failed to move note:', error);
      throw error;
    }
  }, [updateNote]);

  const refresh = useCallback(async () => {
    await Promise.all([
      loadNotes(false),
      loadFolders()
    ]);
  }, [loadNotes, loadFolders]);

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
    moveNoteToFolder,
    refresh
  };

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
};