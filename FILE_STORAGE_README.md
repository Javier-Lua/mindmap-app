# Messy Notes - File Storage Structure

This is a **local-first note-taking app** built with Tauri. All your data is stored directly on your computer—no cloud, no servers.

## Where Your Files Are Stored

All files are stored in:
```
~/Documents/MessyNotes/
```

On different operating systems:
- **Windows**: `C:\Users\YourName\Documents\MessyNotes\`
- **macOS**: `/Users/YourName/Documents/MessyNotes/`
- **Linux**: `/home/yourname/Documents/MessyNotes/`

## File Structure

```
~/Documents/MessyNotes/
├── notes/              # All your notes as Markdown files
│   ├── {note-id-1}.md
│   ├── {note-id-2}.md
│   └── {note-id-3}.md
├── canvas/             # Canvas/mindmap data for each note
│   ├── {note-id-1}.json
│   ├── {note-id-2}.json
│   └── {note-id-3}.json
├── graph.json          # Global graph connections between notes
└── attachments/        # (Future: file attachments)
```

## File Formats

### Notes (`.md` files)

Each note is stored as a Markdown file with YAML frontmatter:

```markdown
---
{
  "title": "My Note Title",
  "updatedAt": "2026-01-30T12:00:00Z",
  "createdAt": "2026-01-29T10:00:00Z",
  "sticky": false,
  "ephemeral": true,
  "archived": false,
  "type": "text",
  "color": "#ffffff"
}
---

Your note content goes here...
```

### Graph Data (`graph.json`)

Stores the positions and connections between notes in the graph view:

```json
{
  "metadata": {
    "note-id-1": {
      "x": 100,
      "y": 200,
      "vx": 0,
      "vy": 0,
      "radius": 8,
      "lastVisited": 1706630400000
    }
  },
  "edges": [
    {
      "id": "edge-1",
      "source": "note-id-1",
      "target": "note-id-2"
    }
  ]
}
```

### Canvas Data (`canvas/{note-id}.json`)

Stores the canvas/mindmap for individual notes:

```json
{
  "nodes": [
    {
      "id": "node-1",
      "type": "card",
      "x": 50,
      "y": 100,
      "width": 200,
      "height": 150,
      "label": "Concept Title",
      "text": "Content here...",
      "color": "#1e1e1e"
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "fromNode": "node-1",
      "toNode": "node-2",
      "fromSide": "right",
      "toSide": "left"
    }
  ]
}
```

## Auto-Save Behavior

- **Notes**: Auto-saved 1 second after you stop typing
- **Graph positions**: Saved continuously as you drag nodes
- **Canvas**: Saved 500ms after any change

All saves happen directly to your local filesystem—no network requests!

## Data Portability

Since everything is just files on your computer:

1. **Backup**: Simply copy the `~/Documents/MessyNotes/` folder
2. **Sync**: Use any file sync service (Dropbox, Google Drive, etc.)
3. **Export**: Your notes are already in Markdown format—readable by any text editor
4. **Version Control**: You can even put the folder in Git if you want!

## Privacy

Your data never leaves your computer unless you explicitly sync the folder to a cloud service. The app does not:
- Send any telemetry
- Connect to any servers
- Access the internet (except for the web search feature if you use it)

## Troubleshooting

**Can't find your notes?**
1. Check `~/Documents/MessyNotes/notes/`
2. Each `.md` file is one note
3. The filename is the note ID (a UUID)

**Notes not saving?**
1. Check file permissions on the `MessyNotes` folder
2. Make sure you have disk space
3. Check the app console for errors

**Want to move your notes?**
1. Close the app
2. Move the entire `MessyNotes` folder
3. The app will recreate it in `~/Documents/` next time you open it

---

**Made with ❤️ by the Messy Notes team**