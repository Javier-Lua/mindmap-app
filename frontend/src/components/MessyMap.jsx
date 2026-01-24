import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  Home, Search, Brain, Eye, Moon, Sun, Calendar, 
  Maximize2, Minimize2, Plus, Trash2, Edit3, X, Grid3x3,
  LayoutList, Network, CircleDot, RotateCcw, RotateCw,
  Archive, Star, Sparkles, Link2, Zap, Check, Loader, RefreshCw
} from 'lucide-react';
import { useNotes } from '../contexts/NotesContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function MessyMap() {
  const navigate = useNavigate();
  const { folderId } = useParams();
  const { notes, createNote: contextCreateNote, updateNote, deleteNote: contextDeleteNote } = useNotes();
  const canvasRef = useRef(null);
  
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedNode, setFocusedNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [theme, setTheme] = useState(() => {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  });
  const [viewMode, setViewMode] = useState('freeform');
  const [showGrid, setShowGrid] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  
  const [draggingNode, setDraggingNode] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [mouseDownPos, setMouseDownPos] = useState(null);
  const [hasMoved, setHasMoved] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [multiSelect, setMultiSelect] = useState(new Set());
  
  const [clusters, setClusters] = useState([]);
  const [showClusters, setShowClusters] = useState(false);
  const [clusterPreview, setClusterPreview] = useState(null);
  const [isClustering, setIsClustering] = useState(false);
  const [orphans, setOrphans] = useState([]);
  const [showOrphans, setShowOrphans] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [messyMode, setMessyMode] = useState(true);
  
  const [editingNode, setEditingNode] = useState(null);
  const [editingText, setEditingText] = useState('');
  
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  const isUpdatingRef = useRef(false);
  const lastLoadTimeRef = useRef(0);

  useEffect(() => {
    loadData(true);
    loadRediscover();
    
    const archiveInterval = setInterval(autoArchive, 5 * 60 * 1000);
    return () => clearInterval(archiveInterval);
  }, [folderId, showArchived]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNode && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          e.preventDefault();
          handleDeleteNode(selectedNode.id);
        }
      } else if (e.key === 'Escape') {
        setSelectedNode(null);
        setConnectingFrom(null);
        setMultiSelect(new Set());
        setEditingNode(null);
        setShowClusters(false);
        setClusterPreview(null);
      } else if (e.key === 'Enter' && editingNode && !e.shiftKey) {
        e.preventDefault();
        saveInlineEdit();
      } else if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        loadData(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, focusedNode, historyIndex, history, editingNode, editingText]);

  const saveToHistory = useCallback((newNodes) => {
    if (isUpdatingRef.current) return;
    
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(newNodes)));
      return newHistory.slice(-50);
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  const loadData = async (isInitialLoad = false) => {
    const now = Date.now();
    if (now - lastLoadTimeRef.current < 500) {
      return;
    }
    lastLoadTimeRef.current = now;

    if (isInitialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    
    setError(null);
    isUpdatingRef.current = true;

    try {
      const url = folderId 
        ? `${API}/api/mindmap?folderId=${folderId}&showArchived=${showArchived}` 
        : `${API}/api/mindmap?showArchived=${showArchived}`;
      
      const res = await axios.get(url, { 
        withCredentials: true,
        timeout: 15000
      });
      
      if (res.data && res.data.nodes) {
        if (!draggingNode) {
          setNodes(res.data.nodes);
          setEdges(res.data.edges || []);
          
          if (isInitialLoad && res.data.nodes.length > 0) {
            saveToHistory(res.data.nodes);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load mindmap data:', error);
      setError('Failed to load mindmap. Click to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      isUpdatingRef.current = false;
    }
  };

  const loadRediscover = async () => {
    try {
      const res = await axios.get(`${API}/api/rediscover`, { 
        withCredentials: true,
        timeout: 10000
      });
      setOrphans(res.data.orphans || []);
    } catch (error) {
      console.error('Failed to load orphaned notes:', error);
    }
  };

  const autoArchive = async () => {
    try {
      const res = await axios.post(`${API}/api/auto-archive`, {}, { 
        withCredentials: true,
        timeout: 10000
      });
      if (res.data.archivedCount > 0) {
        loadData(false);
      }
    } catch (error) {
      console.error('Auto-archive failed:', error);
    }
  };

  const runClustering = async (preview = true) => {
    setIsClustering(true);
    try {
      const res = await axios.post(`${API}/api/cluster`, { preview }, { 
        withCredentials: true,
        timeout: 20000
      });
      
      if (res.data.clusters && res.data.clusters.length > 0) {
        setClusters(res.data.clusters);
        if (preview) {
          setClusterPreview(res.data.clusters);
          setShowClusters(true);
        } else {
          setClusterPreview(null);
          setShowClusters(false);
          await loadData(false);
        }
      } else {
        alert('Not enough notes with content to cluster. Add at least 3 notes with text content.');
      }
    } catch (error) {
      console.error('Clustering failed:', error);
      alert('Clustering failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsClustering(false);
    }
  };

  const applyClustering = async () => {
    await runClustering(false);
  };

  const createNoteOnCanvas = async (x, y, ephemeral = true) => {
    if (isUpdatingRef.current) return;
    
    try {
      const newNote = await contextCreateNote({ 
        x: (x - panOffset.x) / zoom, 
        y: (y - panOffset.y) / zoom,
        folderId: folderId || null,
        ephemeral
      });
      
      const newNodes = [...nodes, newNote];
      setNodes(newNodes);
      saveToHistory(newNodes);
    } catch (error) {
      console.error('Failed to create note:', error);
      alert('Failed to create note. Please try again.');
    }
  };

  const updateNodePosition = async (nodeId, x, y) => {
    if (isUpdatingRef.current) return;
    
    try {
      await updateNote(nodeId, { x, y });
    } catch (error) {
      console.error('Failed to update node position:', error);
      loadData(false);
    }
  };

  const startInlineEdit = (node, e) => {
    if (e) e.stopPropagation();
    setEditingNode(node.id);
    setEditingText(node.rawText || node.title || '');
  };

  const saveInlineEdit = async () => {
    if (!editingNode || !editingText.trim()) {
      setEditingNode(null);
      return;
    }

    try {
      const title = editingText.split('\n')[0].slice(0, 50) || 'Untitled';
      
      setNodes(prevNodes => prevNodes.map(n => 
        n.id === editingNode 
          ? { ...n, rawText: editingText, title } 
          : n
      ));
      
      await updateNote(editingNode, {
        plainText: editingText,
        title,
        messyMode: true
      });
      
      setEditingNode(null);
    } catch (error) {
      console.error('Failed to save inline edit:', error);
      alert('Failed to save changes.');
      setEditingNode(null);
    }
  };

  const handleDeleteNode = async (nodeId) => {
    if (!confirm('Delete this note?')) return;
    
    try {
      const newNodes = nodes.filter(n => n.id !== nodeId);
      setNodes(newNodes);
      setEdges(edges.filter(e => e.sourceId !== nodeId && e.targetId !== nodeId));
      saveToHistory(newNodes);
      
      await contextDeleteNote(nodeId);
    } catch (error) {
      console.error('Failed to delete note:', error);
      alert('Failed to delete note.');
      loadData(false);
    }
  };

  const toggleArchive = async (nodeId) => {
    try {
      const node = nodes.find(n => n.id === nodeId);
      
      const newNodes = nodes.map(n => 
        n.id === nodeId ? { ...n, archived: !n.archived } : n
      );
      setNodes(newNodes);
      saveToHistory(newNodes);
      
      await updateNote(nodeId, { archived: !node.archived });
    } catch (error) {
      console.error('Failed to toggle archive:', error);
      loadData(false);
    }
  };

  const toggleSticky = async (nodeId) => {
    try {
      const node = nodes.find(n => n.id === nodeId);
      
      const newNodes = nodes.map(n => 
        n.id === nodeId ? { ...n, sticky: !n.sticky, ephemeral: n.sticky } : n
      );
      setNodes(newNodes);
      saveToHistory(newNodes);
      
      await updateNote(nodeId, { 
        sticky: !node.sticky,
        ephemeral: node.sticky
      });
    } catch (error) {
      console.error('Failed to toggle sticky:', error);
      loadData(false);
    }
  };

  const createLink = async (sourceId, targetId) => {
    try {
      const res = await axios.post(`${API}/api/links`, { 
        sourceId, 
        targetId 
      }, { 
        withCredentials: true,
        timeout: 10000
      });
      
      setEdges([...edges, res.data]);
      setConnectingFrom(null);
    } catch (error) {
      console.error('Failed to create link:', error);
      alert('Failed to create connection.');
    }
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setNodes(JSON.parse(JSON.stringify(history[historyIndex - 1])));
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setNodes(JSON.parse(JSON.stringify(history[historyIndex + 1])));
    }
  };

  const handleMouseDown = (e, node) => {
    if (e.button === 0) {
      e.stopPropagation();
      setMouseDownPos({ x: e.clientX, y: e.clientY });
      setHasMoved(false);
      
      if (e.ctrlKey || e.metaKey) {
        setMultiSelect(prev => {
          const newSet = new Set(prev);
          if (newSet.has(node.id)) {
            newSet.delete(node.id);
          } else {
            newSet.add(node.id);
          }
          return newSet;
        });
        return;
      }
      
      const rect = canvasRef.current.getBoundingClientRect();
      const nodeScreenX = node.x * zoom + panOffset.x;
      const nodeScreenY = node.y * zoom + panOffset.y;
      
      setDragOffset({
        x: e.clientX - rect.left - nodeScreenX,
        y: e.clientY - rect.top - nodeScreenY
      });
      
      setDraggingNode(node);
      setSelectedNode(node);
    }
  };

  const handleMouseMove = (e) => {
    if (mouseDownPos) {
      const dx = e.clientX - mouseDownPos.x;
      const dy = e.clientY - mouseDownPos.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        setHasMoved(true);
      }
    }

    if (draggingNode) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - panOffset.x - dragOffset.x) / zoom;
      const y = (e.clientY - rect.top - panOffset.y - dragOffset.y) / zoom;
      
      const snapX = showGrid ? Math.round(x / 50) * 50 : x;
      const snapY = showGrid ? Math.round(y / 50) * 50 : y;
      
      setNodes(prevNodes => prevNodes.map(n => 
        n.id === draggingNode.id ? { ...n, x: snapX, y: snapY } : n
      ));
    } else if (isPanning) {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  };

  const handleMouseUp = () => {
    if (draggingNode) {
      setNodes(currentNodes => {
        const draggedNode = currentNodes.find(n => n.id === draggingNode.id);
        if (draggedNode) {
          updateNodePosition(draggingNode.id, draggedNode.x, draggedNode.y);
          saveToHistory(currentNodes);
        }
        return currentNodes;
      });
      setDraggingNode(null);
    }
    setIsPanning(false);
  };

  const handleCanvasClick = (e) => {
    if (e.target === canvasRef.current && !hasMoved && mouseDownPos) {
      if (connectingFrom) {
        setConnectingFrom(null);
      } else {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        createNoteOnCanvas(x, y, messyMode);
      }
    }
    setMouseDownPos(null);
    setHasMoved(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.1, Math.min(3, prev * delta)));
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg-primary">
        <div className="text-center">
          <Loader className="animate-spin text-purple-600 mx-auto mb-4" size={48} />
          <p className="text-theme-secondary">Loading mindmap...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg-primary">
        <div className="text-center">
          <X className="text-red-500 mx-auto mb-4" size={48} />
          <p className="text-theme-secondary mb-4">{error}</p>
          <button
            onClick={() => loadData(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen theme-bg-primary overflow-hidden transition-colors duration-200">
      <div className="absolute top-0 left-0 right-0 z-20 toolbar-themed shadow-sm">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/')}
              className="p-2 theme-bg-hover rounded-md transition-colors text-theme-secondary"
              title="Home"
            >
              <Home size={16} />
            </button>
            
            <div className="w-px h-4 bg-theme-primary" />
            
            <button
              onClick={() => loadData(false)}
              disabled={refreshing}
              className="p-2 theme-bg-hover rounded-md transition-colors disabled:opacity-50 text-theme-secondary"
              title="Refresh (Ctrl+R)"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={() => runClustering(true)}
              disabled={isClustering || nodes.length < 3}
              className="flex items-center gap-1 px-3 py-1.5 theme-bg-hover rounded-md transition-colors text-xs disabled:opacity-50 text-theme-primary"
              title="Smart Tidy - Organize notes into clusters"
            >
              <Brain size={14} />
              {isClustering ? 'Tidying...' : 'Tidy'}
            </button>

            {refreshing && (
              <span className="text-xs text-blue-400">Refreshing...</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={undo}
              disabled={historyIndex <= 0}
              className={`p-1.5 rounded-md ${historyIndex <= 0 ? 'opacity-30 cursor-not-allowed' : 'theme-bg-hover'} text-theme-secondary`}
              title="Undo (Ctrl+Z)"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              className={`p-1.5 rounded-md ${historyIndex >= history.length - 1 ? 'opacity-30 cursor-not-allowed' : 'theme-bg-hover'} text-theme-secondary`}
              title="Redo (Ctrl+Y)"
            >
              <RotateCw size={14} />
            </button>

            <div className="w-px h-4 bg-theme-primary" />

            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`p-1.5 rounded-md ${showGrid ? 'bg-purple-500 bg-opacity-20 text-purple-400' : 'text-theme-secondary theme-bg-hover'}`}
              title="Toggle Grid"
            >
              <Grid3x3 size={14} />
            </button>

            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md theme-bg-hover text-theme-secondary"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>
      </div>

      {showClusters && clusterPreview && (
        <div className="absolute top-16 right-4 z-30 w-80 modal-themed rounded-lg shadow-xl p-4 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold theme-text-primary flex items-center gap-2">
              <Sparkles size={16} className="text-purple-400" />
              Cluster Preview
            </h3>
            <button
              onClick={() => {
                setShowClusters(false);
                setClusterPreview(null);
              }}
              className="text-theme-tertiary hover:text-theme-primary"
            >
              <X size={18} />
            </button>
          </div>

          <p className="text-xs text-theme-secondary mb-4">
            Found {clusterPreview.length} clusters. Apply to reorganize your notes.
          </p>

          <div className="space-y-3 mb-4">
            {clusterPreview.map((cluster, idx) => (
              <div
                key={cluster.id}
                className="p-3 rounded-lg border border-theme-primary"
                style={{ backgroundColor: cluster.color }}
              >
                <div className="font-medium text-gray-900 mb-2 text-sm">
                  {cluster.name} ({cluster.notes.length} notes)
                </div>
                <div className="space-y-1">
                  {cluster.notes.slice(0, 3).map(note => (
                    <div key={note.id} className="text-xs text-gray-700 truncate">
                      • {note.title}
                    </div>
                  ))}
                  {cluster.notes.length > 3 && (
                    <div className="text-xs text-gray-600 italic">
                      +{cluster.notes.length - 3} more...
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={applyClustering}
              disabled={isClustering}
              className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
            >
              {isClustering ? 'Applying...' : 'Apply'}
            </button>
            <button
              onClick={() => {
                setShowClusters(false);
                setClusterPreview(null);
              }}
              className="px-3 py-2 btn-secondary rounded-lg text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showGrid && (
        <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
          <defs>
            <pattern id="grid" width={50 * zoom} height={50 * zoom} patternUnits="userSpaceOnUse">
              <circle cx={0} cy={0} r={1} fill={theme === 'dark' ? '#444' : '#ccc'} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      )}

      <div
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onMouseDown={(e) => {
          if (e.target === canvasRef.current) {
            setMouseDownPos({ x: e.clientX, y: e.clientY });
            setHasMoved(false);
            setIsPanning(true);
            setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
          }
        }}
        style={{ paddingTop: '48px' }}
      >
        <svg
          className="absolute inset-0 pointer-events-none"
          style={{
            width: '100%',
            height: '100%',
            top: 0,
            left: 0,
            zIndex: 0
          }}
        >
          <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`}>
            {edges.map(edge => {
              const source = nodes.find(n => n.id === edge.sourceId);
              const target = nodes.find(n => n.id === edge.targetId);
              if (!source || !target) return null;

              const opacity = focusedNode 
                ? (edge.sourceId === focusedNode || edge.targetId === focusedNode ? 0.8 : 0.1)
                : 0.4;

              return (
                <line
                  key={edge.id}
                  x1={source.x + 140}
                  y1={source.y + 60}
                  x2={target.x + 140}
                  y2={target.y + 60}
                  stroke={theme === 'dark' ? '#6b7280' : '#94a3b8'}
                  strokeWidth={2}
                  opacity={opacity}
                />
              );
            })}
          </g>
        </svg>

        {clusterPreview && (
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{
              width: '100%',
              height: '100%',
              top: 0,
              left: 0,
              zIndex: 0
            }}
          >
            <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`}>
              {clusterPreview.map(cluster => (
                <circle
                  key={cluster.id}
                  cx={cluster.centerX}
                  cy={cluster.centerY}
                  r={Math.min(200, cluster.notes.length * 40)}
                  fill={cluster.color}
                  opacity={0.1}
                  stroke={cluster.color}
                  strokeWidth={2}
                  strokeDasharray="5,5"
                />
              ))}
            </g>
          </svg>
        )}

        {nodes.map(node => {
          const isEditing = editingNode === node.id;

          return (
            <div
              key={node.id}
              className="absolute cursor-grab active:cursor-grabbing group"
              style={{
                left: node.x * zoom + panOffset.x,
                top: node.y * zoom + panOffset.y,
                transform: `scale(${zoom})`,
                transformOrigin: '0 0',
                zIndex: isEditing ? 100 : 1
              }}
              onMouseDown={(e) => !isEditing && handleMouseDown(e, node)}
              onDoubleClick={(e) => {
                if (!isEditing) {
                  e.stopPropagation();
                  navigate(`/note/${node.id}`);
                }
              }}
            >
              <div
                className={`relative card-themed rounded-lg shadow-md hover:shadow-xl transition-all duration-200 border-2 ${
                  selectedNode?.id === node.id 
                    ? 'border-purple-500 ring-2 ring-purple-500 ring-opacity-30'
                    : ''
                }`}
                style={{ width: '280px', minHeight: '120px' }}
              >
                <div className="absolute -top-2 -left-2 flex gap-1">
                  {node.sticky && (
                    <div className="p-1 bg-yellow-500 rounded-full shadow-sm">
                      <Star size={10} className="text-white" fill="white" />
                    </div>
                  )}
                  {node.ephemeral && (
                    <div className="p-1 bg-gray-400 rounded-full shadow-sm">
                      <Zap size={10} className="text-white" />
                    </div>
                  )}
                </div>

                <div className="p-3">
                  {isEditing ? (
                    <div className="relative">
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onBlur={saveInlineEdit}
                        autoFocus
                        className="w-full input-themed border border-blue-500 rounded px-2 py-1 text-sm resize-none"
                        rows={4}
                        placeholder="Type your note..."
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          saveInlineEdit();
                        }}
                        className="absolute -top-2 -right-2 p-1 bg-green-500 text-white rounded-full hover:bg-green-600 shadow-lg"
                      >
                        <Check size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <h3 className="font-semibold theme-text-primary mb-1.5 text-sm line-clamp-2">
                        {node.title}
                      </h3>
                      {node.rawText && (
                        <p className="text-xs text-theme-secondary line-clamp-2">
                          {node.rawText.slice(0, 100)}
                          {node.rawText.length > 100 && '...'}
                        </p>
                      )}
                    </>
                  )}
                </div>

                {!isEditing && (
                  <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                      onClick={(e) => startInlineEdit(node, e)}
                      className="p-1.5 bg-blue-500 text-white rounded-md shadow-lg hover:bg-blue-600"
                      title="Edit"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSticky(node.id);
                      }}
                      className={`p-1.5 ${node.sticky ? 'bg-yellow-500' : 'bg-gray-600'} text-white rounded-md shadow-lg hover:bg-yellow-600`}
                      title="Pin"
                    >
                      <Star size={12} fill={node.sticky ? 'white' : 'none'} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNode(node.id);
                      }}
                      className="p-1.5 bg-red-500 text-white rounded-md shadow-lg hover:bg-red-600"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-2 left-2 z-20 bg-theme-card rounded-md shadow-sm px-3 py-1.5 border border-theme-primary flex items-center gap-3 text-xs text-theme-secondary">
        <span>{nodes.length} notes</span>
        <span>•</span>
        <span>{edges.length} links</span>
        <span>•</span>
        <span className="text-green-500">{Math.round(zoom * 100)}%</span>
      </div>

      {nodes.length === 0 && !loading && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <div className="modal-themed rounded-xl shadow-xl p-8">
            <Plus size={48} className="mx-auto mb-3 text-theme-tertiary" />
            <p className="text-lg theme-text-primary mb-2 font-semibold">Click anywhere to create a note</p>
            <p className="text-sm text-theme-secondary">Double-click to edit • Ctrl+R to refresh</p>
          </div>
        </div>
      )}
    </div>
  );
}   