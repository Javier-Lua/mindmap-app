import React, { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import FileService from '../services/FileService';
import type { Note, Folder, NotesContextType } from '../types';

const NotesContext = createContext<NotesContextType | null>(null);

export const useNotes = (): NotesContextType => {
  const context = useContext(NotesContext);
  if (!context) {
    throw new Error('useNotes must be used within NotesProvider');
  }
  return context;
};

interface NotesProviderProps {
  children: ReactNode;
}

export const NotesProvider: React.FC<NotesProviderProps> = ({ children }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
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

  const getNote = useCallback((noteId: string): Note | undefined => {
    return notes.find(n => n.id === noteId);
  }, [notes]);

  const updateNoteLocal = useCallback((noteId: string, updates: Partial<Note>) => {
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

      return updated;
    });
  }, []);

  const updateNote = useCallback(async (noteId: string, updates: Partial<Note>) => {
    // Optimistically update local state first
    updateNoteLocal(noteId, updates);

    try {
      const updatedNote = await FileService.updateNote(noteId, updates);

      setNotes(prev => {
        const index = prev.findIndex(n => n.id === noteId);
        if (index === -1) return prev;

        const updated = [...prev];
        updated[index] = updatedNote;

        return updated;
      });

      setLastSync(Date.now());
    } catch (error) {
      console.error('Failed to update note:', error);
      await loadNotes(false);
    }
  }, [updateNoteLocal, loadNotes]);

  const createNote = useCallback(async (data: Partial<Note> = {}): Promise<Note> => {
    if (createNoteInProgressRef.current) {
      console.warn('Note creation already in progress');
      throw new Error('Note creation already in progress');
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

  const deleteNote = useCallback(async (noteId: string) => {
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
    let previousNotes: Note[] = [];
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

  const createFolder = useCallback(async (name: string, parentId: string | null = null): Promise<Folder> => {
    try {
      const newFolder = await FileService.createFolder(name, parentId);
      setFolders(prev => [...prev, newFolder]);
      return newFolder;
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw error;
    }
  }, []);

  const updateFolder = useCallback(async (folderId: string, updates: Partial<Folder>) => {
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

  const deleteFolder = useCallback(async (folderId: string) => {
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

  const moveNoteToFolder = useCallback(async (noteId: string, folderId: string | null) => {
    try {
      // When moving to a new folder, the backend will assign a new position automatically
      await updateNote(noteId, { folderId });
    } catch (error) {
      console.error('Failed to move note:', error);
      throw error;
    }
  }, [updateNote]);

  const reorderNotes = useCallback(async (noteId: string, targetFolderId: string | null, newPosition: number) => {
    try {
      await FileService.reorderNotes(noteId, targetFolderId, newPosition);
      // Reload notes to get updated positions
      await loadNotes(false);
    } catch (error) {
      console.error('Failed to reorder notes:', error);
      throw error;
    }
  }, [loadNotes]);

  const refresh = useCallback(async () => {
    await Promise.all([
      loadNotes(false),
      loadFolders()
    ]);
  }, [loadNotes, loadFolders]);

  const value: NotesContextType = {
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
    reorderNotes,
    refresh
  };

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
};
