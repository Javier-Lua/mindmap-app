import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Zap, X, Mic, MicOff } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function QuickCapture({ onClose }) {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();

    // Initialize speech recognition if available
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setText(prev => prev ? `${prev} ${transcript}` : transcript);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!text.trim() || isSaving) return;

    setIsSaving(true);

    try {
      // Create new note
      const noteRes = await axios.post(`${API}/api/notes`, {}, { withCredentials: true });
      
      // Update with content
      const title = text.split('\n')[0].slice(0, 50) || 'Quick thought';
      await axios.put(`${API}/api/notes/${noteRes.data.id}`, {
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text }]
            }
          ]
        },
        plainText: text,
        title,
        messyMode: true
      }, { withCredentials: true });

      onClose();
    } catch (error) {
      console.error('Failed to save quick capture:', error);
      setIsSaving(false);
    }
  };

  const toggleVoiceRecording = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in your browser');
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center pt-32 z-50 animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden transform animate-slideDown">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white bg-opacity-20 rounded-xl">
                <Zap size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Quick Capture</h2>
                <p className="text-purple-100 text-sm">Capture your thought in seconds</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="p-6">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What's on your mind?"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-purple-500 resize-none text-lg"
            rows="6"
            disabled={isSaving}
          />

          {/* Actions */}
          <div className="flex items-center justify-between mt-4">
            <button
              type="button"
              onClick={toggleVoiceRecording}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors ${
                isRecording
                  ? 'bg-red-100 text-red-600 border-2 border-red-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
              <span className="font-medium">
                {isRecording ? 'Stop Recording' : 'Voice Input'}
              </span>
            </button>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:shadow-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!text.trim() || isSaving}
              >
                {isSaving ? 'Saving...' : 'Capture'}
              </button>
            </div>
          </div>

          {/* Hint */}
          <p className="mt-4 text-sm text-gray-500 text-center">
            Press <kbd className="px-2 py-1 bg-gray-100 rounded border border-gray-300 font-mono text-xs">Enter</kbd> while holding{' '}
            <kbd className="px-2 py-1 bg-gray-100 rounded border border-gray-300 font-mono text-xs">Ctrl</kbd> to save
          </p>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        
        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}