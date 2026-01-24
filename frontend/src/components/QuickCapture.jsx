import React, { useState, useEffect, useRef } from 'react';
import { Zap, X, Mic, MicOff, Image, Paperclip, Link as LinkIcon, Type } from 'lucide-react';
import { useNotes } from '../contexts/NotesContext';

export default function QuickCapture({ onClose }) {
  const { createNote } = useNotes();
  const [mode, setMode] = useState('text');
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const hasSubmittedRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();

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

    navigator.clipboard.read().then(items => {
      for (const item of items) {
        if (item.types.includes('image/png')) {
          item.getType('image/png').then(blob => {
            setMode('image');
            setFile(blob);
            setPreviewUrl(URL.createObjectURL(blob));
          });
        }
      }
    }).catch(() => {});

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  const handlePaste = (e) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const blob = item.getAsFile();
        setMode('image');
        setFile(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        break;
      }
    }
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    
    if (selectedFile.type.startsWith('image/')) {
      setMode('image');
      setPreviewUrl(URL.createObjectURL(selectedFile));
    } else if (selectedFile.type.startsWith('audio/')) {
      setMode('audio');
    } else {
      setMode('text');
      setText(prev => prev + `\n[Attached: ${selectedFile.name}]`);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    
    // Prevent double submission
    if (isSaving || hasSubmittedRef.current) {
      console.log('Already saving or submitted, ignoring...');
      return;
    }
    
    if (!text.trim() && !file) {
      console.log('No content to save');
      return;
    }

    hasSubmittedRef.current = true;
    setIsSaving(true);

    try {
      const title = text.split('\n')[0].slice(0, 50) || 'Quick thought';
      
      await createNote({
        title,
        rawText: text,
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: text ? [{ type: 'text', text }] : []
            }
          ]
        },
        ephemeral: true,
        x: Math.random() * 500,
        y: Math.random() * 500
      });

      // Close after successful save
      onClose();
    } catch (error) {
      console.error('Failed to save quick capture:', error);
      alert('Failed to save note. Please try again.');
      hasSubmittedRef.current = false;
      setIsSaving(false);
    }
  };

  const toggleSpeechRecognition = () => {
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

  const handleClose = () => {
    if (isSaving) return; // Prevent closing while saving
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center pt-20 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden transform animate-slideDown">
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white bg-opacity-20 rounded-lg">
                <Zap size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold">Quick Capture</h2>
                <p className="text-purple-100 text-xs">Drop anything - text, images, links, or voice</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={isSaving}
              className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors disabled:opacity-50"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setMode('text')}
              disabled={isSaving}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === 'text' ? 'bg-white text-purple-600' : 'bg-white bg-opacity-20 hover:bg-opacity-30'
              } disabled:opacity-50`}
            >
              <Type size={14} />
              Text
            </button>
            <button
              onClick={() => {
                setMode('image');
                fileInputRef.current?.click();
              }}
              disabled={isSaving}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === 'image' ? 'bg-white text-purple-600' : 'bg-white bg-opacity-20 hover:bg-opacity-30'
              } disabled:opacity-50`}
            >
              <Image size={14} />
              Image
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isSaving}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === 'link' ? 'bg-white text-purple-600' : 'bg-white bg-opacity-20 hover:bg-opacity-30'
              } disabled:opacity-50`}
            >
              <Paperclip size={14} />
              File
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          {mode === 'image' && previewUrl && (
            <div className="mb-4 relative">
              <img 
                src={previewUrl} 
                alt="Preview" 
                className="max-h-64 mx-auto rounded-lg shadow-md"
              />
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setPreviewUrl(null);
                  setMode('text');
                }}
                disabled={isSaving}
                className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={handlePaste}
            placeholder="What's on your mind? (Paste images, drop files, or start typing...)"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 resize-none text-base"
            rows={5}
            disabled={isSaving}
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="flex items-center justify-between mt-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={toggleSpeechRecognition}
                disabled={isSaving}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                  isRecording
                    ? 'bg-red-100 text-red-600 border-2 border-red-300'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                } disabled:opacity-50`}
              >
                {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                <span>{isRecording ? 'Stop Dictation' : 'Dictate'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const timestamp = new Date().toLocaleString();
                  setText(prev => prev + `\n\n---\n${timestamp}`);
                }}
                disabled={isSaving}
                className="px-3 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Add Timestamp
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:shadow-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                disabled={!text.trim() || isSaving}
              >
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </span>
                ) : (
                  'Capture'
                )}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-300 font-mono">Ctrl+V</kbd>
              <span>paste images</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-300 font-mono">Esc</kbd>
              <span>to close</span>
            </div>
          </div>
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