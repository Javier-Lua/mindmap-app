import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  Home, Search, Brain, Eye, Moon, Sun,
  Layers, Calendar, Maximize2, Minimize2,
  Plus, Trash2, Edit3, X
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

  useEffect(() => {
    loadData();
    loadRediscover();
  }, [folderId]);

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

  // Generate smooth bezier curve path
  const getBezierPath = (x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const curve = Math.abs(dx) * 0.3;
    
    return `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
  };

  const filteredNodes = nodes.filter(n => {
    if (showTimeline) {
      const nodeTime = new Date(n.createdAt).getTime();
      return nodeTime >= dateRange[0] && nodeTime <= dateRange[1];
    }
    return true;
  });

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
        <div className="flex items-center justify-between px-5 py-3">
          {/* Left Section */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className={`p-2 hover:bg-opacity-10 ${theme === 'dark' ? 'hover:bg-white' : 'hover:bg-gray-900'} rounded-md transition-colors`}
              title="Home"
            >
              <Home size={18} className={textColor} />
            </button>
            
            <div className={`w-px h-5 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`} />
            
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={16} className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${textSecondary}`} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search notes..."
                  className={`pl-9 pr-3 py-1.5 ${inputBg} border ${inputBorder} rounded-md focus:outline-none focus:ring-1 ${theme === 'dark' ? 'focus:ring-blue-500' : 'focus:ring-blue-500'} w-64 text-sm ${textColor}`}
                />
              </div>
            </div>

            <button
              onClick={runClustering}
              className={`flex items-center gap-2 px-3 py-1.5 hover:bg-opacity-10 ${theme === 'dark' ? 'hover:bg-white' : 'hover:bg-gray-900'} rounded-md transition-colors text-sm ${textColor}`}
              title="Auto-cluster notes"
            >
              <Brain size={16} />
              Cluster
            </button>

            <button
              onClick={() => setShowTimeline(!showTimeline)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm ${
                showTimeline 
                  ? 'bg-blue-500 bg-opacity-20 text-blue-400' 
                  : `${textColor} hover:bg-opacity-10 ${theme === 'dark' ? 'hover:bg-white' : 'hover:bg-gray-900'}`
              }`}
            >
              <Calendar size={16} />
              Timeline
            </button>

            <button
              onClick={() => setShowOrphans(!showOrphans)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm ${
                showOrphans 
                  ? 'bg-pink-500 bg-opacity-20 text-pink-400' 
                  : `${textColor} hover:bg-opacity-10 ${theme === 'dark' ? 'hover:bg-white' : 'hover:bg-gray-900'}`
              }`}
            >
              <Eye size={16} />
              {orphans.length} Orphans
            </button>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={`p-2 hover:bg-opacity-10 ${theme === 'dark' ? 'hover:bg-white' : 'hover:bg-gray-900'} rounded-md transition-colors`}
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun size={18} className={textColor} /> : <Moon size={18} className={textColor} />}
            </button>

            <div className={`w-px h-5 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`} />

            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom(prev => Math.max(0.1, prev - 0.1))}
                className={`p-1.5 hover:bg-opacity-10 ${theme === 'dark' ? 'hover:bg-white' : 'hover:bg-gray-900'} rounded-md transition-colors`}
                title="Zoom Out"
              >
                <Minimize2 size={16} className={textColor} />
              </button>
              <span className={`text-xs font-medium ${textSecondary} min-w-[45px] text-center`}>
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(prev => Math.min(3, prev + 0.1))}
                className={`p-1.5 hover:bg-opacity-10 ${theme === 'dark' ? 'hover:bg-white' : 'hover:bg-gray-900'} rounded-md transition-colors`}
                title="Zoom In"
              >
                <Maximize2 size={16} className={textColor} />
              </button>
            </div>

            <button
              onClick={() => {
                setZoom(1);
                setPanOffset({ x: 0, y: 0 });
              }}
              className={`px-3 py-1.5 hover:bg-opacity-10 ${theme === 'dark' ? 'hover:bg-white' : 'hover:bg-gray-900'} rounded-md text-xs font-medium ${textColor}`}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Timeline Slider */}
      {showTimeline && (
        <div className={`absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20 ${cardBg} rounded-xl shadow-xl px-6 py-4 border ${cardBorder}`}>
          <div className="flex items-center gap-4">
            <span className={`text-sm font-medium ${textSecondary}`}>
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
            <span className={`text-sm font-medium ${textSecondary}`}>
              {new Date(dateRange[1]).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}

      {/* Orphans Panel */}
      {showOrphans && orphans.length > 0 && (
        <div className={`absolute top-20 right-4 z-20 ${cardBg} rounded-xl shadow-xl p-4 border ${cardBorder} w-80`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-semibold ${textColor}`}>Forgotten Notes</h3>
            <button
              onClick={() => setShowOrphans(false)}
              className={textSecondary + ' hover:' + textColor}
            >
              <X size={18} />
            </button>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {orphans.map(o => (
              <div
                key={o.id}
                onClick={() => navigate(`/note/${o.id}`)}
                className={`p-3 ${theme === 'dark' ? 'bg-pink-500 bg-opacity-10 border-pink-500 border-opacity-30' : 'bg-pink-50 border-pink-200'} rounded-lg cursor-pointer hover:bg-opacity-20 transition-colors border`}
              >
                <div className={`font-medium ${textColor} text-sm`}>{o.title}</div>
                <div className={`text-xs ${textSecondary} mt-1`}>
                  Last updated: {new Date(o.updatedAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clusters Panel */}
      {showClusters && clusters.length > 0 && (
        <div className={`absolute top-20 left-4 z-20 ${cardBg} rounded-xl shadow-xl p-4 border ${cardBorder} w-80`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-semibold ${textColor}`}>Discovered Clusters</h3>
            <button
              onClick={() => setShowClusters(false)}
              className={textSecondary + ' hover:' + textColor}
            >
              <X size={18} />
            </button>
          </div>
          <div className="space-y-2">
            {clusters.map(c => (
              <div
                key={c.id}
                className={`p-3 rounded-lg border`}
                style={{ 
                  backgroundColor: theme === 'dark' ? c.color + '20' : c.color + '40',
                  borderColor: c.color 
                }}
              >
                <div className={`font-medium ${textColor} text-sm mb-1`}>{c.name}</div>
                <div className={`text-xs ${textSecondary}`}>
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
          {/* Edges with Bezier Curves */}
          {edges.map(edge => {
            const source = nodes.find(n => n.id === edge.sourceId);
            const target = nodes.find(n => n.id === edge.targetId);
            if (!source || !target) return null;

            const opacity = focusedNode 
              ? (edge.sourceId === focusedNode || edge.targetId === focusedNode ? 1 : 0.15)
              : 0.4;

            const strokeColor = theme === 'dark' 
              ? (edge.strength > 2 ? '#a855f7' : '#4b5563')
              : (edge.strength > 2 ? '#9333ea' : '#94a3b8');

            return (
              <g key={edge.id}>
                <path
                  d={getBezierPath(
                    source.x + 120,
                    source.y + 60,
                    target.x + 120,
                    target.y + 60
                  )}
                  stroke={strokeColor}
                  strokeWidth={Math.min(edge.strength * 1.5, 3)}
                  fill="none"
                  opacity={opacity}
                  strokeLinecap="round"
                />
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {filteredNodes.map(node => {
          const isConnected = focusedNode && getConnectedNodes(focusedNode).has(node.id);
          const opacity = focusedNode 
            ? (node.id === focusedNode || isConnected ? 1 : 0.2)
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
                transition: draggingNode?.id === node.id ? 'none' : 'opacity 0.3s ease'
              }}
              onMouseDown={(e) => handleMouseDown(e, node)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                navigate(`/note/${node.id}`);
              }}
            >
              <div
                className={`relative ${cardBg} rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 border-2 ${
                  node.highlighted 
                    ? 'border-blue-500 ring-2 ring-blue-500 ring-opacity-30' 
                    : selectedNode?.id === node.id 
                      ? 'border-purple-500 ring-2 ring-purple-500 ring-opacity-30'
                      : cardBorder
                }`}
                style={{
                  width: '280px',
                  minHeight: '140px',
                  backgroundColor: theme === 'dark' ? (node.color !== '#FFFFFF' && node.color !== '#ffffff' ? node.color + '15' : undefined) : node.color
                }}
              >
                <div className="p-4">
                  <h3 className={`font-semibold ${textColor} mb-2 text-base line-clamp-2 leading-tight`}>
                    {node.title}
                  </h3>
                  {node.rawText && (
                    <p className={`text-sm ${textSecondary} line-clamp-3 leading-relaxed`}>
                      {node.rawText}
                    </p>
                  )}
                  {node.type !== 'text' && (
                    <div className={`mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} rounded-md text-xs ${textSecondary} font-medium`}>
                      {node.type}
                    </div>
                  )}
                </div>

                {/* Node Actions */}
                <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/note/${node.id}`);
                    }}
                    className="p-2 bg-blue-500 text-white rounded-lg shadow-lg hover:bg-blue-600 transition-colors"
                    title="Edit"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFocusedNode(focusedNode === node.id ? null : node.id);
                    }}
                    className={`p-2 ${focusedNode === node.id ? 'bg-purple-500' : 'bg-gray-600'} text-white rounded-lg shadow-lg hover:bg-purple-600 transition-colors`}
                    title="Focus Mode"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Delete this note?')) {
                        deleteNode(node.id);
                      }
                    }}
                    className="p-2 bg-red-500 text-white rounded-lg shadow-lg hover:bg-red-600 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Focus Mode Indicator */}
      {focusedNode && (
        <div className="absolute bottom-6 left-6 z-20 bg-purple-500 text-white rounded-xl shadow-xl px-5 py-3">
          <div className="flex items-center gap-3">
            <Eye size={20} />
            <span className="font-medium">Focus Mode</span>
            <button
              onClick={() => setFocusedNode(null)}
              className="ml-3 px-3 py-1 bg-white text-purple-600 rounded-lg text-sm font-medium hover:bg-purple-50"
            >
              Exit
            </button>
          </div>
        </div>
      )}

      {/* Helper Text */}
      {nodes.length === 0 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <div className={`${cardBg} rounded-xl shadow-xl border ${cardBorder} p-10`}>
            <Plus size={56} className={`mx-auto mb-4 ${textSecondary}`} />
            <p className={`text-xl ${textColor} mb-2 font-semibold`}>Click anywhere to create a note</p>
            <p className={`text-sm ${textSecondary}`}>Double-click to edit • Drag to move • Scroll to zoom</p>
          </div>
        </div>
      )}
    </div>
  );
}