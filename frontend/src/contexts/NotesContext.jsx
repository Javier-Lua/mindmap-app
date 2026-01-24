import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
  const activeRequestsRef = useRef(new Set());
  const notesMapRef = useRef(new Map());

  useEffect(() => {
    const map = new Map();
    notes.forEach(note => map.set(note.id, note));
    notesMapRef.current = map;
  }, [notes]);

  const cancelRequest = useCallback((requestId) => {
    activeRequestsRef.current.delete(requestId);
  }, []);

  const loadNotes = useCallback(async (showLoader = false) => {
    const requestId = `load-notes-${Date.now()}`;
    activeRequestsRef.current.add(requestId);

    if (showLoader) setIsLoading(true);

    try {
      const res = await axios.get(`${API}/api/notes`, {
        withCredentials: true,
        timeout: 10000
      });

      if (activeRequestsRef.current.has(requestId)) {
        setNotes(res.data);
        setLastSync(Date.now());
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      if (activeRequestsRef.current.has(requestId)) {
        setIsLoading(false);
      }
      cancelRequest(requestId);
    }
  }, [cancelRequest]);

  const loadFolders = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/home`, {
        withCredentials: true,
        timeout: 10000
      });
      setFolders(res.data.folders || []);
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  }, []);

  const getNote = useCallback((noteId) => {
    return notesMapRef.current.get(noteId);
  }, []);

  const updateNoteLocal = useCallback((noteId, updates) => {
    setNotes(prev => {
      const index = prev.findIndex(n => n.id === noteId);
      if (index === -1) return prev;

      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };

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
      // Get the updated note from server
      const res = await axios.put(`${API}/api/notes/${noteId}`, updates, {
        withCredentials: true,
        timeout: 10000
      });

      // Update with server response to ensure consistency
      setNotes(prev => {
        const index = prev.findIndex(n => n.id === noteId);
        if (index === -1) return prev;

        const updated = [...prev];
        updated[index] = res.data;

        // Move to front if title was updated
        if (updates.title) {
          const [note] = updated.splice(index, 1);
          updated.unshift(note);
        }

        return updated;
      });

      // Update last sync time to prevent unnecessary reloads
      setLastSync(Date.now());
    } catch (error) {
      console.error('Failed to update note:', error);
      // On error, reload to get correct state
      await loadNotes(false);
    }
  }, [updateNoteLocal, loadNotes]);

  const createNote = useCallback(async (data = {}) => {
    const tempId = `temp-${Date.now()}`;
    const tempNote = {
      id: tempId,
      title: 'Untitled Thought',
      rawText: '',
      content: null,
      ephemeral: data.ephemeral !== false,
      sticky: false,
      archived: false,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      ...data
    };

    setNotes(prev => [tempNote, ...prev]);

    try {
      const res = await axios.post(`${API}/api/notes`, data, {
        withCredentials: true,
        timeout: 10000
      });

      setNotes(prev => prev.map(n => n.id === tempId ? res.data : n));
      
      // Update last sync time
      setLastSync(Date.now());
      
      return res.data;
    } catch (error) {
      console.error('Failed to create note:', error);
      setNotes(prev => prev.filter(n => n.id !== tempId));
      throw error;
    }
  }, []);

  const deleteNote = useCallback(async (noteId) => {
    // Optimistically remove from local state
    setNotes(prev => prev.filter(n => n.id !== noteId));

    try {
      await axios.delete(`${API}/api/notes/${noteId}`, {
        withCredentials: true,
        timeout: 10000
      });
      
      // Update last sync time
      setLastSync(Date.now());
    } catch (error) {
      console.error('Failed to delete note:', error);
      // On error, reload to get correct state
      await loadNotes(false);
    }
  }, [loadNotes]);

  const deleteAllNotes = useCallback(async () => {
    // Use functional update to get current notes
    let previousNotes = [];
    setNotes(prev => {
      previousNotes = prev;
      return [];
    });

    try {
      await axios.delete(`${API}/api/notes/all?confirm=DELETE_ALL`, {
        withCredentials: true,
        timeout: 30000
      });
      
      // Update last sync time
      setLastSync(Date.now());
    } catch (error) {
      console.error('Failed to delete all notes:', error);
      // Restore previous notes on error
      setNotes(previousNotes);
      throw error;
    }
  }, []);

  const createFolder = useCallback(async (name) => {
    try {
      const res = await axios.post(`${API}/api/folders`, { name }, {
        withCredentials: true,
        timeout: 10000
      });
      setFolders(prev => [...prev, res.data]);
      return res.data;
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw error;
    }
  }, []);

  const updateFolder = useCallback(async (folderId, updates) => {
    // Optimistically update
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, ...updates } : f));

    try {
      await axios.put(`${API}/api/folders/${folderId}`, updates, {
        withCredentials: true,
        timeout: 10000
      });
    } catch (error) {
      console.error('Failed to update folder:', error);
      await loadFolders();
    }
  }, [loadFolders]);

  const deleteFolder = useCallback(async (folderId) => {
    // Optimistically remove
    setFolders(prev => prev.filter(f => f.id !== folderId));

    try {
      await axios.delete(`${API}/api/folders/${folderId}`, {
        withCredentials: true,
        timeout: 10000
      });
      // Reload notes as they may have moved to root
      await loadNotes(false);
    } catch (error) {
      console.error('Failed to delete folder:', error);
      await loadFolders();
    }
  }, [loadNotes, loadFolders]);

  const refresh = useCallback(async () => {
    await Promise.all([loadNotes(false), loadFolders()]);
  }, [loadNotes, loadFolders]);

  const value = {
    notes,
    folders,
    isLoading,
    lastSync,
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