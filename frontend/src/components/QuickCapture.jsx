import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Zap, X, Mic, MicOff, Image, Paperclip, Link as LinkIcon, Type } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function QuickCapture({ onClose }) {
  const [mode, setMode] = useState('text'); // text, image, audio, link
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    inputRef.current?.focus();

    // Initialize speech recognition
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

    // Check clipboard for images
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
    if (isSaving) return;

    if (mode === 'text' && !text.trim()) return;
    if (mode !== 'text' && !file && !text.trim()) return;

    setIsSaving(true);

    try {
      if (mode === 'text' || (mode === 'link' && text.trim())) {
        // Create text note
        const noteRes = await axios.post(`${API}/api/notes`, {}, { withCredentials: true });
        
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
          messyMode: true,
          ephemeral: true
        }, { withCredentials: true });
      } else if (file) {
        // Upload file
        const reader = new FileReader();
        reader.onload = async () => {
          const base64Data = reader.result.split(',')[1];
          const fileName = `${Date.now()}-${file.name}`;
          
          await axios.post(`${API}/api/upload`, {
            fileName,
            fileType: file.type,
            fileData: base64Data
          }, { withCredentials: true });
        };
        reader.readAsDataURL(file);
      }

      onClose();
    } catch (error) {
      console.error('Failed to save quick capture:', error);
      setIsSaving(false);
    }
  };

  const toggleVoiceRecording = () => {
    if (mode === 'audio') {
      toggleAudioRecording();
    } else {
      toggleSpeechRecognition();
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

  const toggleAudioRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setFile(audioBlob);
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (error) {
        console.error('Microphone access denied:', error);
        alert('Please allow microphone access to record audio');
      }
    }
  };

  const detectLinkInText = () => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return urlRegex.test(text);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center pt-20 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden transform animate-slideDown">
        {/* Header */}
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
              onClick={onClose}
              className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Mode Selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode('text')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === 'text' ? 'bg-white text-purple-600' : 'bg-white bg-opacity-20 hover:bg-opacity-30'
              }`}
            >
              <Type size={14} />
              Text
            </button>
            <button
              onClick={() => {
                setMode('image');
                fileInputRef.current?.click();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === 'image' ? 'bg-white text-purple-600' : 'bg-white bg-opacity-20 hover:bg-opacity-30'
              }`}
            >
              <Image size={14} />
              Image
            </button>
            <button
              onClick={() => setMode('audio')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === 'audio' ? 'bg-white text-purple-600' : 'bg-white bg-opacity-20 hover:bg-opacity-30'
              }`}
            >
              <Mic size={14} />
              Audio
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === 'link' ? 'bg-white text-purple-600' : 'bg-white bg-opacity-20 hover:bg-opacity-30'
              }`}
            >
              <Paperclip size={14} />
              File
            </button>
          </div>
        </div>

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="p-5">
          {/* Image Preview */}
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
                className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Audio Recording Indicator */}
          {mode === 'audio' && isRecording && (
            <div className="mb-4 p-4 bg-red-50 border-2 border-red-300 rounded-lg flex items-center gap-3">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-red-700 font-medium">Recording audio...</span>
            </div>
          )}

          {mode === 'audio' && file && !isRecording && (
            <div className="mb-4 p-4 bg-green-50 border-2 border-green-300 rounded-lg flex items-center justify-between">
              <span className="text-green-700 font-medium">Audio recorded</span>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-red-500 hover:text-red-700"
              >
                <X size={18} />
              </button>
            </div>
          )}

          {/* Text Input */}
          {(mode === 'text' || mode === 'link' || mode === 'image') && (
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (detectLinkInText()) {
                  setMode('link');
                }
              }}
              onPaste={handlePaste}
              placeholder={
                mode === 'image' 
                  ? 'Add a caption or paste an image (Ctrl+V)...' 
                  : mode === 'link'
                    ? 'Paste a link or add notes...'
                    : "What's on your mind? (Paste images, drop files, or start typing...)"
              }
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 resize-none text-base"
              rows={mode === 'image' ? 3 : 5}
              disabled={isSaving}
            />
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Link Detection */}
          {detectLinkInText() && mode !== 'link' && (
            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-sm text-blue-700">
              <LinkIcon size={14} />
              <span>Link detected - we'll extract a preview</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={toggleVoiceRecording}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                  isRecording
                    ? 'bg-red-100 text-red-600 border-2 border-red-300'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                <span>
                  {mode === 'audio' 
                    ? (isRecording ? 'Stop Recording' : 'Record') 
                    : (isRecording ? 'Stop Dictation' : 'Dictate')}
                </span>
              </button>

              {mode === 'text' && (
                <button
                  type="button"
                  onClick={() => {
                    const timestamp = new Date().toLocaleString();
                    setText(prev => prev + `\n\n---\n${timestamp}`);
                  }}
                  className="px-3 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium"
                >
                  Add Timestamp
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:shadow-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                disabled={(!text.trim() && !file) || isSaving}
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

          {/* Hints */}
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-300 font-mono">Ctrl+V</kbd>
              <span>paste images</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-300 font-mono">Ctrl+Enter</kbd>
              <span>to save</span>
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