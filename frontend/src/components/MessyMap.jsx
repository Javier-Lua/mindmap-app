import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  Home, Search, Brain, Eye, Moon, Sun, Layers, Calendar, 
  Maximize2, Minimize2, Plus, Trash2, Edit3, X, Grid3x3,
  LayoutList, Network, CircleDot, RotateCcw, RotateCw,
  Archive, Star, Filter, Sparkles, Link2, Zap, Check
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function MessyMap() {
  const navigate = useNavigate();
  const { folderId } = useParams();
  const canvasRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedNode, setFocusedNode] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [showClusters, setShowClusters] = useState(false);
  const [clusterPreview, setClusterPreview] = useState(null);
  const [dateRange, setDateRange] = useState([0, Date.now()]);
  const [showTimeline, setShowTimeline] = useState(false);
  const [orphans, setOrphans] = useState([]);
  const [showOrphans, setShowOrphans] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [draggingNode, setDraggingNode] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [mouseDownPos, setMouseDownPos] = useState(null);
  const [hasMoved, setHasMoved] = useState(false);
  const [theme, setTheme] = useState('dark');
  
  // New features state
  const [viewMode, setViewMode] = useState('freeform');
  const [showGrid, setShowGrid] = useState(false);
  const [filterMode, setFilterMode] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [messyMode, setMessyMode] = useState(true);
  const [multiSelect, setMultiSelect] = useState(new Set());
  
  // Inline editing state
  const [editingNode, setEditingNode] = useState(null);
  const [editingText, setEditingText] = useState('');

  useEffect(() => {
    loadData();
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
          deleteNode(selectedNode.id);
        }
      } else if (e.key === 'a' && selectedNode && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        toggleArchive(selectedNode.id);
      } else if (e.key === 's' && selectedNode && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        toggleSticky(selectedNode.id);
      } else if (e.key === 'f' && selectedNode && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        setFocusedNode(focusedNode === selectedNode.id ? null : selectedNode.id);
      } else if (e.key === '1' && e.ctrlKey) {
        e.preventDefault();
        setViewMode('freeform');
      } else if (e.key === '2' && e.ctrlKey) {
        e.preventDefault();
        setViewMode('radial');
      } else if (e.key === '3' && e.ctrlKey) {
        e.preventDefault();
        setViewMode('outline');
      } else if (e.key === 'Escape') {
        setSelectedNode(null);
        setConnectingFrom(null);
        setMultiSelect(new Set());
        setEditingNode(null);
      } else if (e.key === 'Enter' && editingNode && !e.shiftKey) {
        e.preventDefault();
        saveInlineEdit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, focusedNode, historyIndex, history, editingNode, editingText]);

  const saveToHistory = useCallback((newNodes) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(newNodes)));
      return newHistory.slice(-50);
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

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

  const loadData = async () => {
    try {
      const url = folderId 
        ? `${API}/api/mindmap?folderId=${folderId}&showArchived=${showArchived}` 
        : `${API}/api/mindmap?showArchived=${showArchived}`;
      const res = await axios.get(url, { withCredentials: true });
      
      if (res.data && res.data.nodes) {
        setNodes(res.data.nodes);
        setEdges(res.data.edges || []);
        saveToHistory(res.data.nodes);
        
        if (res.data.nodes.length > 0) {
          const timestamps = res.data.nodes.map(n => new Date(n.createdAt).getTime());
          setDateRange([Math.min(...timestamps), Date.now()]);
        }
        
        if (messyMode && res.data.nodes.length >= 3) {
          loadSuggestions();
        }
      }
    } catch (error) {
      console.error('Failed to load mindmap data:', error);
    }
  };

  const loadRediscover = async () => {
    try {
      const res = await axios.get(`${API}/api/rediscover`, { withCredentials: true });
      setOrphans(res.data.orphans || []);
    } catch (error) {
      console.error('Failed to load orphaned notes:', error);
    }
  };

  const loadSuggestions = async () => {
    try {
      const res = await axios.get(`${API}/api/rediscover`, { withCredentials: true });
      const allSuggestions = [
        ...res.data.orphans.map(o => ({ ...o, type: 'orphan' })),
        ...res.data.weakConnections.map(w => ({ ...w, type: 'weak' }))
      ];
      setSuggestions(allSuggestions.slice(0, 3));
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    }
  };

  const autoArchive = async () => {
    try {
      const res = await axios.post(`${API}/api/auto-archive`, {}, { withCredentials: true });
      if (res.data.archivedCount > 0) {
        console.log(`Auto-archived ${res.data.archivedCount} ephemeral notes`);
        loadData();
      }
    } catch (error) {
      console.error('Auto-archive failed:', error);
    }
  };

  const runClustering = async (preview = true) => {
    try {
      const res = await axios.post(`${API}/api/cluster`, { preview }, { withCredentials: true });
      if (res.data.clusters && res.data.clusters.length > 0) {
        setClusters(res.data.clusters);
        if (preview) {
          setClusterPreview(res.data.clusters);
          setShowClusters(true);
        } else {
          setClusterPreview(null);
          setShowClusters(false);
          loadData();
        }
      } else {
        alert('Not enough notes with content to cluster. Try adding more notes with text.');
      }
    } catch (error) {
      console.error('Clustering failed:', error);
      alert('Clustering failed. Please try again.');
    }
  };

  const applyClustering = () => {
    runClustering(false);
  };

  const handleSearch = async (fuzzy = false) => {
    if (!searchQuery.trim()) {
      setNodes(prevNodes => prevNodes.map(n => ({ ...n, highlighted: false })));
      return;
    }
    
    try {
      const res = await axios.get(
        `${API}/api/search?query=${searchQuery}&fuzzy=${fuzzy}`, 
        { withCredentials: true }
      );
      
      const resultIds = res.data.map(r => r.id);
      setNodes(prevNodes => prevNodes.map(n => ({
        ...n,
        highlighted: resultIds.includes(n.id)
      })));
      
      if (res.data.length > 0 && res.data[0].x !== undefined) {
        const firstResult = res.data[0];
        centerOnNode(firstResult);
      }
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  const centerOnNode = (node) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    setPanOffset({
      x: centerX - (node.x * zoom) - 140,
      y: centerY - (node.y * zoom) - 70
    });
    
    setSelectedNode(nodes.find(n => n.id === node.id));
  };

  const createNote = async (x, y, ephemeral = true) => {
    try {
      const res = await axios.post(`${API}/api/notes`, { 
        x: (x - panOffset.x) / zoom, 
        y: (y - panOffset.y) / zoom,
        folderId: folderId || null,
        ephemeral
      }, { withCredentials: true });
      
      const newNodes = [...nodes, res.data];
      setNodes(newNodes);
      saveToHistory(newNodes);
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  const updateNodePosition = async (nodeId, x, y) => {
    try {
      await axios.put(`${API}/api/notes/${nodeId}`, { x, y }, { withCredentials: true });
      const newNodes = nodes.map(n => n.id === nodeId ? { ...n, x, y } : n);
      setNodes(newNodes);
      saveToHistory(newNodes);
    } catch (error) {
      console.error('Failed to update node position:', error);
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
      await axios.put(`${API}/api/notes/${editingNode}`, {
        plainText: editingText,
        title,
        messyMode: true
      }, { withCredentials: true });
      
      setNodes(prevNodes => prevNodes.map(n => 
        n.id === editingNode 
          ? { ...n, rawText: editingText, title } 
          : n
      ));
      
      setEditingNode(null);
    } catch (error) {
      console.error('Failed to save inline edit:', error);
    }
  };

  const deleteNode = async (nodeId) => {
    try {
      await axios.delete(`${API}/api/notes/${nodeId}`, { withCredentials: true });
      const newNodes = nodes.filter(n => n.id !== nodeId);
      setNodes(newNodes);
      setEdges(edges.filter(e => e.sourceId !== nodeId && e.targetId !== nodeId));
      saveToHistory(newNodes);
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  const toggleArchive = async (nodeId) => {
    try {
      const node = nodes.find(n => n.id === nodeId);
      await axios.put(`${API}/api/notes/${nodeId}`, { 
        archived: !node.archived 
      }, { withCredentials: true });
      const newNodes = nodes.map(n => 
        n.id === nodeId ? { ...n, archived: !n.archived } : n
      );
      setNodes(newNodes);
      saveToHistory(newNodes);
    } catch (error) {
      console.error('Failed to toggle archive:', error);
    }
  };

  const toggleSticky = async (nodeId) => {
    try {
      const node = nodes.find(n => n.id === nodeId);
      await axios.put(`${API}/api/notes/${nodeId}`, { 
        sticky: !node.sticky,
        ephemeral: node.sticky
      }, { withCredentials: true });
      const newNodes = nodes.map(n => 
        n.id === nodeId ? { ...n, sticky: !n.sticky, ephemeral: n.sticky } : n
      );
      setNodes(newNodes);
      saveToHistory(newNodes);
    } catch (error) {
      console.error('Failed to toggle sticky:', error);
    }
  };

  const createLink = async (sourceId, targetId) => {
    try {
      const res = await axios.post(`${API}/api/links`, { 
        sourceId, 
        targetId 
      }, { withCredentials: true });
      setEdges([...edges, res.data]);
      setConnectingFrom(null);
    } catch (error) {
      console.error('Failed to create link:', error);
    }
  };

  const handleCanvasClick = (e) => {
    if (e.target === canvasRef.current && !hasMoved && mouseDownPos) {
      if (connectingFrom) {
        setConnectingFrom(null);
      } else {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left - panOffset.x) / zoom;
        const y = (e.clientY - rect.top - panOffset.y) / zoom;
        createNote(x, y, messyMode);
      }
    }
    setMouseDownPos(null);
    setHasMoved(false);
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
        }
        return currentNodes;
      });
      setDraggingNode(null);
    }
    setIsPanning(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.1, Math.min(3, prev * delta)));
  };

  const getConnectedNodes = (nodeId) => {
    const connected = new Set([nodeId]);
    edges.forEach(e => {
      if (e.sourceId === nodeId) connected.add(e.targetId);
      if (e.targetId === nodeId) connected.add(e.sourceId);
    });
    return connected;
  };

  const getBezierPath = (x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const curve = Math.abs(dx) * 0.3;
    
    return `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
  };

  const applyLayout = (mode) => {
    if (mode === 'radial' && nodes.length > 0) {
      const linkCounts = nodes.map(n => ({
        id: n.id,
        count: edges.filter(e => e.sourceId === n.id || e.targetId === n.id).length
      }));
      linkCounts.sort((a, b) => b.count - a.count);
      const centerNode = nodes.find(n => n.id === linkCounts[0].id);
      
      const centerX = 500;
      const centerY = 400;
      const layers = 3;
      const radius = 250;
      
      let nodeIdx = 0;
      const newPositions = nodes.map(n => {
        if (n.id === centerNode.id) {
          return { ...n, x: centerX, y: centerY };
        }
        const layer = Math.floor(nodeIdx / (nodes.length / layers));
        const angleStep = (2 * Math.PI) / (nodes.length / layers);
        const angle = (nodeIdx % (nodes.length / layers)) * angleStep;
        const layerRadius = radius * (layer + 1);
        
        nodeIdx++;
        return {
          ...n,
          x: centerX + layerRadius * Math.cos(angle),
          y: centerY + layerRadius * Math.sin(angle)
        };
      });
      
      setNodes(newPositions);
      saveToHistory(newPositions);
    }
  };

  const getFilteredNodes = () => {
    let filtered = nodes;
    
    if (filterMode === 'active') {
      filtered = filtered.filter(n => !n.ephemeral && !n.archived);
    } else if (filterMode === 'ephemeral') {
      filtered = filtered.filter(n => n.ephemeral && !n.archived);
    } else if (filterMode === 'sticky') {
      filtered = filtered.filter(n => n.sticky);
    }
    
    if (showTimeline) {
      filtered = filtered.filter(n => {
        const nodeTime = new Date(n.createdAt).getTime();
        return nodeTime >= dateRange[0] && nodeTime <= dateRange[1];
      });
    }
    
    return filtered;
  };

  const filteredNodes = getFilteredNodes();

  const bgColor = theme === 'dark' ? 'bg-[#1e1e1e]' : 'bg-gray-50';
  const cardBg = theme === 'dark' ? 'bg-[#2d2d2d]' : 'bg-white';
  const cardBorder = theme === 'dark' ? 'border-[#3d3d3d]' : 'border-gray-200';
  const textColor = theme === 'dark' ? 'text-gray-100' : 'text-gray-900';
  const textSecondary = theme === 'dark' ? 'text-gray-400' : 'text-gray-600';
  const toolbarBg = theme === 'dark' ? 'bg-[#252525]' : 'bg-white';
  const toolbarBorder = theme === 'dark' ? 'border-[#3d3d3d]' : 'border-gray-200';
  const inputBg = theme === 'dark' ? 'bg-[#1e1e1e]' : 'bg-white';
  const inputBorder = theme === 'dark' ? 'border-[#3d3d3d]' : 'border-gray-300';

  return (
    <div className={`relative w-screen h-screen ${bgColor} overflow-hidden transition-colors duration-200`}>
      {/* Top Toolbar */}
      <div className={`absolute top-0 left-0 right-0 z-20 ${toolbarBg} border-b ${toolbarBorder} shadow-sm`}>
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/')}
              className={`p-2 hover:bg-opacity-10 ${theme === 'dark' ? 'hover:bg-white' : 'hover:bg-gray-900'} rounded-md transition-colors`}
              title="Home"
            >
              <Home size={16} className={textColor} />
            </button>
            
            <div className={`w-px h-4 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`} />
            
            <div className="relative flex items-center gap-2">
              <Search size={14} className={`absolute left-2 ${textSecondary}`} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    if (e.shiftKey) {
                      handleSearch(true);
                    } else {
                      handleSearch(false);
                    }
                  }
                }}
                placeholder="Search (Shift+Enter for fuzzy)..."
                className={`pl-8 pr-3 py-1 ${inputBg} border ${inputBorder} rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 w-56 text-sm ${textColor}`}
              />
            </div>

            <button
              onClick={() => runClustering(true)}
              className={`flex items-center gap-1 px-2 py-1 hover:bg-opacity-10 ${theme === 'dark' ? 'hover:bg-white' : 'hover:bg-gray-900'} rounded-md transition-colors text-xs ${textColor}`}
              title="Smart Tidy"
            >
              <Brain size={14} />
              Tidy
            </button>

            <button
              onClick={() => setShowTimeline(!showTimeline)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors text-xs ${
                showTimeline 
                  ? 'bg-blue-500 bg-opacity-20 text-blue-400' 
                  : `${textColor} hover:bg-opacity-10 ${theme === 'dark' ? 'hover:bg-white' : 'hover:bg-gray-900'}`
              }`}
            >
              <Calendar size={14} />
            </button>

            <button
              onClick={() => setShowOrphans(!showOrphans)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors text-xs ${
                showOrphans 
                  ? 'bg-pink-500 bg-opacity-20 text-pink-400' 
                  : `${textColor} hover:bg-opacity-10 ${theme === 'dark' ? 'hover:bg-white' : 'hover:bg-gray-900'}`
              }`}
            >
              <Sparkles size={14} />
              {orphans.length}
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => { setViewMode('freeform'); }}
              className={`p-1.5 rounded-md text-xs ${viewMode === 'freeform' ? 'bg-blue-500 text-white' : textColor + ' hover:bg-opacity-10'}`}
              title="Freeform (Ctrl+1)"
            >
              <Network size={14} />
            </button>
            <button
              onClick={() => { setViewMode('radial'); applyLayout('radial'); }}
              className={`p-1.5 rounded-md text-xs ${viewMode === 'radial' ? 'bg-blue-500 text-white' : textColor + ' hover:bg-opacity-10'}`}
              title="Radial (Ctrl+2)"
            >
              <CircleDot size={14} />
            </button>
            <button
              onClick={() => setViewMode('outline')}
              className={`p-1.5 rounded-md text-xs ${viewMode === 'outline' ? 'bg-blue-500 text-white' : textColor + ' hover:bg-opacity-10'}`}
              title="Outline (Ctrl+3)"
            >
              <LayoutList size={14} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={undo}
              disabled={historyIndex <= 0}
              className={`p-1.5 rounded-md ${historyIndex <= 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-opacity-10'} ${textColor}`}
              title="Undo (Ctrl+Z)"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              className={`p-1.5 rounded-md ${historyIndex >= history.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-opacity-10'} ${textColor}`}
              title="Redo (Ctrl+Y)"
            >
              <RotateCw size={14} />
            </button>

            <div className={`w-px h-4 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`} />

            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
              className={`px-2 py-1 ${inputBg} border ${inputBorder} rounded-md text-xs ${textColor} focus:outline-none`}
            >
              <option value="all">All Notes</option>
              <option value="active">Active</option>
              <option value="ephemeral">Brain Dump</option>
              <option value="sticky">Pinned</option>
            </select>

            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`p-1.5 rounded-md ${showGrid ? 'bg-purple-500 bg-opacity-20 text-purple-400' : textColor + ' hover:bg-opacity-10'}`}
              title="Toggle Grid"
            >
              <Grid3x3 size={14} />
            </button>

            <button
              onClick={() => setMessyMode(!messyMode)}
              className={`p-1.5 rounded-md ${messyMode ? 'bg-yellow-500 bg-opacity-20 text-yellow-400' : textColor + ' hover:bg-opacity-10'}`}
              title="Messy Mode"
            >
              <Zap size={14} />
            </button>

            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={`p-1.5 rounded-md hover:bg-opacity-10 ${textColor}`}
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>

            <div className={`w-px h-4 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`} />

            <div className="flex items-center gap-1">
              <button
                onClick={() => setZoom(prev => Math.max(0.1, prev - 0.1))}
                className={`p-1 hover:bg-opacity-10 ${textColor}`}
              >
                <Minimize2 size={12} />
              </button>
              <span className={`text-xs ${textSecondary} min-w-[40px] text-center`}>
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(prev => Math.min(3, prev + 0.1))}
                className={`p-1 hover:bg-opacity-10 ${textColor}`}
              >
                <Maximize2 size={12} />
              </button>
            </div>

            <button
              onClick={() => {
                setZoom(1);
                setPanOffset({ x: 0, y: 0 });
              }}
              className={`px-2 py-1 text-xs ${textColor} hover:bg-opacity-10 rounded-md`}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Grid Background */}
      {showGrid && (
        <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
          <defs>
            <pattern id="grid" width={50 * zoom} height={50 * zoom} patternUnits="userSpaceOnUse">
              <circle cx={0} cy={0} r={1} fill={theme === 'dark' ? '#444' : '#ddd'} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      )}

      {/* Timeline Slider */}
      {showTimeline && (
        <div className={`absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20 ${cardBg} rounded-lg shadow-xl px-5 py-3 border ${cardBorder}`}>
          <div className="flex items-center gap-3">
            <span className={`text-xs ${textSecondary}`}>
              {new Date(dateRange[0]).toLocaleDateString()}
            </span>
            <input
              type="range"
              min={Math.min(...nodes.map(n => new Date(n.createdAt).getTime()))}
              max={Date.now()}
              value={dateRange[1]}
              onChange={(e) => setDateRange([dateRange[0], parseInt(e.target.value)])}
              className="w-48"
            />
            <span className={`text-xs ${textSecondary}`}>
              {new Date(dateRange[1]).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}

      {/* Orphans/Suggestions Panel */}
      {showOrphans && orphans.length > 0 && (
        <div className={`absolute top-14 right-4 z-20 ${cardBg} rounded-lg shadow-xl p-3 border ${cardBorder} w-72 max-h-96 overflow-y-auto`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`font-semibold text-sm ${textColor}`}>Forgotten Notes</h3>
            <button onClick={() => setShowOrphans(false)} className={textSecondary}>
              <X size={16} />
            </button>
          </div>
          <div className="space-y-1.5">
            {orphans.map(o => (
              <div
                key={o.id}
                onClick={() => {
                  const node = nodes.find(n => n.id === o.id);
                  if (node) centerOnNode(node);
                }}
                className={`p-2 ${theme === 'dark' ? 'bg-pink-500 bg-opacity-10 border-pink-500 border-opacity-30' : 'bg-pink-50 border-pink-200'} rounded-md cursor-pointer hover:bg-opacity-20 transition-colors border text-xs`}
              >
                <div className={`font-medium ${textColor}`}>{o.title}</div>
                <div className={`${textSecondary} mt-0.5`}>
                  {new Date(o.updatedAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cluster Preview Panel */}
      {clusterPreview && (
        <div className={`absolute top-14 left-4 z-20 ${cardBg} rounded-lg shadow-xl p-3 border ${cardBorder} w-72`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`font-semibold text-sm ${textColor}`}>Smart Tidy Preview</h3>
            <button onClick={() => setClusterPreview(null)} className={textSecondary}>
              <X size={16} />
            </button>
          </div>
          <div className="space-y-1.5 mb-3">
            {clusterPreview.map(c => (
              <div
                key={c.id}
                className={`p-2 rounded-md border text-xs`}
                style={{ 
                  backgroundColor: theme === 'dark' ? c.color + '20' : c.color + '40',
                  borderColor: c.color 
                }}
              >
                <div className={`font-medium ${textColor}`}>{c.name}</div>
                <div className={`${textSecondary}`}>{c.notes.length} notes</div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={applyClustering}
              className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-medium"
            >
              Apply
            </button>
            <button
              onClick={() => setClusterPreview(null)}
              className="flex-1 px-3 py-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Canvas */}
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
        {/* SVG Layer for Edges - FIXED */}
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

              const strokeColor = theme === 'dark' 
                ? (edge.strength > 2 ? '#a855f7' : '#6b7280')
                : (edge.strength > 2 ? '#9333ea' : '#94a3b8');

              return (
                <path
                  key={edge.id}
                  d={getBezierPath(
                    source.x + 140,
                    source.y + 60,
                    target.x + 140,
                    target.y + 60
                  )}
                  stroke={strokeColor}
                  strokeWidth={Math.min(edge.strength * 1.5, 3)}
                  fill="none"
                  opacity={opacity}
                  strokeLinecap="round"
                />
              );
            })}

            {/* Connecting Line */}
            {connectingFrom && mouseDownPos && (
              <line
                x1={connectingFrom.x + 140}
                y1={connectingFrom.y + 60}
                x2={(mouseDownPos.x - panOffset.x) / zoom}
                y2={(mouseDownPos.y - panOffset.y) / zoom}
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="5,5"
                opacity={0.6}
              />
            )}
          </g>
        </svg>

        {/* Nodes Layer */}
        {filteredNodes.map(node => {
          const isConnected = focusedNode && getConnectedNodes(focusedNode).has(node.id);
          const opacity = focusedNode 
            ? (node.id === focusedNode || isConnected ? 1 : 0.15)
            : (node.weight || 1);

          const scale = node.sticky ? 1.1 : (node.priority > 0 ? 1 + (node.priority * 0.05) : 1);
          const isEditing = editingNode === node.id;

          return (
            <div
              key={node.id}
              className="absolute cursor-grab active:cursor-grabbing group"
              style={{
                left: node.x * zoom + panOffset.x,
                top: node.y * zoom + panOffset.y,
                opacity,
                transform: `scale(${zoom * scale})`,
                transformOrigin: '0 0',
                transition: draggingNode?.id === node.id ? 'none' : 'opacity 0.2s ease',
                zIndex: isEditing ? 100 : 1
              }}
              onMouseDown={(e) => {
                if (!isEditing) {
                  if (e.shiftKey && selectedNode) {
                    createLink(selectedNode.id, node.id);
                  } else if (e.altKey) {
                    setConnectingFrom(node);
                  } else {
                    handleMouseDown(e, node);
                  }
                }
              }}
              onDoubleClick={(e) => {
                if (!isEditing) {
                  e.stopPropagation();
                  navigate(`/note/${node.id}`);
                }
              }}
            >
              <div
                className={`relative ${cardBg} rounded-lg shadow-md hover:shadow-xl transition-all duration-200 border-2 ${
                  node.highlighted 
                    ? 'border-blue-500 ring-2 ring-blue-500 ring-opacity-30' 
                    : multiSelect.has(node.id)
                      ? 'border-green-500 ring-2 ring-green-500 ring-opacity-30'
                      : selectedNode?.id === node.id 
                        ? 'border-purple-500 ring-2 ring-purple-500 ring-opacity-30'
                        : cardBorder
                }`}
                style={{
                  width: '280px',
                  minHeight: '120px',
                  backgroundColor: theme === 'dark' ? (node.color !== '#FFFFFF' && node.color !== '#ffffff' ? node.color + '15' : undefined) : node.color
                }}
              >
                {/* Node Badges */}
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
                        className={`w-full ${theme === 'dark' ? 'bg-[#1e1e1e] text-white' : 'bg-white text-gray-900'} border border-blue-500 rounded px-2 py-1 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500`}
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
                      <h3 className={`font-semibold ${textColor} mb-1.5 text-sm line-clamp-2 leading-tight`}>
                        {node.title}
                      </h3>
                      {node.rawText && (
                        <p className={`text-xs ${textSecondary} line-clamp-2 leading-relaxed`}>
                          {node.rawText.slice(0, 100)}
                          {node.rawText.length > 100 && '...'}
                        </p>
                      )}
                      {node.type !== 'text' && (
                        <div className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} rounded-md text-xs ${textSecondary}`}>
                          {node.type}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Node Actions - only show when not editing */}
                {!isEditing && (
                  <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                      onClick={(e) => startInlineEdit(node, e)}
                      className="p-1.5 bg-blue-500 text-white rounded-md shadow-lg hover:bg-blue-600 transition-colors"
                      title="Edit inline (Enter)"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConnectingFrom(node);
                      }}
                      className="p-1.5 bg-purple-500 text-white rounded-md shadow-lg hover:bg-purple-600 transition-colors"
                      title="Connect (Alt+Click)"
                    >
                      <Link2 size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSticky(node.id);
                      }}
                      className={`p-1.5 ${node.sticky ? 'bg-yellow-500' : 'bg-gray-600'} text-white rounded-md shadow-lg hover:bg-yellow-600 transition-colors`}
                      title="Pin (S)"
                    >
                      <Star size={12} fill={node.sticky ? 'white' : 'none'} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFocusedNode(focusedNode === node.id ? null : node.id);
                      }}
                      className={`p-1.5 ${focusedNode === node.id ? 'bg-purple-500' : 'bg-gray-600'} text-white rounded-md shadow-lg hover:bg-purple-600 transition-colors`}
                      title="Focus (F)"
                    >
                      <Eye size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleArchive(node.id);
                      }}
                      className="p-1.5 bg-orange-500 text-white rounded-md shadow-lg hover:bg-orange-600 transition-colors"
                      title="Archive (A)"
                    >
                      <Archive size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('Delete this note?')) {
                          deleteNode(node.id);
                        }
                      }}
                      className="p-1.5 bg-red-500 text-white rounded-md shadow-lg hover:bg-red-600 transition-colors"
                      title="Delete (Del)"
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

      {/* Status Bar */}
      <div className={`absolute bottom-2 left-2 z-20 ${cardBg} rounded-md shadow-sm px-3 py-1.5 border ${cardBorder} flex items-center gap-3 text-xs ${textSecondary}`}>
        <span>{filteredNodes.length} notes</span>
        <span>•</span>
        <span>{edges.length} links</span>
        {multiSelect.size > 0 && (
          <>
            <span>•</span>
            <span className="text-green-500">{multiSelect.size} selected</span>
          </>
        )}
        {messyMode && (
          <>
            <span>•</span>
            <span className="text-yellow-500">Messy Mode</span>
          </>
        )}
      </div>

      {/* Focus Mode Indicator */}
      {focusedNode && (
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-20 bg-purple-500 text-white rounded-lg shadow-xl px-4 py-2 text-sm">
          <div className="flex items-center gap-2">
            <Eye size={16} />
            <span className="font-medium">Focus Mode</span>
            <button
              onClick={() => setFocusedNode(null)}
              className="ml-2 px-2 py-0.5 bg-white text-purple-600 rounded-md text-xs hover:bg-purple-50"
            >
              Exit
            </button>
          </div>
        </div>
      )}

      {/* Helper Text */}
      {nodes.length === 0 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <div className={`${cardBg} rounded-xl shadow-xl border ${cardBorder} p-8`}>
            <Plus size={48} className={`mx-auto mb-3 ${textSecondary}`} />
            <p className={`text-lg ${textColor} mb-2 font-semibold`}>Click anywhere to create a note</p>
            <p className={`text-sm ${textSecondary}`}>
              Double-click to edit • Shift+Click to link • Alt+Click to connect
            </p>
            <p className={`text-xs ${textSecondary} mt-2`}>
              Enter for inline edit • Ctrl+Z undo • Ctrl+Y redo • Ctrl+K quick capture
            </p>
          </div>
        </div>
      )}
    </div>
  );
}