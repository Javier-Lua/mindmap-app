# Messy Notes - Local-First Spatial Note-Taking

A privacy-focused, offline-first note-taking app with an infinite canvas mindmap.

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Rust + Tauri
- **Storage**: Local file system (JSON + Markdown)
- **Editor**: TipTap

## Installation

### Prerequisites
- Node.js 18+
- Rust 1.70+
- npm or yarn

### Setup

1. **Install dependencies**
```bash
   cd frontend
   npm install
```

2. **Run in development**
```bash
   npm run tauri dev
```

3. **Build for production**
```bash
   npm run tauri build
```

## Data Storage

All notes are stored locally in:
- **macOS**: `~/Documents/MessyNotes/`
- **Windows**: `C:\Users\<username>\Documents\MessyNotes\`
- **Linux**: `~/Documents/MessyNotes/`

### File Structure
```
MessyNotes/
├── graph.json              # Graph metadata (positions, edges)
├── notes/
│   ├── <note-id>.md       # Note content (Markdown)
│   └── ...
├── canvas/
│   └── <note-id>.json     # Canvas data per note
└── attachments/
    └── <file-id>.<ext>    # Future: File attachments
```

## Features

- ✅ Offline-first (no internet required)
- ✅ Infinite canvas mindmap
- ✅ Rich text editor with Markdown
- ✅ Local file storage
- ✅ Privacy-focused (no cloud sync)
- 🚧 AI-powered linking (planned)
- 🚧 Canvas view (in progress)
- 🚧 File attachments (planned)

## Development

### Project Structure
```
frontend/src/
├── components/          # React components
├── contexts/           # React contexts (state management)
├── services/           # Tauri service layer
└── App.jsx            # Main app entry

src-tauri/
└── src/
    └── main.rs        # Rust backend (file I/O)
```

### Adding New Features

1. **Add a Tauri command** in `src-tauri/src/main.rs`
2. **Call it from frontend** via `FileService.js`
3. **Use in components** via React contexts

## Troubleshooting

### App won't start
- Make sure Rust is installed: `rustc --version`
- Try: `npm run tauri dev` from `frontend/` directory

### Notes not saving
- Check file permissions in `~/Documents/MessyNotes/`
- Look for errors in the terminal

### Build fails
- Clear cache: `rm -rf src-tauri/target && npm run tauri build`

## License

MIT