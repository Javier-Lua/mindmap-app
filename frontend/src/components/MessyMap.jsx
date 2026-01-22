import React, { useState, useEffect, useCallback } from 'react';
import { Tldraw } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import ReactSlider from 'react-slider';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Search, Brain, RefreshCw, Eye, ToggleLeft } from 'lucide-react';

const API = import.meta.env.VITE_API_URL;

export default function MessyMap() {
  const navigate = useNavigate();
  const [editor, setEditor] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [dateRange, setDateRange] = useState([0, Date.now()]);
  const [messyMode, setMessyMode] = useState(true);
  const [orphans, setOrphans] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlighted, setHighlighted] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      const res = await axios.get(`${API}/api/mindmap`, { withCredentials: true });
      setNodes(res.data.nodes);
      setEdges(res.data.edges);
      if (editor) {
        editor.deleteShapes(editor.getCurrentPageShapeIds());
        res.data.nodes.forEach(n => {
          editor.createShape({
            type: n.type === 'text' ? 'text' : (n.type === 'image' ? 'image' : 'geo'),
            props: { text: n.title || '', url: n.fileUrl || '', fill: n.color, size: 'm' },
            x: n.x,
            y: n.y,
            id: n.id
          });
        });
        res.data.edges.forEach(e => {
          editor.createShape({
            type: 'arrow',
            props: { start: { type: 'binding', boundShapeId: e.sourceId, normalizedAnchor: { x: 0.5, y: 0.5 } }, end: { type: 'binding', boundShapeId: e.targetId, normalizedAnchor: { x: 0.5, y: 0.5 } }, dash: 'solid', size: e.strength > 1 ? 'l' : 'm' },
            id: e.id
          });
        });
      }
      const orphanRes = await axios.get(`${API}/api/rediscover`, { withCredentials: true });
      setOrphans(orphanRes.data);
    };
    loadData();
  }, [editor]);

  const handlePaneClick = useCallback((event) => {
    if (!editor) return;
    const pos = editor.screenToPage({ x: event.clientX, y: event.clientY });
    axios.post(`${API}/api/notes`, { x: pos.x, y: pos.y }, { withCredentials: true }).then(res => {
      editor.createShape({
        type: 'text',
        props: { text: 'Untitled Thought', size: 'm' },
        x: pos.x,
        y: pos.y,
        id: res.data.id
      });
    });
  }, [editor]);

  const handleShapeClick = (shape) => {
    navigate(`/note/${shape.id}`);
  };

  const filterByDate = () => {
    if (!editor) return;
    const min = new Date(dateRange[0]);
    const max = new Date(dateRange[1]);
    const filteredIds = nodes.filter(n => new Date(n.createdAt) >= min && new Date(n.createdAt) <= max).map(n => n.id);
    editor.updateShapes(Array.from(editor.getCurrentPageShapes()).map(shape => ({
      id: shape.id,
      isHidden: !filteredIds.includes(shape.id)
    })));
  };

  const runCluster = async () => {
    await axios.post(`${API}/api/cluster`, {}, { withCredentials: true });
    const res = await axios.get(`${API}/api/mindmap`, { withCredentials: true });
    setNodes(res.data.nodes);
    setEdges(res.data.edges);
  };

  const runSearch = async () => {
    const res = await axios.get(`${API}/api/search?query=${searchQuery}`, { withCredentials: true });
    setHighlighted(res.data.map(r => r.id));
    if (editor) {
      editor.updateShapes(nodes.map(n => ({
        id: n.id,
        props: { color: highlighted.includes(n.id) ? 'red' : n.color }
      })));
    }
  };

  const focusShape = (id) => {
    if (!editor) return;
    const shape = editor.getShape(id);
    if (!shape) return;
    editor.zoomToFit([id], { duration: 300 });
    const connectedIds = edges.filter(e => e.sourceId === id || e.targetId === id).flatMap(e => [e.sourceId, e.targetId]);
    const allIds = new Set([id, ...connectedIds]);
    editor.updateShapes(nodes.map(n => ({
      id: n.id,
      props: { opacity: allIds.has(n.id) ? 1 : 0.1 }
    })));
  };

  const refreshRediscover = async () => {
    const res = await axios.get(`${API}/api/rediscover`, { withCredentials: true });
    setOrphans(res.data);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Tldraw onMount={setEditor} onPointerDown={handlePaneClick} />
      <div className="absolute top-4 left-4 z-10 bg-white p-2 rounded shadow flex gap-2 items-center">
        <button onClick={() => navigate('/')} className="font-bold">🏠 Back to Folders</button>
        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Semantic Search..." className="border p-1" />
        <button onClick={runSearch}><Search size={16} /></button>
        <button onClick={runCluster}><Brain size={16} /></button>
        <button onClick={() => setMessyMode(!messyMode)}><ToggleLeft size={16} /> Messy: {messyMode ? 'On' : 'Off'}</button>
        <button onClick={refreshRediscover}><RefreshCw size={16} /></button>
      </div>
      <div className="absolute bottom-4 left-4 z-10 w-64">
        <ReactSlider
          className="horizontal-slider"
          thumbClassName="example-thumb"
          trackClassName="example-track"
          value={dateRange}
          onChange={setDateRange}
          onAfterChange={filterByDate}
          min={0}
          max={Date.now()}
          pearling
          minDistance={86400000} // 1 day
        />
      </div>
      <div className="absolute top-4 right-4 z-10 bg-white p-2 rounded shadow">
        <h4 className="font-bold">Orphaned Notes</h4>
        {orphans.map(o => (
          <div key={o.id} className="cursor-pointer hover:bg-gray-100 p-1 flex items-center gap-1" onClick={() => focusShape(o.id)}>
            <Eye size={14} /> {o.title}
          </div>
        ))}
      </div>
    </div>
  );
}