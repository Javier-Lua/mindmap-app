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
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    loadData();
    loadRediscover();
  }, [folderId]);

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
      // Don't clear existing data on error
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
      // Clear highlights
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
    if (e.target === canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      createNote(x, y);
    }
  };

  const handleMouseDown = (e, node) => {
    if (e.button === 0) {
      e.stopPropagation();
      setDraggingNode(node);
      setSelectedNode(node);
    }
  };

  const handleMouseMove = (e) => {
    if (draggingNode) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - panOffset.x) / zoom;
      const y = (e.clientY - rect.top - panOffset.y) / zoom;
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
      // Get the latest position from state
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
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(Math.max(0.1, Math.min(3, zoom * delta)));
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
    <div className="relative w-screen h-screen bg-gray-50 overflow-hidden">
      {/* Top Toolbar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
        <div className="flex items-center gap-3 bg-white rounded-2xl shadow-lg px-4 py-3 border border-gray-200">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Home"
          >
            <Home size={20} />
          </button>
          
          <div className="w-px h-6 bg-gray-200" />
          
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Semantic search..."
              className="px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 w-64"
            />
            <button
              onClick={handleSearch}
              className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Search size={18} />
            </button>
          </div>

          <div className="w-px h-6 bg-gray-200" />

          <button
            onClick={runClustering}
            className="flex items-center gap-2 px-3 py-2 hover:bg-purple-50 rounded-lg transition-colors"
            title="Auto-cluster notes"
          >
            <Brain size={18} className="text-purple-600" />
            <span className="text-sm font-medium">Cluster</span>
          </button>

          <button
            onClick={() => setShowTimeline(!showTimeline)}
            className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Calendar size={18} className="text-blue-600" />
          </button>

          <button
            onClick={() => setShowOrphans(!showOrphans)}
            className="flex items-center gap-2 px-3 py-2 hover:bg-pink-50 rounded-lg transition-colors"
          >
            <Eye size={18} className="text-pink-600" />
            <span className="text-sm font-medium">{orphans.length} orphans</span>
          </button>
        </div>

        <div className="flex items-center gap-3 bg-white rounded-2xl shadow-lg px-4 py-3 border border-gray-200">
          <button
            onClick={() => setMessyMode(!messyMode)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
              messyMode ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {messyMode ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            <span className="text-sm font-medium">Messy Mode</span>
          </button>

          <div className="w-px h-6 bg-gray-200" />

          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Minimize2 size={18} />
            </button>
            <span className="text-sm font-medium min-w-[60px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(Math.min(3, zoom + 0.1))}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Maximize2 size={18} />
            </button>
          </div>

          <button
            onClick={() => {
              setZoom(1);
              setPanOffset({ x: 0, y: 0 });
            }}
            className="px-3 py-2 hover:bg-gray-100 rounded-lg text-sm font-medium"
          >
            Reset View
          </button>
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
            ? (node.id === focusedNode || isConnected ? 1 : 0.1)
            : 1;

          return (
            <div
              key={node.id}
              className="absolute cursor-move group"
              style={{
                left: node.x * zoom + panOffset.x,
                top: node.y * zoom + panOffset.y,
                opacity,
                transform: `scale(${zoom})`,
                transformOrigin: '0 0'
              }}
              onMouseDown={(e) => handleMouseDown(e, node)}
              onDoubleClick={() => navigate(`/note/${node.id}`)}
            >
              <div
                className={`relative bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-200 border-2 ${
                  node.highlighted ? 'border-purple-500 ring-4 ring-purple-200' : 'border-gray-200'
                } ${selectedNode?.id === node.id ? 'ring-4 ring-blue-300' : ''}`}
                style={{
                  width: '200px',
                  minHeight: '100px',
                  backgroundColor: node.color,
                  borderLeftWidth: '6px',
                  borderLeftColor: node.highlighted ? '#9333EA' : node.color
                }}
              >
                <div className="p-4">
                  <h3 className="font-bold text-gray-800 mb-2 text-sm line-clamp-2">
                    {node.title}
                  </h3>
                  {node.rawText && (
                    <p className="text-xs text-gray-600 line-clamp-3">
                      {node.rawText}
                    </p>
                  )}
                  {node.type !== 'text' && (
                    <div className="mt-2 text-xs text-gray-500 italic">
                      {node.type} note
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
                    className="p-1.5 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600"
                    title="Focus Mode"
                  >
                    <Eye size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNode(node.id);
                    }}
                    className="p-1.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600"
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
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
          <Plus size={64} className="mx-auto mb-4 text-gray-300" />
          <p className="text-xl text-gray-600 mb-2">Click anywhere to create your first note</p>
          <p className="text-sm text-gray-400">Double-click a note to edit it</p>
        </div>
      )}
    </div>
  );
}