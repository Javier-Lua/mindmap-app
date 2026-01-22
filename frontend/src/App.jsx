import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import MessyMap from './components/MessyMap';
import EditorPage from './components/EditorPage';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => {
    axios.get(`${API}/api/home`, { withCredentials: true }).then(() => setAuthenticated(true)).catch(() => setAuthenticated(false));
  }, []);
  if (!authenticated) return <a href={`${API}/auth/google`}>Login with Google</a>;
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/mindmap" element={<MessyMap />} />
        <Route path="/note/:id" element={<EditorPage />} />
      </Routes>
    </BrowserRouter>
  );
}