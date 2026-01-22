import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  Home, Search, Brain, Eye, ToggleLeft, ToggleRight, 
  Layers, Calendar, RefreshCw, Maximize2, Minimize2,
  Plus, Trash2, Link as LinkIcon
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function MessyMap() {
  const navigate = useNavigate();
  const { folderId } = useParams();
  const canvasRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [messyMode, setMessyMode] = useState(true);
  const [focusedNode, setFocusedNode] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [showClusters, setShowClusters] = useState(false);
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

  useEffect(() => {
    loadData();
    loadRediscover();
  }, [folderId]);

  // Lock body scroll when on mindmap
  useEffect(() => {
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    
    // Prevent zoom on mobile
    const viewport = document.querySelector('meta[name=viewport]');
    const originalViewport = viewport?.getAttribute('content');
    if (viewport) {
      viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }

    return () => {
      // Restore on unmount
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
      if (viewport && originalViewport) {
        viewport.setAttribute('content', originalViewport);
      }
    };
  }, []);

  // Prevent browser zoom more aggressively
  useEffect(() => {
    const preventZoom = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };
    
    const preventKeyboardZoom = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };
    
    document.addEventListener('wheel', preventZoom, { passive: false, capture: true });
    document.addEventListener('keydown', preventKeyboardZoom, { passive: false, capture: true });
    
    return () => {
      document.removeEventListener('wheel', preventZoom, { capture: true });
      document.removeEventListener('keydown', preventKeyboardZoom, { capture: true });
    };
  }, []);

  const loadData = async () => {
    try {
      const url = folderId 
        ? `${API}/api/mindmap?folderId=${folderId}` 
        : `${API}/api/mindmap`;
      const res = await axios.get(url, { withCredentials: true });
      
      if (res.data && res.data.nodes) {
        setNodes(res.data.nodes);
        setEdges(res.data.edges || []);
        
        if (res.data.nodes.length > 0) {
          const timestamps = res.data.nodes.map(n => new Date(n.createdAt).getTime());
          setDateRange([Math.min(...timestamps), Date.now()]);
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

  const runClustering = async () => {
    try {
      const res = await axios.post(`${API}/api/cluster`, {}, { withCredentials: true });
      if (res.data.clusters && res.data.clusters.length > 0) {
        setClusters(res.data.clusters);
        setShowClusters(true);
      } else {
        alert('Not enough notes with content to cluster. Try adding more notes with text.');
      }
    } catch (error) {
      console.error('Clustering failed:', error);
      alert('Clustering failed. Please try again.');
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setNodes(prevNodes => prevNodes.map(n => ({ ...n, highlighted: false })));
      return;
    }
    
    try {
      const res = await axios.get(`${API}/api/search?query=${searchQuery}`, { withCredentials: true });
      const resultIds = res.data.map(r => r.id);
      setNodes(prevNodes => prevNodes.map(n => ({
        ...n,
        highlighted: resultIds.includes(n.id)
      })));
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  const createNote = async (x, y) => {
    try {
      const res = await axios.post(`${API}/api/notes`, { 
        x: (x - panOffset.x) / zoom, 
        y: (y - panOffset.y) / zoom,
        folderId: folderId || null
      }, { withCredentials: true });
      
      setNodes(prevNodes => [...prevNodes, res.data]);
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  const updateNodePosition = async (nodeId, x, y) => {
    try {
      await axios.put(`${API}/api/notes/${nodeId}`, { x, y }, { withCredentials: true });
      setNodes(prevNodes => prevNodes.map(n => n.id === nodeId ? { ...n, x, y } : n));
    } catch (error) {
      console.error('Failed to update node position:', error);
    }
  };

  const deleteNode = async (nodeId) => {
    try {
      await axios.delete(`${API}/api/notes/${nodeId}`, { withCredentials: true });
      setNodes(prevNodes => prevNodes.filter(n => n.id !== nodeId));
      setEdges(prevEdges => prevEdges.filter(e => e.sourceId !== nodeId && e.targetId !== nodeId));
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  const handleFocus = (node) => {
    setFocusedNode(node.id);
  };

  const handleCanvasClick = (e) => {
    if (e.target === canvasRef.current && !hasMoved && mouseDownPos) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - panOffset.x) / zoom;
      const y = (e.clientY - rect.top - panOffset.y) / zoom;
      createNote(x, y);
    }
    setMouseDownPos(null);
    setHasMoved(false);
  };

  const handleMouseDown = (e, node) => {
    if (e.button === 0) {
      e.stopPropagation();
      setMouseDownPos({ x: e.clientX, y: e.clientY });
      setHasMoved(false);
      
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
      setNodes(prevNodes => prevNodes.map(n => 
        n.id === draggingNode.id ? { ...n, x, y } : n
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

  const filteredNodes = nodes.filter(n => {
    if (showTimeline) {
      const nodeTime = new Date(n.createdAt).getTime();
      return nodeTime >= dateRange[0] && nodeTime <= dateRange[1];
    }
    return true;
  });

  return (
    <div className="relative w-screen h-screen bg-gradient-to-br from-gray-50 to-gray-100 overflow-hidden">
      {/* Top Toolbar */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-3">
          {/* Left Section */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              title="Home"
            >
              <Home size={18} className="text-gray-700" />
            </button>
            
            <div className="w-px h-5 bg-gray-300" />
            
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search notes..."
                  className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64 text-sm"
                />
              </div>
            </div>

            <button
              onClick={runClustering}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 rounded-md transition-colors text-sm text-gray-700"
              title="Auto-cluster notes"
            >
              <Brain size={16} />
              Cluster
            </button>

            <button
              onClick={() => setShowTimeline(!showTimeline)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm ${
                showTimeline ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Calendar size={16} />
              Timeline
            </button>

            <button
              onClick={() => setShowOrphans(!showOrphans)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm ${
                showOrphans ? 'bg-pink-50 text-pink-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Eye size={16} />
              {orphans.length} Orphans
            </button>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMessyMode(!messyMode)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-sm ${
                messyMode ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {messyMode ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              Messy Mode
            </button>

            <div className="w-px h-5 bg-gray-300" />

            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom(prev => Math.max(0.1, prev - 0.1))}
                className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
                title="Zoom Out"
              >
                <Minimize2 size={16} className="text-gray-700" />
              </button>
              <span className="text-xs font-medium text-gray-600 min-w-[45px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(prev => Math.min(3, prev + 0.1))}
                className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
                title="Zoom In"
              >
                <Maximize2 size={16} className="text-gray-700" />
              </button>
            </div>

            <button
              onClick={() => {
                setZoom(1);
                setPanOffset({ x: 0, y: 0 });
              }}
              className="px-3 py-1.5 hover:bg-gray-100 rounded-md text-xs font-medium text-gray-700"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Timeline Slider */}
      {showTimeline && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 bg-white rounded-2xl shadow-lg px-6 py-4 border border-gray-200">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-600">
              {new Date(dateRange[0]).toLocaleDateString()}
            </span>
            <input
              type="range"
              min={Math.min(...nodes.map(n => new Date(n.createdAt).getTime()))}
              max={Date.now()}
              value={dateRange[1]}
              onChange={(e) => setDateRange([dateRange[0], parseInt(e.target.value)])}
              className="w-64"
            />
            <span className="text-sm font-medium text-gray-600">
              {new Date(dateRange[1]).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}

      {/* Orphans Panel */}
      {showOrphans && orphans.length > 0 && (
        <div className="absolute top-20 right-4 z-20 bg-white rounded-2xl shadow-lg p-4 border border-gray-200 w-80">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800">Forgotten Notes</h3>
            <button
              onClick={() => setShowOrphans(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {orphans.map(o => (
              <div
                key={o.id}
                onClick={() => {
                  navigate(`/note/${o.id}`);
                }}
                className="p-3 bg-pink-50 rounded-lg cursor-pointer hover:bg-pink-100 transition-colors border border-pink-100"
              >
                <div className="font-medium text-gray-800 text-sm">{o.title}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Last updated: {new Date(o.updatedAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clusters Panel */}
      {showClusters && clusters.length > 0 && (
        <div className="absolute top-20 left-4 z-20 bg-white rounded-2xl shadow-lg p-4 border border-gray-200 w-80">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800">Auto-discovered Clusters</h3>
            <button
              onClick={() => setShowClusters(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          <div className="space-y-2">
            {clusters.map(c => (
              <div
                key={c.id}
                className="p-3 rounded-lg border"
                style={{ 
                  backgroundColor: c.color + '40', 
                  borderColor: c.color 
                }}
              >
                <div className="font-medium text-gray-800 text-sm mb-1">{c.name}</div>
                <div className="text-xs text-gray-600">
                  {c.notes.length} notes
                </div>
              </div>
            ))}
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
      >
        <svg
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            transformOrigin: '0 0'
          }}
        >
          {/* Edges */}
          {edges.map(edge => {
            const source = nodes.find(n => n.id === edge.sourceId);
            const target = nodes.find(n => n.id === edge.targetId);
            if (!source || !target) return null;

            const opacity = focusedNode 
              ? (edge.sourceId === focusedNode || edge.targetId === focusedNode ? 1 : 0.1)
              : 0.6;

            return (
              <g key={edge.id}>
                <line
                  x1={source.x + 60}
                  y1={source.y + 40}
                  x2={target.x + 60}
                  y2={target.y + 40}
                  stroke={edge.strength > 2 ? '#9333EA' : '#CBD5E1'}
                  strokeWidth={Math.min(edge.strength * 1.5, 4)}
                  opacity={opacity}
                  strokeDasharray={edge.strength > 2 ? '0' : '5,5'}
                />
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {filteredNodes.map(node => {
          const isConnected = focusedNode && getConnectedNodes(focusedNode).has(node.id);
          const opacity = focusedNode 
            ? (node.id === focusedNode || isConnected ? 1 : 0.15)
            : 1;

          return (
            <div
              key={node.id}
              className="absolute cursor-grab active:cursor-grabbing group"
              style={{
                left: node.x * zoom + panOffset.x,
                top: node.y * zoom + panOffset.y,
                opacity,
                transform: `scale(${zoom})`,
                transformOrigin: '0 0',
                transition: draggingNode?.id === node.id ? 'none' : 'opacity 0.2s ease'
              }}
              onMouseDown={(e) => handleMouseDown(e, node)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                navigate(`/note/${node.id}`);
              }}
            >
              <div
                className={`relative bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border ${
                  node.highlighted ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                } ${selectedNode?.id === node.id ? 'ring-2 ring-blue-300' : ''}`}
                style={{
                  width: '240px',
                  minHeight: '120px',
                  backgroundColor: node.color || '#ffffff'
                }}
              >
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-2 text-sm line-clamp-2 leading-snug">
                    {node.title}
                  </h3>
                  {node.rawText && (
                    <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed">
                      {node.rawText}
                    </p>
                  )}
                  {node.type !== 'text' && (
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
                      {node.type}
                    </div>
                  )}
                </div>

                {/* Node Actions */}
                <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFocus(node);
                    }}
                    className="p-1.5 bg-blue-600 text-white rounded-full shadow-md hover:bg-blue-700 transition-colors"
                    title="Focus Mode"
                  >
                    <Eye size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Delete this note?')) {
                        deleteNode(node.id);
                      }
                    }}
                    className="p-1.5 bg-red-600 text-white rounded-full shadow-md hover:bg-red-700 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Focus Mode Indicator */}
      {focusedNode && (
        <div className="absolute bottom-4 left-4 z-20 bg-blue-600 text-white rounded-2xl shadow-lg px-6 py-3">
          <div className="flex items-center gap-3">
            <Eye size={20} />
            <span className="font-medium">Focus Mode Active</span>
            <button
              onClick={() => setFocusedNode(null)}
              className="ml-4 px-3 py-1 bg-white text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50"
            >
              Exit
            </button>
          </div>
        </div>
      )}

      {/* Helper Text */}
      {nodes.length === 0 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <Plus size={48} className="mx-auto mb-3 text-gray-400" />
            <p className="text-lg text-gray-700 mb-1 font-medium">Click anywhere to create a note</p>
            <p className="text-sm text-gray-500">Double-click to open • Drag to move • Scroll to zoom</p>
          </div>
        </div>
      )}
    </div>
  );
}