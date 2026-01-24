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
    updateNoteLocal(noteId, updates);

    try {
      await axios.put(`${API}/api/notes/${noteId}`, updates, {
        withCredentials: true,
        timeout: 10000
      });
    } catch (error) {
      console.error('Failed to update note:', error);
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
      return res.data;
    } catch (error) {
      console.error('Failed to create note:', error);
      setNotes(prev => prev.filter(n => n.id !== tempId));
      throw error;
    }
  }, []);

  const deleteNote = useCallback(async (noteId) => {
    setNotes(prev => prev.filter(n => n.id !== noteId));

    try {
      await axios.delete(`${API}/api/notes/${noteId}`, {
        withCredentials: true,
        timeout: 10000
      });
    } catch (error) {
      console.error('Failed to delete note:', error);
      await loadNotes(false);
    }
  }, [loadNotes]);

  const deleteAllNotes = useCallback(async () => {
    setNotes([]);

    try {
      await axios.delete(`${API}/api/notes/all?confirm=DELETE_ALL`, {
        withCredentials: true,
        timeout: 30000
      });
    } catch (error) {
      console.error('Failed to delete all notes:', error);
      await loadNotes(false);
      throw error;
    }
  }, [loadNotes]);

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
    setFolders(prev => prev.filter(f => f.id !== folderId));

    try {
      await axios.delete(`${API}/api/folders/${folderId}`, {
        withCredentials: true,
        timeout: 10000
      });
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