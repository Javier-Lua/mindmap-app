# Messy Notes

A mindmap-first note-taking application designed for messy thinkers. Connect your thoughts visually, capture ideas instantly, and discover surprising connections.

## ✨ Features Implemented

### Core Experience
1. **Mindmap-First Home Screen** - Opens to a visual graph of all notes with starter nodes for new users
2. **Zero-Friction Note Creation** - Click anywhere on the mindmap to create notes instantly
3. **Google Docs-Style Editor** - Familiar TipTap editor with auto-save and auto-title
4. **Intelligent Auto-Linking** - Detects matching text and suggests connections with explanations
5. **Live Mindmap Updates** - Real-time link visualization as you write

### Navigation & Discovery
6. **Focus Mode** - Click any note to fade others and show only direct connections
7. **Timeline Slider** - Filter mindmap by date range to see when notes were created
8. **Smart Clustering** - Auto-groups related notes by topic with visual regions
9. **Connection Strength Visualization** - Thicker/brighter lines for frequently-referenced links
10. **Semantic Search** - AI-powered search that understands context, not just keywords

### Capture & Input
11. **Quick Capture** - Press Ctrl+K anywhere for instant brain dump mode
12. **Multi-Modal Input** - Support for text, voice notes, images, and PDFs
13. **Basic Annotation** - Highlight text, add comments, and view them in sidebar

### Retention & Engagement
14. **Rediscovery Engine** - Shows orphaned notes and weak connections
15. **Messy Mode Toggle** - Switch between aggressive auto-linking and manual control

### Additional Features (From Feedback)
- **Rich Text Toolbar** - Font, size, color, highlighter controls
- **A4 Width Toggle** - Switch between full-width and A4 page layout
- **Highlight + Linker** - Select text and run semantic analysis for suggestions
- **Left Sidebar Annotations** - Annotations display in dedicated sidebar
- **PDF Support** - Import and view PDFs with annotation capabilities
- **Folder Organization** - Create folders (GEC, ENC, etc.) from homepage
- **Separate Mindmap Page** - Dedicated mindmap view that works across all folders
- **Dark Mode** - Customizable themes for better accessibility
- **Floating Text** - Add non-linear text boxes anywhere on the page

## 🚀 Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL 14+ with pgvector extension
- Google Cloud OAuth credentials
- (Optional) Cloudflare R2 for file storage
- (Optional) Gmail account for email notifications

### Backend Setup

1. **Install Dependencies**
```bash
cd backend
npm install
```

2. **Configure PostgreSQL with pgvector**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

3. **Set up Environment Variables**
Create `backend/.env`:
```env
PORT=3001
NODE_ENV=development
BACKEND_URL=http://localhost:3001
FRONTEND_URL=http://localhost:5173

# PostgreSQL with pgvector
DATABASE_URL=postgresql://user:password@host:5432/database

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your_secret_here

# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# Optional: Cloudflare R2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket

# Optional: Nodemailer
NODEMAILER_USER=your_email@gmail.com
NODEMAILER_PASS=your_app_password
```

4. **Set up Google OAuth**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable Google+ API
   - Create OAuth 2.0 credentials
   - Add authorized redirect URIs:
     - `http://localhost:3001/auth/google/callback`
   - Add authorized JavaScript origins:
     - `http://localhost:3001`
     - `http://localhost:5173`

5. **Run Prisma Migrations**
```bash
npx prisma generate
npx prisma db push
```

6. **Start Backend**
```bash
npm start
```

### Frontend Setup

1. **Install Dependencies**
```bash
cd frontend
npm install
npm install regenerator-runtime
```

2. **Set up Environment Variables**
Create `frontend/.env`:
```env
VITE_API_URL=http://localhost:3001
VITE_GOOGLE_CLIENT_ID=your_client_id
```

3. **Start Frontend**
```bash
npm run dev
```

4. **Access Application**
Open browser to `http://localhost:5173`

## 📖 User Guide

### Getting Started

1. **Login** - Sign in with your Google account
2. **Create Folders** - Organize notes into folders (e.g., GEC, ENC, Personal)
3. **Open Mindmap** - Click "Open Mindmap" to see your thought space
4. **Create Notes** - Click anywhere on the mindmap to create a new note
5. **Edit Notes** - Double-click any note to open the editor

### Key Features

#### Quick Capture (Ctrl+K)
- Press `Ctrl+K` anywhere in the app
- Type or use voice input
- Press Enter to save instantly
- Note appears on your mindmap automatically

#### Intelligent Linking
1. Write naturally in the editor
2. Highlight text you want to link
3. Click "Link" in the bubble menu
4. See AI-suggested related notes
5. Click to create connection

#### Focus Mode
- Click the eye icon on any note
- See only that note and its direct connections
- Everything else fades to 10% opacity
- Click "Exit" to return to full view

#### Timeline Slider
- Click the calendar icon in toolbar
- Drag slider to filter notes by date
- See when your ideas evolved over time

#### Smart Clustering
- Click "Cluster" in toolbar
- AI groups related notes automatically
- Color-coded regions show topics
- Accept, rename, or dismiss clusters

#### Annotations
1. Highlight text in editor
2. Click "Note" in bubble menu
3. Add comment in left sidebar
4. Annotations saved automatically

#### Floating Text
- Click the + button in editor toolbar
- Add non-linear thoughts anywhere
- Perfect for marginal notes and asides
- Drag to reposition

### Keyboard Shortcuts

- `Ctrl+K` - Quick Capture
- `Ctrl+B` - Bold text
- `Ctrl+I` - Italic text
- `Escape` - Close dialogs

## 🏗️ Architecture

### Backend Stack
- **Express.js** - REST API server
- **Prisma** - ORM with PostgreSQL
- **pgvector** - Vector similarity search
- **@xenova/transformers** - On-device AI embeddings
- **ml-kmeans** - Clustering algorithm
- **Passport.js** - Google OAuth authentication

### Frontend Stack
- **React 18** - UI framework
- **TipTap** - Rich text editor
- **React Router** - Navigation
- **Axios** - HTTP client
- **Lucide React** - Icons
- **Tailwind CSS** - Styling

### Key Technical Features

1. **Vector Embeddings** - All notes are embedded using MiniLM-L6-v2 for semantic search
2. **Auto-Linking** - Text matching and semantic similarity for connection suggestions
3. **Real-time Updates** - Changes sync immediately across mindmap and editor
4. **Connection Strength** - Links strengthen with repeated references
5. **Clustering** - K-means algorithm groups similar notes

## 🎨 Customization

### Themes
- Light mode (default)
- Dark mode
- Toggle with moon/sun icon in editor

### Editor Options
- A4 width or full-width layout
- Font family selection
- Font size (12px - 24px)
- Text color customization
- Highlight colors

### Mindmap Controls
- Zoom in/out
- Pan across canvas
- Reset view
- Toggle messy mode

## 🔧 Troubleshooting

### Common Issues

**Can't login with Google**
- Check redirect URIs in Google Cloud Console
- Ensure `BACKEND_URL` and `FRONTEND_URL` are correct
- Clear browser cookies and try again

**Notes not appearing**
- Refresh the mindmap page
- Check browser console for errors
- Verify database connection

**Search not working**
- Ensure notes have text content
- Embeddings are generated on save
- Try different search terms

**PDF not loading**
- Check file URL is accessible
- Verify Cloudflare R2 configuration
- Try re-uploading the PDF

## 📝 Development Notes

### Adding New Features

1. **Backend**
   - Add route in `server.js`
   - Update Prisma schema if needed
   - Run migrations

2. **Frontend**
   - Create component in `src/components/`
   - Add route in `App.jsx`
   - Update UI accordingly

### Database Migrations

```bash
# After changing schema.prisma
npx prisma generate
npx prisma db push

# Or create migration
npx prisma migrate dev --name your_migration_name
```

### Environment Variables

Never commit `.env` files. Use `.env.example` as template.

## 🤝 Contributing

This is a personal project, but suggestions are welcome!

## 📄 License

MIT License - feel free to use this for your own messy thinking!

## 🙏 Acknowledgments

- TipTap for the amazing editor
- Hugging Face for the embedding model
- All the messy thinkers who inspired this project

---

**Happy Messy Thinking! 🧠✨**