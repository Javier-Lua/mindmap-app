import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useNotes } from '../contexts/NotesContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// --- Utility Functions ---
const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

const findNodeWithAbsolutePosition = (nodes, targetId, accumulatedX = 0, accumulatedY = 0) => {
  for (const node of nodes) {
    if (node.id === targetId) {
      return { 
        node, 
        x: accumulatedX + node.x, 
        y: accumulatedY + node.y 
      };
    }
    if (node.children && node.children.length > 0) {
      const found = findNodeWithAbsolutePosition(node.children, targetId, accumulatedX + node.x, accumulatedY + node.y);
      if (found) return found;
    }
  }
  return null;
};

const getControlPoints = (source, target, sourceSide, targetSide) => {
  const dist = Math.sqrt(Math.pow(target.x - source.x, 2) + Math.pow(target.y - source.y, 2));
  const controlOffset = Math.min(Math.max(dist * 0.4, 30), 150);

  let cp1 = { x: source.x, y: source.y };
  let cp2 = { x: target.x, y: target.y };

  switch (sourceSide) {
    case 'top': cp1.y -= controlOffset; break;
    case 'bottom': cp1.y += controlOffset; break;
    case 'left': cp1.x -= controlOffset; break;
    case 'right': cp1.x += controlOffset; break;
  }

  switch (targetSide) {
    case 'top': cp2.y -= controlOffset; break;
    case 'bottom': cp2.y += controlOffset; break;
    case 'left': cp2.x -= controlOffset; break;
    case 'right': cp2.x += controlOffset; break;
  }
  return { cp1, cp2 };
};

const getBezierPath = (source, target, sourceSide, targetSide) => {
  const { cp1, cp2 } = getControlPoints(source, target, sourceSide, targetSide);
  return `M ${source.x} ${source.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${target.x} ${target.y}`;
};

const getBezierCenter = (source, target, sourceSide, targetSide) => {
  const { cp1, cp2 } = getControlPoints(source, target, sourceSide, targetSide);
  const x = 0.125 * source.x + 0.375 * cp1.x + 0.375 * cp2.x + 0.125 * target.x;
  const y = 0.125 * source.y + 0.375 * cp1.y + 0.375 * cp2.y + 0.125 * target.y;
  return { x, y };
};

const screenToCanvas = (screenPos, viewport) => {
  return {
    x: (screenPos.x - viewport.x) / viewport.zoom,
    y: (screenPos.y - viewport.y) / viewport.zoom,
  };
};

const getNodeSideCoords = (nodeId, side, allNodes) => {
  const result = findNodeWithAbsolutePosition(allNodes, nodeId);
  if (!result) return { x: 0, y: 0 };

  const { node, x, y } = result;

  switch (side) {
    case 'top': return { x: x + node.width / 2, y: y };
    case 'right': return { x: x + node.width, y: y + node.height / 2 };
    case 'bottom': return { x: x + node.width / 2, y: y + node.height };
    case 'left': return { x: x, y: y + node.height / 2 };
  }
};

// --- Icons ---
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
);
const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
);
const AddCardIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
);
const NoteIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
);
const ImageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
);
const DefinitionIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
);
const FormulaIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h13l-4-9L9 14"/></svg>
);
const ImportantIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
);
const BackIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
);

// --- Rich Text Components ---
const RichTextToolbar = ({ onCommand }) => {
  const [showMath, setShowMath] = useState(false);
  const symbols = ['π', '∑', '√', '∞', '≠', '≈', '≤', '≥', '×', '÷', '±', 'θ', 'α', 'β', 'Ω', 'μ', '∆', '∫', '²', '³', 'ⁿ', '½'];
  
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    superscript: false,
    subscript: false,
    highlight: false,
  });

  const checkFormatState = useCallback(() => {
    try {
      const highlightValue = document.queryCommandValue('backColor');
      const isYellow = highlightValue && (
        highlightValue === '#fef08a' || 
        highlightValue.replace(/\s/g, '') === 'rgb(254,240,138)' || 
        highlightValue.replace(/\s/g, '') === 'rgba(254,240,138,1)'
      );

      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        superscript: document.queryCommandState('superscript'),
        subscript: document.queryCommandState('subscript'),
        highlight: !!isYellow,
      });
    } catch (e) {
      // Ignore errors
    }
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', checkFormatState);
    return () => document.removeEventListener('selectionchange', checkFormatState);
  }, [checkFormatState]);
  
  useEffect(() => {
    checkFormatState();
  }, [checkFormatState]);

  const toggleCommand = (cmd) => {
    onCommand(cmd);
    setTimeout(checkFormatState, 10);
  };

  const toggleHighlight = () => {
    if (activeFormats.highlight) {
      onCommand('backColor', 'transparent'); 
    } else {
      onCommand('backColor', '#fef08a');
    }
    setTimeout(checkFormatState, 10);
  };
  
  const getButtonClass = (isActive) => 
    `p-1 rounded w-6 text-center transition-colors ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-white/10 text-gray-200'}`;

  const preventFocusLoss = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div 
      className="flex gap-1 p-1 bg-gray-800 rounded mb-2 border border-gray-700 shadow-xl items-center pointer-events-auto select-none"
      onMouseDown={preventFocusLoss}
    >
      <button onClick={() => toggleCommand('bold')} className={`${getButtonClass(activeFormats.bold)} font-bold`} title="Bold">B</button>
      <button onClick={() => toggleCommand('italic')} className={`${getButtonClass(activeFormats.italic)} italic`} title="Italic">I</button>
      <button onClick={() => toggleCommand('underline')} className={`${getButtonClass(activeFormats.underline)} underline`} title="Underline">U</button>
      
      <div className="w-[1px] bg-gray-600 mx-1 h-4" />
      
      <button onClick={() => toggleCommand('superscript')} className={`${getButtonClass(activeFormats.superscript)} font-serif text-xs`} title="Superscript">x²</button>
      <button onClick={() => toggleCommand('subscript')} className={`${getButtonClass(activeFormats.subscript)} font-serif text-xs`} title="Subscript">x₂</button>
      
      <div className="relative">
        <button onClick={() => setShowMath(!showMath)} className={`p-1 hover:bg-white/10 rounded w-6 text-center font-serif text-sm ${showMath ? 'bg-white/20' : ''}`} title="Math Symbols">∑</button>
        {showMath && (
          <div className="absolute top-full left-0 mt-1 grid grid-cols-4 gap-1 bg-gray-800 border border-gray-700 p-1 rounded shadow-xl w-36 z-50">
            {symbols.map(s => (
              <button key={s} onClick={() => { onCommand('insertText', s); setShowMath(false); }} className="hover:bg-white/20 p-1 rounded text-center text-sm w-full">{s}</button>
            ))}
          </div>
        )}
      </div>

      <div className="w-[1px] bg-gray-600 mx-1 h-4" />

      <input 
        type="color" 
        className="w-5 h-5 p-0 border-0 bg-transparent cursor-pointer rounded" 
        onChange={(e) => onCommand('foreColor', e.currentTarget.value)}
        title="Text Color"
      />
      
      <button 
        onClick={toggleHighlight} 
        className={`p-1 rounded w-6 text-center text-xs flex items-center justify-center font-bold transition-colors ${activeFormats.highlight ? 'bg-yellow-200 text-black ring-1 ring-yellow-500' : 'hover:bg-white/10 text-yellow-200'}`} 
        title="Highlight"
      >
        H
      </button>

      <button 
        onClick={() => toggleCommand('removeFormat')} 
        className="p-1 hover:bg-white/10 rounded w-6 text-center text-xs text-white/50 hover:text-white" 
        title="Clear Formatting"
      >
        Tx
      </button>
       
      <div className="w-[1px] bg-gray-600 mx-1 h-4" />
       
      <select onChange={(e) => onCommand('fontSize', e.currentTarget.value)} className="bg-gray-900 text-xs border border-gray-700 rounded w-16 h-6 outline-none text-gray-300" defaultValue="3">
        <option value="1">Small</option>
        <option value="3">Normal</option>
        <option value="5">Large</option>
        <option value="7">Huge</option>
      </select>
    </div>
  );
};

const NodeContentEditor = ({ initialHtml, onChange, className, editorRef }) => {
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialHtml || '';
      editorRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, []);

  const handleInput = (e) => {
    onChange(e.currentTarget.innerHTML);
  };

  return (
    <div
      ref={editorRef}
      className={`${className} empty:before:content-[attr(data-placeholder)] empty:before:text-white/20 empty:before:italic focus:outline-none`}
      contentEditable
      data-placeholder="Double click to add content..."
      onInput={handleInput}
      onBlur={handleInput}
      onKeyDown={(e) => e.stopPropagation()} 
      onMouseDown={(e) => e.stopPropagation()}
      suppressContentEditableWarning
    />
  );
};

// --- Leiden Community Detection ---
const detectLeidenCommunities = (nodes, edges) => {
  const nodeIds = nodes.map(n => n.id);
  const adj = {};
  const nodeWeights = {};
  const edgeWeights = {};
  let totalGraphWeight = 0;

  nodeIds.forEach(id => {
    adj[id] = [];
    nodeWeights[id] = 0;
    edgeWeights[id] = {};
  });

  edges.forEach(edge => {
    if (!adj[edge.source] || !adj[edge.target]) return;
    
    const w = 1;

    if (!edgeWeights[edge.source][edge.target]) {
      adj[edge.source].push(edge.target);
      adj[edge.target].push(edge.source);
      edgeWeights[edge.source][edge.target] = 0;
      edgeWeights[edge.target][edge.source] = 0;
    }

    edgeWeights[edge.source][edge.target] += w;
    edgeWeights[edge.target][edge.source] += w;
    
    nodeWeights[edge.source] += w;
    nodeWeights[edge.target] += w;
    totalGraphWeight += w;
  });

  const gamma = 1.0; 
  
  const communities = {};
  const commWeights = {};
  
  nodeIds.forEach(id => {
    communities[id] = id;
    commWeights[id] = nodeWeights[id];
  });

  let improved = true;
  const maxIters = 20;

  for (let i = 0; i < maxIters && improved; i++) {
    improved = false;
    const shuffled = [...nodeIds].sort(() => Math.random() - 0.5);

    for (const nodeId of shuffled) {
      const currentComm = communities[nodeId];
      const k_i = nodeWeights[nodeId];
      
      const neighborCommWeights = {};
      adj[nodeId].forEach(neighbor => {
        const neighborComm = communities[neighbor];
        const w = edgeWeights[nodeId][neighbor];
        neighborCommWeights[neighborComm] = (neighborCommWeights[neighborComm] || 0) + w;
      });

      let bestComm = currentComm;
      let bestScore = -Infinity;
      
      const k_i_in_curr = neighborCommWeights[currentComm] || 0;
      const sigma_tot_curr = commWeights[currentComm] - k_i; 
      const scoreCurr = k_i_in_curr - (gamma * k_i * sigma_tot_curr) / (2 * totalGraphWeight);
      
      bestScore = scoreCurr;

      for (const [commId, k_i_in] of Object.entries(neighborCommWeights)) {
        if (commId === currentComm) continue;
        
        const sigma_tot = commWeights[commId];
        const score = k_i_in - (gamma * k_i * sigma_tot) / (2 * totalGraphWeight);
        
        if (score > bestScore + 0.000001) { 
          bestScore = score;
          bestComm = commId;
        }
      }

      if (bestComm !== currentComm) {
        communities[nodeId] = bestComm;
        commWeights[currentComm] -= k_i;
        commWeights[bestComm] += k_i;
        improved = true;
      }
    }
  }

  const finalCommunities = {};
  const commNodes = {};
  
  Object.entries(communities).forEach(([nodeId, commId]) => {
    if (!commNodes[commId]) commNodes[commId] = [];
    commNodes[commId].push(nodeId);
  });

  Object.values(commNodes).forEach(members => {
    if (members.length === 0) return;
    
    const memberSet = new Set(members);
    const visited = new Set();
    
    for (const member of members) {
      if (visited.has(member)) continue;
      
      const component = [];
      const queue = [member];
      visited.add(member);
      
      while (queue.length > 0) {
        const u = queue.shift();
        component.push(u);
        
        adj[u].forEach(v => {
          if (memberSet.has(v) && !visited.has(v)) {
            visited.add(v);
            queue.push(v);
          }
        });
      }

      let hub = component[0];
      let maxDeg = -1;
      
      component.forEach(n => {
        const w = nodeWeights[n];
        if (w > maxDeg) {
          maxDeg = w;
          hub = n;
        } else if (w === maxDeg && n < hub) {
          hub = n;
        }
      });

      component.forEach(n => finalCommunities[n] = hub);
    }
  });

  return finalCommunities;
};

// --- GRAPH VIEW COMPONENT ---
const GraphView = ({ 
  onNoteClick, 
  onSave, 
  initialViewport, 
  viewportRef,
  initialMetadata,
  initialEdges
}) => {
  const { notes, createNote, deleteNote, updateNote } = useNotes();
  
  const [graphMetadata, setGraphMetadata] = useState(initialMetadata || {});
  const [edges, setEdges] = useState(initialEdges || []);
  
  const [viewport, setViewport] = useState(
    initialViewport || { x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 }
  );
  
  const [interactionMode, setInteractionMode] = useState('IDLE');
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [connectionStartId, setConnectionStartId] = useState(null);
  const [connectionMousePos, setConnectionMousePos] = useState({ x: 0, y: 0 });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [renamingNodeId, setRenamingNodeId] = useState(null);
  
  useEffect(() => {
    if (viewportRef) {
      viewportRef.current = viewport;
    }
  }, [viewport, viewportRef]);
  
  useEffect(() => {
    if (initialMetadata) {
      setGraphMetadata(initialMetadata);
    }
  }, [initialMetadata]);
  
  useEffect(() => {
    if (initialEdges) {
      setEdges(initialEdges);
    }
  }, [initialEdges]);
  
  useEffect(() => {
    if (initialViewport) {
      setViewport(initialViewport);
    }
  }, [initialViewport]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onSave(graphMetadata, edges);
    }, 500);
    return () => clearTimeout(timer);
  }, [graphMetadata, edges, onSave]);

  // ✅ FIX: Add small random velocities if nodes are static
  const nodes = useMemo(() => {
    return notes
      .filter(note => !note.archived)
      .map(note => {
        const meta = graphMetadata[note.id] || {};
        
        // ✅ If velocities are 0 or undefined, add small random initial velocity
        const vx = (meta.vx !== undefined && meta.vx !== 0) ? meta.vx : (Math.random() - 0.5) * 2;
        const vy = (meta.vy !== undefined && meta.vy !== 0) ? meta.vy : (Math.random() - 0.5) * 2;
        
        return {
          id: note.id,
          label: note.title,
          x: meta.x ?? Math.random() * 400 - 200,
          y: meta.y ?? Math.random() * 400 - 200,
          vx,
          vy,
          radius: meta.radius ?? 8,
          lastVisited: meta.lastVisited ?? new Date(note.updatedAt).getTime()
        };
      });
  }, [notes, graphMetadata]);
  
  const dragStartPos = useRef({ x: 0, y: 0 });
  const hasDragged = useRef(false);
  const containerRef = useRef(null);
  const animationRef = useRef(0);

  const structureKey = useMemo(() => {
    return nodes.map(n => n.id).sort().join(',') + '|' + edges.map(e => e.id).sort().join(',');
  }, [nodes.length, edges]); 

  const communities = useMemo(() => {
    return detectLeidenCommunities(nodes, edges);
  }, [structureKey]); 

  const { nodeColors, glowStyles } = useMemo(() => {
    const colors = {};
    const glows = {};

    const adj = {};
    nodes.forEach(n => adj[n.id] = []);
    edges.forEach(e => {
      if(nodes.some(n => n.id === e.source) && nodes.some(n => n.id === e.target)) {
        adj[e.source].push(e.target);
        adj[e.target].push(e.source);
      }
    });

    const now = Date.now();
    const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;
    const RECENT_THRESHOLD = 1000 * 60 * 5;

    nodes.forEach(node => {
      const communityId = communities[node.id];
      const hue = hashString(communityId || node.id) % 360;

      const neighborCommunities = new Set(adj[node.id].map(nid => communities[nid]));
      const distinctExternalCommunities = new Set([...neighborCommunities].filter(c => c !== communityId));
      const isBridge = distinctExternalCommunities.size > 0 && neighborCommunities.size > 1;

      let sat = 55;
      let light = 45;
      
      const timeDiff = now - (node.lastVisited || 0);

      if (timeDiff < RECENT_THRESHOLD) {
        sat = 85;
        light = 60;
        glows[node.id] = `0 0 15px hsla(${hue}, ${sat}%, ${light}%, 0.6), 0 0 30px hsla(${hue}, ${sat}%, ${light}%, 0.2)`;
      } else if (timeDiff > ONE_WEEK) {
        sat = 15;
        light = 25;
      }

      if (isBridge && timeDiff <= ONE_WEEK) {
        sat = Math.max(0, sat - 20);
      }

      colors[node.id] = `hsl(${hue}, ${sat}%, ${light}%)`;
    });

    return { nodeColors: colors, glowStyles: glows };
  }, [nodes, edges, communities]);

  // ✅ FIX: Ensure physics simulation always runs
  useEffect(() => {
    const simulate = () => {
      setGraphMetadata(prevMeta => {
        const nextMeta = { ...prevMeta };

        const currentNodes = nodes.map(n => ({
          ...n,
          x: nextMeta[n.id]?.x ?? n.x,
          y: nextMeta[n.id]?.y ?? n.y,
          vx: nextMeta[n.id]?.vx ?? n.vx,
          vy: nextMeta[n.id]?.vy ?? n.vy,
          radius: nextMeta[n.id]?.radius ?? 8
        }));

        const nodeMap = {};
        currentNodes.forEach(n => { nodeMap[n.id] = n; });

        const k = 0.05;
        const repulsion = 10000;
        const damping = 0.9;
        const centerForce = 0.005;

        // Repulsion between nodes
        for (let i = 0; i < currentNodes.length; i++) {
          for (let j = i + 1; j < currentNodes.length; j++) {
            const dx = currentNodes[i].x - currentNodes[j].x;
            const dy = currentNodes[i].y - currentNodes[j].y;
            const distSq = dx * dx + dy * dy;
            const dist = Math.sqrt(distSq) || 0.1;
            const f = repulsion / (distSq + 100);

            const fx = (dx / dist) * f;
            const fy = (dy / dist) * f;

            if (currentNodes[i].id !== draggingNodeId) {
              currentNodes[i].vx += fx;
              currentNodes[i].vy += fy;
            }
            if (currentNodes[j].id !== draggingNodeId) {
              currentNodes[j].vx -= fx;
              currentNodes[j].vy -= fy;
            }
          }
        }

        // Spring forces along edges
        edges.forEach(edge => {
          const s = nodeMap[edge.source];
          const t = nodeMap[edge.target];
          if (s && t) {
            const dx = t.x - s.x;
            const dy = t.y - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
            const force = (dist - 150) * k;

            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (s.id !== draggingNodeId) {
              s.vx += fx;
              s.vy += fy;
            }
            if (t.id !== draggingNodeId) {
              t.vx -= fx;
              t.vy -= fy;
            }
          }
        });

        // Apply damping, center force, and update positions
        currentNodes.forEach(n => {
          if (n.id === draggingNodeId) return;

          n.vx -= n.x * centerForce;
          n.vy -= n.y * centerForce;

          n.vx *= damping;
          n.vy *= damping;

          n.x += n.vx;
          n.y += n.vy;

          nextMeta[n.id] = {
            x: n.x,
            y: n.y,
            vx: n.vx,
            vy: n.vy,
            radius: n.radius,
            lastVisited: nextMeta[n.id]?.lastVisited
          };
        });

        return nextMeta;
      });

      animationRef.current = requestAnimationFrame(simulate);
    };

    animationRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animationRef.current);
  }, [edges, draggingNodeId, nodes]);


  const getMouseCanvasPos = useCallback((e) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    return {
      x: (screenX - viewport.x) / viewport.zoom,
      y: (screenY - viewport.y) / viewport.zoom
    };
  }, [viewport]);

  const handleWheel = (e) => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const zoomDelta = -e.deltaY * zoomSensitivity;
    const newZoom = Math.min(Math.max(viewport.zoom * (1 + zoomDelta), 0.2), 3);
    setViewport(prev => ({ ...prev, zoom: newZoom }));
  };

  const handleNodeMouseDown = (e, nodeId) => {
    e.stopPropagation();
    hasDragged.current = false;

    if (e.shiftKey) {
      setInteractionMode('CONNECTING');
      setConnectionStartId(nodeId);
      const node = nodes.find(n => n.id === nodeId);
      if (node) setConnectionMousePos({ x: node.x, y: node.y });
    } else {
      setInteractionMode('DRAGGING');
      setDraggingNodeId(nodeId);
      
      if (e.metaKey || e.ctrlKey) {
        const newSet = new Set(selectedIds);
        if (newSet.has(nodeId)) newSet.delete(nodeId);
        else newSet.add(nodeId);
        setSelectedIds(newSet);
      } else {
        if (!selectedIds.has(nodeId)) {
          setSelectedIds(new Set([nodeId]));
        }
      }
    }
  };

  const handleNodeClick = (e, nodeId) => {
    e.stopPropagation();
    if (hasDragged.current) return;
    if (e.shiftKey) return;

    if (!e.metaKey && !e.ctrlKey && selectedIds.has(nodeId) && selectedIds.size > 1) {
      setSelectedIds(new Set([nodeId]));
    }
  };
  
  // ✅ FIX: Navigate immediately without updating glow
  const handleNodeDoubleClick = async (e, nodeId, label) => {
    e.stopPropagation();
    
    // Navigate immediately without updating lastVisited locally
    // The parent will handle the server update after navigation
    onNoteClick(nodeId, label);
  };
  
  const handleEdgeClick = (e, edgeId) => {
    e.stopPropagation();
    const newSet = new Set(e.shiftKey ? selectedIds : []);
    if (newSet.has(edgeId)) newSet.delete(edgeId);
    else newSet.add(edgeId);
    setSelectedIds(newSet);
  };

  const handleContainerMouseDown = (e) => {
    if (e.target === containerRef.current || e.target.classList.contains('transform-layer')) {
      setSelectedIds(new Set());
      setRenamingNodeId(null);
    }
    setInteractionMode('PANNING');
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    const screenDx = e.movementX;
    const screenDy = e.movementY;
    
    if (interactionMode === 'DRAGGING' && draggingNodeId) {
      if (Math.abs(screenDx) > 0 || Math.abs(screenDy) > 0) hasDragged.current = true;
      
      const dx = screenDx / viewport.zoom;
      const dy = screenDy / viewport.zoom;
      
      setGraphMetadata(prev => {
        const updated = { ...prev };
        if (updated[draggingNodeId]) {
          updated[draggingNodeId] = {
            ...updated[draggingNodeId],
            x: updated[draggingNodeId].x + dx,
            y: updated[draggingNodeId].y + dy,
            vx: 0,
            vy: 0
          };
        }
        return updated;
      });
    } else if (interactionMode === 'CONNECTING') {
      const canvasPos = getMouseCanvasPos(e);
      setConnectionMousePos(canvasPos);
    } else if (interactionMode === 'PANNING') {
      setViewport(prev => ({
        ...prev,
        x: prev.x + screenDx,
        y: prev.y + screenDy
      }));
    }
  };

  const handleMouseUp = (e) => {
    if (interactionMode === 'CONNECTING' && connectionStartId) {
      const canvasPos = getMouseCanvasPos(e);
      
      const targetNode = nodes.find(n => {
        if (n.id === connectionStartId) return false; 
        const dx = n.x - canvasPos.x;
        const dy = n.y - canvasPos.y;
        return Math.sqrt(dx*dx + dy*dy) < n.radius * 2; 
      });

      if (targetNode) {
        const exists = edges.some(edge => 
          (edge.source === connectionStartId && edge.target === targetNode.id) ||
          (edge.target === connectionStartId && edge.source === targetNode.id)
        );
        
        if (!exists) {
          const newEdge = {
            id: Math.random().toString(36).substr(2, 9),
            source: connectionStartId,
            target: targetNode.id
          };
          setEdges(prev => [...prev, newEdge]);
        }
      }
    }

    setInteractionMode('IDLE');
    setDraggingNodeId(null);
    setConnectionStartId(null);
  };

  const handleDoubleClick = async (e) => {
    if (e.target !== containerRef.current && !e.target.classList.contains('transform-layer')) return;

    const canvasPos = getMouseCanvasPos(e);
    
    try {
      const newNote = await createNote({
        title: 'New Note',
        rawText: '',
        content: { type: 'doc', content: [] }
      });
      
      setGraphMetadata(prev => ({
        ...prev,
        [newNote.id]: {
          x: canvasPos.x,
          y: canvasPos.y,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          radius: 8
        }
      }));
      
      setSelectedIds(new Set([newNote.id]));
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  const deleteSelection = useCallback(async () => {
    if (selectedIds.size === 0 || renamingNodeId) return;
    
    setEdges(prev => prev.filter(e => 
      !selectedIds.has(e.id) && 
      !selectedIds.has(e.source) && 
      !selectedIds.has(e.target)
    ));
    
    for (const id of selectedIds) {
      if (nodes.some(n => n.id === id)) {
        try {
          await deleteNote(id);
        } catch (error) {
          console.error('Failed to delete note:', error);
        }
      }
    }
    
    setSelectedIds(new Set());
  }, [selectedIds, renamingNodeId, deleteNote, nodes]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const activeTag = document.activeElement?.tagName;
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
          deleteSelection();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelection]);

  return (
    <div 
      className="w-full h-screen bg-[#0b0b0b] overflow-hidden relative cursor-grab active:cursor-grabbing"
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseDown={handleContainerMouseDown}
      onDoubleClick={handleDoubleClick}
      ref={containerRef}
      tabIndex={0}
    >
      <div className="absolute top-6 left-6 z-50 pointer-events-none select-none">
        <h1 className="text-white/40 text-2xl font-bold tracking-tight">Note Graph</h1>
        <p className="text-white/20 text-xs mt-1">Double click empty space to create note. Shift+Drag to link. Delete to remove.</p>
      </div>

      {selectedIds.size > 0 && (
        <div className="absolute top-6 right-6 z-50 flex gap-2 flex-wrap max-w-md justify-end">
          {selectedIds.size === 1 && (
            <button onClick={() => setRenamingNodeId(Array.from(selectedIds)[0])} className="flex items-center gap-2 bg-blue-900/50 hover:bg-blue-900 text-blue-200 px-3 py-2 rounded border border-blue-800 transition-colors">
              <EditIcon />
              <span className="text-xs font-bold">Rename</span>
            </button>
          )}
          <button onClick={deleteSelection} className="flex items-center gap-2 bg-red-900/50 hover:bg-red-900 text-red-200 px-3 py-2 rounded border border-red-800 transition-colors">
            <TrashIcon />
            <span className="text-xs font-bold">Delete</span>
          </button>
        </div>
      )}

      <div className="absolute inset-0 transform-layer"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: '0 0'
        }}
      >
        <svg className="absolute overflow-visible top-0 left-0 w-1 h-1 pointer-events-none">
          {edges.map((e) => {
            const s = nodes.find(n => n.id === e.source);
            const t = nodes.find(n => n.id === e.target);
            if (!s || !t) return null;
            const isSelected = selectedIds.has(e.id);
            return (
              <g key={e.id} className="pointer-events-auto" onClick={(ev) => handleEdgeClick(ev, e.id)}>
                <line 
                  x1={s.x} y1={s.y} 
                  x2={t.x} y2={t.y} 
                  stroke="transparent"
                  strokeWidth="10"
                  className="cursor-pointer"
                />
                <line 
                  x1={s.x} y1={s.y} 
                  x2={t.x} y2={t.y} 
                  stroke={isSelected ? "#888" : "#333"}
                  strokeWidth={isSelected ? "2" : "1"}
                />
              </g>
            );
          })}
          {interactionMode === 'CONNECTING' && connectionStartId && (
            (() => {
              const s = nodes.find(n => n.id === connectionStartId);
              if (!s) return null;
              return (
                <line 
                  x1={s.x} y1={s.y}
                  x2={connectionMousePos.x} y2={connectionMousePos.y}
                  stroke="#4488ff"
                  strokeWidth="2"
                  strokeDasharray="4"
                />
              );
            })()
          )}
        </svg>
        {nodes.map(node => {
          const isSelected = selectedIds.has(node.id);
          const color = nodeColors[node.id] || '#555';
          const glow = glowStyles[node.id] || (isSelected ? '0 0 10px rgba(255,255,255,0.3)' : 'none');
          
          return (
            <div
              key={node.id}
              className={`absolute rounded-full flex items-center justify-center cursor-pointer group transition-transform duration-200 ${isSelected ? 'z-10 ring-2 ring-white ring-offset-2 ring-offset-black' : ''}`}
              style={{
                left: node.x,
                top: node.y,
                width: node.radius * 2,
                height: node.radius * 2,
                backgroundColor: color,
                transform: 'translate(-50%, -50%)',
                boxShadow: glow,
                border: connectionStartId === node.id ? '2px solid white' : 'none'
              }}
              onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
              onClick={(e) => handleNodeClick(e, node.id)}
              onDoubleClick={(e) => handleNodeDoubleClick(e, node.id, node.label)}
            >
              {renamingNodeId === node.id ? (
                <input 
                  autoFocus
                  className="absolute top-full mt-1 text-[10px] bg-black/80 text-white px-1 rounded border border-blue-500 outline-none text-center min-w-[60px]"
                  defaultValue={node.label}
                  onBlur={async (e) => {
                    const newLabel = e.target.value.trim();
                    if (newLabel && newLabel !== node.label) {
                      try {
                        await updateNote(node.id, { title: newLabel });
                      } catch (error) {
                        console.error('Failed to rename note:', error);
                      }
                    }
                    setRenamingNodeId(null);
                  }}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      const newLabel = e.target.value.trim();
                      if (newLabel && newLabel !== node.label) {
                        try {
                          await updateNote(node.id, { title: newLabel });
                        } catch (error) {
                          console.error('Failed to rename note:', error);
                        }
                      }
                      setRenamingNodeId(null);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="absolute top-full mt-1 text-[8px] text-gray-400 whitespace-nowrap opacity-60 group-hover:opacity-100 group-hover:text-white transition-opacity bg-black/50 px-1 rounded pointer-events-none">
                  {node.label}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- CANVAS VIEW COMPONENT ---
const NODE_COLORS = [
  { id: 'default', hex: '#1e1e1e', name: 'Gray' },
  { id: 'red', hex: '#3c1f1f', name: 'Red' },
  { id: 'orange', hex: '#3c2a1f', name: 'Orange' },
  { id: 'yellow', hex: '#3c351f', name: 'Yellow' },
  { id: 'green', hex: '#223c1f', name: 'Green' },
  { id: 'cyan', hex: '#1f3a3c', name: 'Cyan' },
  { id: 'blue', hex: '#1f263c', name: 'Blue' },
  { id: 'purple', hex: '#2d1f3c', name: 'Purple' },
  { id: 'pink', hex: '#3c1f32', name: 'Pink' },
];

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const MIN_NODE_WIDTH = 100;
const MIN_NODE_HEIGHT = 60;

const CanvasView = ({ onBack, conceptName, conceptId, initialData, onSave }) => {
  const [nodes, setNodes] = useState(initialData?.nodes || []);
  const [edges, setEdges] = useState(initialData?.edges || []);

  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [selection, setSelection] = useState([]);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingEdgeId, setEditingEdgeId] = useState(null);
  const [interactionMode, setInteractionMode] = useState('IDLE');
  
  const containerRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const viewportStartRef = useRef({ x: 0, y: 0, zoom: 1 });
  const nodeStartRef = useRef(null);
  const resizeHandleRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState({
    isConnecting: false,
    fromNodeId: null,
    fromSide: null,
    mousePos: { x: 0, y: 0 }
  });
  
  const contentEditableRef = useRef(null);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const hasLoadedDataRef = useRef(false);

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [nodes, edges]);

  useEffect(() => {
    hasLoadedDataRef.current = true;
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      onSave(conceptId, { nodes, edges });
    }, 500);
    return () => clearTimeout(timer);
  }, [nodes, edges, onSave, conceptId]);

  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    return () => {
      if (hasLoadedDataRef.current) {
        console.log('🔴 Unmounting CanvasView - saving canvas');
        onSaveRef.current(conceptId, { 
          nodes: nodesRef.current, 
          edges: edgesRef.current 
        });
      } else {
        console.log('🟡 Unmounting CanvasView - skipping save (no data loaded yet)');
      }
    };
  }, [conceptId]);

  const getMouseScreenPos = useCallback((e) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }, []);

  const getCanvasPos = useCallback((e) => {
    const screenPos = getMouseScreenPos(e);
    return screenToCanvas(screenPos, viewport);
  }, [getMouseScreenPos, viewport]);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const findNode = useCallback((id, nodeList) => {
    for (const node of nodeList) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNode(id, node.children);
        if (found) return found;
      }
    }
    return undefined;
  }, []);

  const updateNodeInTree = useCallback((nodeList, id, updateFn) => {
    return nodeList.map(node => {
      if (node.id === id) {
        return updateFn(node);
      }
      if (node.children) {
        return {
          ...node,
          children: updateNodeInTree(node.children, id, updateFn)
        };
      }
      return node;
    });
  }, []);

  const handleWheel = (e) => {
    if (e.target.closest('.node-scrollable')) return; 
    
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const zoomSensitivity = 0.001;
      const zoomDelta = -e.deltaY * zoomSensitivity;
      const newZoom = Math.min(Math.max(viewport.zoom * (1 + zoomDelta), MIN_ZOOM), MAX_ZOOM);
      
      const mousePos = getMouseScreenPos(e);
      const newX = mousePos.x - (mousePos.x - viewport.x) * (newZoom / viewport.zoom);
      const newY = mousePos.y - (mousePos.y - viewport.y) * (newZoom / viewport.zoom);

      setViewport({ x: newX, y: newY, zoom: newZoom });
    } else {
      setViewport(prev => ({
        ...prev,
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }));
    }
  };

  const handleMouseDown = (e) => {
    const target = e.target;
    if (target.closest('.ui-control')) return;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
    if (target.closest('.node-interactive')) return;

    if (editingNodeId) setEditingNodeId(null);
    if (editingEdgeId && !target.closest('.edge-label-input')) setEditingEdgeId(null);

    const canvasPos = getCanvasPos(e);
    const screenPos = getMouseScreenPos(e);

    if (selection.length === 1) {
      const result = findNodeWithAbsolutePosition(nodes, selection[0]);
      if (result) {
        const { node, x, y } = result; 
        const absNode = { ...node, x, y };
        const handle = getResizeHandleUnderMouse(canvasPos, absNode);
        if (handle) {
          setInteractionMode('RESIZING');
          resizeHandleRef.current = handle;
          nodeStartRef.current = { ...node }; 
          dragStartRef.current = screenPos;
          return;
        }
      }
    }

    let clickedNodeId = null;
    const hitTestRecursive = (list, parentX = 0, parentY = 0) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const node = list[i];
        const absX = parentX + node.x;
        const absY = parentY + node.y;
        
        if (node.children) {
          if (hitTestRecursive(node.children, absX, absY)) return true;
        }

        if (
          canvasPos.x >= absX && canvasPos.x <= absX + node.width &&
          canvasPos.y >= absY && canvasPos.y <= absY + node.height
        ) {
          clickedNodeId = node.id;
          return true;
        }
      }
      return false;
    };

    hitTestRecursive(nodes);

    if (clickedNodeId) {
      setInteractionMode('DRAGGING_NODE');
      if (!e.shiftKey) {
        if (!selection.includes(clickedNodeId)) {
          setSelection([clickedNodeId]);
        }
      } else {
        setSelection(prev => prev.includes(clickedNodeId) 
          ? prev.filter(id => id !== clickedNodeId) 
          : [...prev, clickedNodeId]
        );
      }
      dragStartRef.current = screenPos;
      return;
    }

    setInteractionMode('PANNING');
    dragStartRef.current = screenPos;
    viewportStartRef.current = viewport;
    if (!e.shiftKey) setSelection([]);
  };

  const handleMouseMove = (e) => {
    const screenPos = getMouseScreenPos(e);
    const canvasPos = getCanvasPos(e);

    if (interactionMode === 'PANNING') {
      const dx = screenPos.x - dragStartRef.current.x;
      const dy = screenPos.y - dragStartRef.current.y;
      setViewport({
        ...viewportStartRef.current,
        x: viewportStartRef.current.x + dx,
        y: viewportStartRef.current.y + dy
      });
    } 
    else if (interactionMode === 'DRAGGING_NODE') {
      const dx = (screenPos.x - dragStartRef.current.x) / viewport.zoom;
      const dy = (screenPos.y - dragStartRef.current.y) / viewport.zoom;

      setNodes(prev => {
        const updateRecursive = (list, parent) => {
          return list.map(node => {
            let newNode = node;
            if (selection.includes(node.id)) {
              let nextX = node.x + dx;
              let nextY = node.y + dy;
              if (parent) {
                nextX = Math.max(0, Math.min(nextX, parent.width - node.width));
                nextY = Math.max(0, Math.min(nextY, parent.height - node.height));
              }
              newNode = { ...node, x: nextX, y: nextY };
            }
            if (newNode.children) {
              newNode = {
                ...newNode,
                children: updateRecursive(newNode.children, newNode)
              };
            }
            return newNode;
          });
        };
        return updateRecursive(prev);
      });
      dragStartRef.current = screenPos;
    }
    else if (interactionMode === 'RESIZING' && nodeStartRef.current) {
      const dx = (screenPos.x - dragStartRef.current.x) / viewport.zoom;
      const dy = (screenPos.y - dragStartRef.current.y) / viewport.zoom;
      const originalNode = nodeStartRef.current;
      const handle = resizeHandleRef.current;

      setNodes(prev => updateNodeInTree(prev, originalNode.id, (n) => {
        let newX = n.x, newY = n.y, newW = n.width, newH = n.height;
        
        if (handle?.includes('w')) {
          const potentialW = Math.max(MIN_NODE_WIDTH, n.width - dx);
          if (potentialW !== MIN_NODE_WIDTH || dx < 0) {
            newW = potentialW;
            newX = n.x + (n.width - newW);
          }
        }
        if (handle?.includes('e')) newW = Math.max(MIN_NODE_WIDTH, n.width + dx);
        if (handle?.includes('n')) {
          const potentialH = Math.max(MIN_NODE_HEIGHT, n.height - dy);
          if (potentialH !== MIN_NODE_HEIGHT || dy < 0) {
            newH = potentialH;
            newY = n.y + (n.height - newH);
          }
        }
        if (handle?.includes('s')) newH = Math.max(MIN_NODE_HEIGHT, n.height + dy);

        return { ...n, x: newX, y: newY, width: newW, height: newH };
      }));
      dragStartRef.current = screenPos;
    }
    else if (interactionMode === 'CONNECTING') {
      setConnectionStatus(prev => ({ ...prev, mousePos: canvasPos }));
    }
  };

  const handleMouseUp = () => {
    if (interactionMode === 'CONNECTING') {
      const getDropTarget = (list, parentX=0, parentY=0) => {
        for (let i = list.length - 1; i >= 0; i--) {
          const node = list[i];
          const absX = parentX + node.x;
          const absY = parentY + node.y;
          
          if (node.children && node.children.length > 0) {
            const childHit = getDropTarget(node.children, absX, absY);
            if (childHit) return childHit;
          }

          const mx = connectionStatus.mousePos.x;
          const my = connectionStatus.mousePos.y;

          if (mx >= absX && mx <= absX + node.width && my >= absY && my <= absY + node.height) {
            return node.id;
          }
        }
        return null;
      };

      const targetId = getDropTarget(nodes);

      if (targetId && connectionStatus.fromNodeId && targetId !== connectionStatus.fromNodeId) {
        const targetNodeData = findNodeWithAbsolutePosition(nodes, targetId);
        if (targetNodeData) {
          const { node: targetNode, x: absX, y: absY } = targetNodeData;
          const center = { x: absX + targetNode.width/2, y: absY + targetNode.height/2 };
          const dx = connectionStatus.mousePos.x - center.x;
          const dy = connectionStatus.mousePos.y - center.y;
          let targetSide = 'left';
          if (Math.abs(dx) > Math.abs(dy)) {
            targetSide = dx > 0 ? 'right' : 'left';
          } else {
            targetSide = dy > 0 ? 'bottom' : 'top';
          }

          const newEdge = {
            id: generateId(),
            fromNode: connectionStatus.fromNodeId,
            fromSide: connectionStatus.fromSide,
            toNode: targetId,
            toSide: targetSide
          };
          setEdges(prev => [...prev, newEdge]);
        }
      }
    }

    setInteractionMode('IDLE');
    setConnectionStatus(prev => ({ ...prev, isConnecting: false, fromNodeId: null, fromSide: null }));
    nodeStartRef.current = null;
    resizeHandleRef.current = null;
  };

  const handleDoubleClick = (e) => {
    if (e.target.closest('.node-ui-control')) return;
    
    let clickedNodeId = null;
    const canvasPos = getCanvasPos(e);
    
    const hitTestRecursive = (list, parentX = 0, parentY = 0) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const node = list[i];
        const absX = parentX + node.x;
        const absY = parentY + node.y;
        if (node.children) {
          if (hitTestRecursive(node.children, absX, absY)) return true;
        }
        if (canvasPos.x >= absX && canvasPos.x <= absX + node.width &&
            canvasPos.y >= absY && canvasPos.y <= absY + node.height) {
          clickedNodeId = node.id;
          return true;
        }
      }
      return false;
    };

    hitTestRecursive(nodes);

    if (clickedNodeId) {
      setEditingNodeId(clickedNodeId);
      return;
    }

    const newNode = {
      id: generateId(),
      type: 'group',
      x: canvasPos.x - 125,
      y: canvasPos.y - 70,
      width: 250,
      height: 140,
      label: 'New Group',
      text: '',
      color: '#1e1e1e',
      children: []
    };
    setNodes(prev => [...prev, newNode]);
    setSelection([newNode.id]);
    setEditingNodeId(newNode.id);
  };

  const handlePortMouseDown = (e, nodeId, side) => {
    e.stopPropagation();
    e.preventDefault();
    setInteractionMode('CONNECTING');
    setConnectionStatus({
      isConnecting: true,
      fromNodeId: nodeId,
      fromSide: side,
      mousePos: getCanvasPos(e)
    });
  };

  const deleteSelection = useCallback(() => {
    if (editingNodeId || editingEdgeId) return;
    setEdges(prev => prev.filter(e => 
      !selection.includes(e.id) &&
      !selection.includes(e.fromNode) && 
      !selection.includes(e.toNode)
    ));
    setNodes(prev => {
      const filterRecursive = (list) => {
        return list.filter(n => !selection.includes(n.id)).map(n => ({
          ...n,
          children: n.children ? filterRecursive(n.children) : []
        }));
      };
      return filterRecursive(prev);
    });
    setSelection([]);
  }, [selection, editingNodeId, editingEdgeId]);

  const updateNodeText = (id, text) => {
    setNodes(prev => updateNodeInTree(prev, id, n => ({ ...n, text })));
  };

  const updateNodeLabel = (id, label) => {
    setNodes(prev => updateNodeInTree(prev, id, n => ({ ...n, label })));
  };
  
  const updateNodeUrl = (id, mediaUrl) => {
    setNodes(prev => updateNodeInTree(prev, id, n => ({ ...n, mediaUrl })));
  };

  const updateNodeColor = (id, color) => {
    setNodes(prev => updateNodeInTree(prev, id, n => ({ ...n, color })));
  };
  
  const updateEdgeLabel = (id, label) => {
    setEdges(prev => prev.map(e => e.id === id ? { ...e, label } : e));
  };

  const addChildNode = (parentId, type, variant = 'default') => {
    const parent = findNode(parentId, nodes);
    if (!parent) return;

    let color = '#2d2d2d';
    if (variant === 'definition') color = '#14281f';
    if (variant === 'important') color = '#3c1f1f';
    if (variant === 'formula') color = '#1c2436';
    if (type === 'note') color = '#3c351f';

    const newNode = {
      id: generateId(),
      type: type,
      variant: variant,
      parentId,
      x: 20 + Math.random() * 40,
      y: 60 + Math.random() * 40,
      width: type === 'note' ? 180 : 200,
      height: type === 'note' ? 180 : 120,
      label: type === 'media' ? '' : (variant !== 'default' ? variant.charAt(0).toUpperCase() + variant.slice(1) : 'New Item'),
      text: type === 'media' ? '' : '',
      color: color,
      children: []
    };

    setNodes(prev => updateNodeInTree(prev, parentId, n => ({
      ...n,
      children: [...(n.children || []), newNode]
    })));
    setSelection([newNode.id]);
  };
  
  const handleEdgeClick = (e, edgeId) => {
    e.stopPropagation();
    if (e.shiftKey) {
      setSelection(prev => prev.includes(edgeId) ? prev.filter(id => id !== edgeId) : [...prev, edgeId]);
    } else {
      setSelection([edgeId]);
    }
  };
  
  const handleEdgeDoubleClick = (e, edgeId) => {
    e.stopPropagation();
    setEditingEdgeId(edgeId);
  };

  const handleRichTextCommand = (command, value) => {
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, value);
    if (contentEditableRef.current && editingNodeId) {
      updateNodeText(editingNodeId, contentEditableRef.current.innerHTML);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const target = e.target;
        if (target.tagName !== 'TEXTAREA' && target.tagName !== 'INPUT' && !target.isContentEditable) {
          deleteSelection();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelection]);

  const getResizeHandleUnderMouse = (pos, node) => {
    const threshold = 10 / viewport.zoom;
    if (Math.abs(pos.x - node.x) < threshold && Math.abs(pos.y - node.y) < threshold) return 'nw';
    if (Math.abs(pos.x - (node.x + node.width)) < threshold && Math.abs(pos.y - node.y) < threshold) return 'ne';
    if (Math.abs(pos.x - node.x) < threshold && Math.abs(pos.y - (node.y + node.height)) < threshold) return 'sw';
    if (Math.abs(pos.x - (node.x + node.width)) < threshold && Math.abs(pos.y - (node.y + node.height)) < threshold) return 'se';
    return null;
  };

  const renderNode = (node, parentX = 0, parentY = 0) => {
    const isSelected = selection.includes(node.id);
    const isEditing = editingNodeId === node.id;
    const absX = parentX + node.x;
    const absY = parentY + node.y;

    let variantClasses = "border border-white/10";
    if (node.variant === 'definition') variantClasses = "border-l-4 border-green-500 font-sans border-y-transparent border-r-transparent bg-opacity-20";
    if (node.variant === 'important') variantClasses = "border-2 border-red-500 shadow-lg shadow-red-900/20";
    if (node.variant === 'formula') variantClasses = "font-mono border border-blue-500/30";
    if (node.type === 'note') variantClasses += " font-serif text-yellow-100 bg-yellow-900/20 border-yellow-700/50";
    
    const selectionClasses = isSelected ? "ring-2 ring-offset-1 ring-offset-black ring-blue-500" : "";
    
    const isGroup = node.type === 'group';
    const nodeZIndex = isSelected ? 30 : 10;

    return (
      <div
        key={node.id}
        className={`node-ui absolute flex flex-col rounded-lg shadow-lg group transition-shadow duration-200 ${variantClasses} ${selectionClasses}`}
        style={{
          transform: `translate(${node.x}px, ${node.y}px)`,
          width: node.width,
          height: node.height,
          backgroundColor: node.color,
          zIndex: nodeZIndex, 
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditingNodeId(node.id);
          if (!selection.includes(node.id)) setSelection([node.id]);
        }}
      >
        <div className="flex-1 overflow-hidden flex flex-col p-2 relative">
          <div className="mb-2 shrink-0">
            {isEditing ? (
              <input 
                className={`bg-transparent w-full outline-none border-b border-white/10 pb-1 ${isGroup ? 'font-bold text-2xl text-white' : 'font-bold text-lg text-white'}`}
                value={node.label || ''}
                placeholder="Title"
                onChange={(e) => updateNodeLabel(node.id, e.currentTarget.value)}
                onMouseDown={e => e.stopPropagation()}
              />
            ) : (
              <div className={`${isGroup ? 'font-bold text-2xl text-white tracking-wide py-2' : 'font-bold text-lg text-white pb-1 border-b border-transparent'} truncate`}>
                {node.label || <span className="opacity-50 italic">Untitled</span>}
              </div>
            )}
          </div>

          {!isGroup && (
            <div className={`flex-1 overflow-hidden h-full ${isEditing ? 'node-interactive cursor-text' : ''}`}>
              {node.type === 'media' ? (
                <div className="w-full h-full flex flex-col">
                  {isEditing ? (
                    <div className="flex flex-col gap-2 p-2 h-full">
                      <input 
                        className="bg-black/20 border border-white/10 rounded px-2 py-1 text-xs w-full"
                        placeholder="Image URL..."
                        value={node.mediaUrl || ''}
                        onChange={(e) => updateNodeUrl(node.id, e.currentTarget.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                      <button onClick={() => setEditingNodeId(null)} className="bg-blue-600 text-xs px-2 py-1 rounded">Done</button>
                    </div>
                  ) : (
                    node.mediaUrl ? (
                      <img src={node.mediaUrl} alt="Media" className="w-full h-full object-cover rounded pointer-events-none" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-black/10 text-white/20 italic text-sm">
                        Double click to add URL
                      </div>
                    )
                  )}
                </div>
              ) : (
                isEditing ? (
                  <NodeContentEditor
                    editorRef={contentEditableRef}
                    initialHtml={node.text}
                    onChange={(html) => updateNodeText(node.id, html)}
                    className="w-full h-full bg-transparent outline-none text-[#dcddde] text-sm overflow-auto p-1 cursor-text"
                  />
                ) : (
                  <div 
                    className="w-full h-full p-1 overflow-hidden text-[#dcddde] text-sm"
                    dangerouslySetInnerHTML={{ __html: node.text || '<span class="opacity-50 italic">Double click to add content...</span>' }}
                  />
                )
              )}
            </div>
          )}
        </div>
        
        {node.children && node.children.length > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="relative w-full h-full pointer-events-auto">
              {node.children.map(child => renderNode(child, absX, absY))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderControlsOverlay = () => {
    const controls = [];
    const renderControlsForNode = (list, parentX=0, parentY=0) => {
      list.forEach(node => {
        const absX = parentX + node.x;
        const absY = parentY + node.y;
        
        if (node.children) renderControlsForNode(node.children, absX, absY);
        
        const isSelected = selection.includes(node.id);
        const isEditing = editingNodeId === node.id;

        if (!isEditing && isSelected) {
          (['top', 'right', 'bottom', 'left']).map(side => {
            controls.push(
              <div
                key={`${node.id}-${side}`}
                className={`absolute w-3 h-3 rounded-full cursor-crosshair z-50 pointer-events-auto transition-opacity bg-blue-500 border border-white shadow-sm`}
                style={{
                  top: side === 'top' ? `${absY - 6}px` : side === 'bottom' ? `${absY + node.height - 6}px` : `${absY + node.height/2 - 6}px`,
                  left: side === 'left' ? `${absX - 6}px` : side === 'right' ? `${absX + node.width - 6}px` : `${absX + node.width/2 - 6}px`,
                  opacity: isSelected ? 1 : 0.3,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.transform = 'scale(1.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = isSelected ? '1' : '0.3';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                onMouseDown={(e) => handlePortMouseDown(e, node.id, side)}
              />
            );
          });
        }

        if (isSelected && !isEditing) {
          controls.push(
            <div key={`${node.id}-toolbar`} className="absolute flex gap-1 bg-[#1e1e1e] border border-[#2e2e2e] rounded p-1 ui-control shadow-xl z-50 pointer-events-auto"
              style={{
                top: `${absY - 45}px`, 
                left: `${absX}px`
              }}
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="flex gap-1 border-r border-gray-600 pr-1 mr-1">
                <button title="Add Card" onClick={(e) => {e.stopPropagation(); addChildNode(node.id, 'card');}} className="p-1 hover:bg-white/10 rounded"><AddCardIcon /></button>
                <button title="Add Note" onClick={(e) => {e.stopPropagation(); addChildNode(node.id, 'note');}} className="p-1 hover:bg-white/10 rounded"><NoteIcon /></button>
                <button title="Add Media" onClick={(e) => {e.stopPropagation(); addChildNode(node.id, 'media');}} className="p-1 hover:bg-white/10 rounded"><ImageIcon /></button>
              </div>
              <div className="flex gap-1 border-r border-gray-600 pr-1 mr-1">
                <button title="Definition" onClick={(e) => {e.stopPropagation(); addChildNode(node.id, 'card', 'definition');}} className="p-1 hover:bg-white/10 rounded text-green-400"><DefinitionIcon /></button>
                <button title="Formula" onClick={(e) => {e.stopPropagation(); addChildNode(node.id, 'card', 'formula');}} className="p-1 hover:bg-white/10 rounded text-blue-400"><FormulaIcon /></button>
                <button title="Important" onClick={(e) => {e.stopPropagation(); addChildNode(node.id, 'card', 'important');}} className="p-1 hover:bg-white/10 rounded text-red-400"><ImportantIcon /></button>
              </div>
              {NODE_COLORS.slice(0, 5).map(c => (
                <button key={c.id} className="w-5 h-5 rounded-full border border-gray-600 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.hex }}
                  onClick={(e) => { e.stopPropagation(); updateNodeColor(node.id, c.hex); }}
                />
              ))}
              <div className="w-[1px] bg-gray-600 mx-1" />
              <button onClick={(e) => { e.stopPropagation(); deleteSelection(); }} className="text-red-400 hover:text-red-300 px-1"><TrashIcon /></button>
            </div>
          );
          
          controls.push(
            <React.Fragment key={`${node.id}-handles`}>
              <div className="absolute w-3 h-3 cursor-nw-resize bg-transparent z-40 pointer-events-auto" style={{ top: `${absY - 4}px`, left: `${absX - 4}px` }} />
              <div className="absolute w-3 h-3 cursor-ne-resize bg-transparent z-40 pointer-events-auto" style={{ top: `${absY - 4}px`, left: `${absX + node.width - 8}px` }} />
              <div className="absolute w-3 h-3 cursor-sw-resize bg-transparent z-40 pointer-events-auto" style={{ top: `${absY + node.height - 8}px`, left: `${absX - 4}px` }} />
              <div className="absolute w-3 h-3 cursor-se-resize bg-transparent z-40 pointer-events-auto" style={{ top: `${absY + node.height - 8}px`, left: `${absX + node.width - 8}px` }} />
            </React.Fragment>
          );
        }
        
        if (isEditing && node.type !== 'media' && node.type !== 'group') {
          controls.push(
            <div key={`${node.id}-rte`} className="absolute z-50 pointer-events-auto ui-control"
              style={{ top: `${absY - 45}px`, left: `${absX}px` }}>
              <RichTextToolbar onCommand={handleRichTextCommand} />
            </div>
          );
        }
      });
    };
    
    renderControlsForNode(nodes);
    return controls;
  };

  return (
    <div 
      className="w-full h-screen bg-[#111111] overflow-hidden relative select-none"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      ref={containerRef}
    >
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
          backgroundImage: 'radial-gradient(#333 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}
      />

      <div 
        className="absolute inset-0 w-full h-full transform-layer"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: '0 0'
        }}
      >
        {nodes.map(node => renderNode(node, 0, 0))}

        <svg className="absolute inset-0 overflow-visible w-1 h-1 pointer-events-none z-40">
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#555" />
            </marker>
          </defs>
          {edges.map(edge => {
            const start = getNodeSideCoords(edge.fromNode, edge.fromSide, nodes);
            const end = getNodeSideCoords(edge.toNode, edge.toSide, nodes);
            
            if (start.x === 0 && start.y === 0) return null;
            if (end.x === 0 && end.y === 0) return null;

            const path = getBezierPath(start, end, edge.fromSide, edge.toSide);
            const center = getBezierCenter(start, end, edge.fromSide, edge.toSide);
            const isSelected = selection.includes(edge.id);
            const isEditingEdge = editingEdgeId === edge.id;

            return (
              <g key={edge.id} 
                onClick={(e) => handleEdgeClick(e, edge.id)} 
                onDoubleClick={(e) => handleEdgeDoubleClick(e, edge.id)}
                className="pointer-events-auto cursor-pointer group"
              >
                <path d={path} stroke="transparent" strokeWidth="15" fill="none" />
                <path d={path} stroke={isSelected ? "#4488ff" : "#2e2e2e"} strokeWidth="4" fill="none" />
                <path d={path} stroke={isSelected ? "#4488ff" : "#555"} strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />
                
                {(edge.label || isEditingEdge) && (
                  <foreignObject x={center.x - 60} y={center.y - 15} width="120" height="30" className="overflow-visible pointer-events-none">
                    <div className="flex justify-center items-center w-full h-full">
                      {isEditingEdge ? (
                        <input 
                          className="edge-label-input pointer-events-auto bg-gray-800 text-white text-xs border border-blue-500 rounded px-2 py-1 outline-none shadow-lg min-w-[50px] text-center"
                          autoFocus
                          value={edge.label || ''}
                          onChange={(e) => updateEdgeLabel(edge.id, e.currentTarget.value)}
                          onKeyDown={(e) => e.key === 'Enter' && setEditingEdgeId(null)}
                          onBlur={() => setEditingEdgeId(null)}
                        />
                      ) : (
                        <span className="bg-[#111111] text-[#dcddde] text-xs border border-[#2e2e2e] px-2 py-0.5 rounded-full shadow-sm max-w-[120px] truncate pointer-events-auto">
                          {edge.label}
                        </span>
                      )}
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}
          
          {connectionStatus.isConnecting && connectionStatus.fromNodeId && (
            <path 
              d={getBezierPath(
                getNodeSideCoords(connectionStatus.fromNodeId, connectionStatus.fromSide, nodes),
                connectionStatus.mousePos,
                connectionStatus.fromSide,
                'left' 
              )}
              stroke="#4488ff" 
              strokeWidth="2" 
              strokeDasharray="5,5"
              fill="none" 
            />
          )}
        </svg>
        
        {renderControlsOverlay()}

      </div>

      <div className="absolute top-6 left-6 pointer-events-auto z-50 flex flex-col gap-2">
        <button onClick={onBack} className="flex items-center gap-2 text-white/50 hover:text-white transition-colors bg-black/50 p-2 rounded-md border border-white/10 hover:border-white/30">
          <BackIcon />
          <span className="text-sm font-semibold">Back to Graph</span>
        </button>
        <div>
          <h1 className="text-white/40 text-4xl font-bold tracking-tighter">{conceptName || 'Concept Map'}</h1>
          <p className="text-white/10 text-sm mt-1">Double click to add concept cards.</p>
        </div>
      </div>

      <div className="absolute bottom-6 right-6 flex gap-2 ui-control pointer-events-auto z-50">
        <div className="bg-[#1e1e1e] border border-[#2e2e2e] rounded-md px-3 py-2 text-xs text-[#999999] shadow-lg">
          Concept Mindmap
        </div>
        <div className="bg-[#1e1e1e] border border-[#2e2e2e] rounded-md px-3 py-2 text-xs text-[#999999] shadow-lg flex gap-2">
          <button onClick={() => setViewport(v => ({...v, zoom: v.zoom - 0.1}))}>-</button>
          <span>{Math.round(viewport.zoom * 100)}%</span>
          <button onClick={() => setViewport(v => ({...v, zoom: v.zoom + 0.1}))}>+</button>
        </div>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---
export default function MessyMap() {
  const navigate = useNavigate();
  const { folderId } = useParams();
  const { notes, createNote, deleteNote } = useNotes();

  const [currentView, setCurrentView] = useState('GRAPH');
  const [activeNote, setActiveNote] = useState(null);

  const [graphMetadata, setGraphMetadata] = useState({});
  const [graphEdges, setGraphEdges] = useState([]);
  const [graphLoaded, setGraphLoaded] = useState(false);

  const [noteDataMap, setNoteDataMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [savedViewport, setSavedViewport] = useState(null);

  const viewportRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 });

  useEffect(() => {
    const loadGraphData = async () => {
      try {
        const res = await axios.get(`${API}/api/graph`, { withCredentials: true });
        
        const metadata = {};
        (res.data.nodes || []).forEach(node => {
          metadata[node.id] = {
            x: node.x,
            y: node.y,
            vx: node.vx || 0,
            vy: node.vy || 0,
            radius: node.radius || 8,
            lastVisited: node.lastVisited || new Date(node.updatedAt).getTime()
          };
        });
        
        setGraphMetadata(metadata);
        setGraphEdges(res.data.edges || []);
        setGraphLoaded(true);
      } catch (error) {
        console.error('Failed to load graph:', error);
        setGraphLoaded(true);
      }
    };

    loadGraphData();
  }, []);

  useEffect(() => {
    if (!graphLoaded) return;

    const timer = setTimeout(async () => {
      try {
        const nodes = notes
          .filter(n => !n.archived)
          .map(note => ({
            id: note.id,
            label: note.title,
            ...(graphMetadata[note.id] || {})
          }));
          
        await axios.post(`${API}/api/graph`, 
          { nodes, edges: graphEdges }, 
          { withCredentials: true }
        );
      } catch (error) {
        console.error('Failed to save graph:', error);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [graphMetadata, graphEdges, notes, graphLoaded]);

  const handleNoteClick = async (id, name) => {
    // ✅ FIX: Save viewport and navigate immediately
    setSavedViewport({ ...viewportRef.current });
    
    // Update lastVisited on server only (not locally to avoid glow delay)
    const now = Date.now();
    try {
      await axios.put(`${API}/api/graph/nodes/${id}`, 
        { lastVisited: now }, 
        { withCredentials: true }
      );
    } catch (error) {
      console.error('Failed to update node visit time:', error);
    }
    
    // Load canvas data
    try {
      const res = await axios.get(`${API}/api/canvas/note/${id}`, { 
        withCredentials: true 
      });
      
      setNoteDataMap(prev => ({
        ...prev,
        [id]: {
          nodes: res.data.nodes || [],
          edges: res.data.edges || []
        }
      }));
      
      setActiveNote({ id, name });
      setCurrentView('CANVAS');
    } catch (error) {
      console.error('Failed to load canvas:', error);
      setActiveNote({ id, name });
      setCurrentView('CANVAS');
    }
  };

  const handleBackToGraph = () => {
    setCurrentView('GRAPH');
    setActiveNote(null);
  };
  
  const handleGraphSave = useCallback(async (metadata, edges) => {
    setGraphMetadata(metadata);
    setGraphEdges(edges);
  }, []);

  const handleCanvasSave = async (id, data) => {
    setNoteDataMap(prev => ({
      ...prev,
      [id]: data
    }));
    
    try {
      await axios.post(`${API}/api/canvas/note/${id}`, 
        data, 
        { withCredentials: true }
      );
    } catch (error) {
      console.error('Failed to save canvas:', error);
    }
  };

  if (!graphLoaded && currentView === 'GRAPH') {
    return (
      <div className="w-full h-screen bg-[#0b0b0b] flex items-center justify-center">
        <div className="text-white/40">Loading...</div>
      </div>
    );
  }

  return (
    <>
      {currentView === 'GRAPH' ? (
        <GraphView 
          onNoteClick={handleNoteClick}
          onSave={handleGraphSave}
          initialViewport={savedViewport}
          viewportRef={viewportRef}
          initialMetadata={graphMetadata}
          initialEdges={graphEdges}
        />
      ) : (
        <CanvasView 
          onBack={handleBackToGraph} 
          conceptName={activeNote?.name || ''} 
          conceptId={activeNote?.id || ''}
          initialData={activeNote ? noteDataMap[activeNote.id] : undefined}
          onSave={handleCanvasSave}
        />
      )}
    </>
  );
}