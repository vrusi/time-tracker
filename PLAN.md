# Time Tracker - Implementation Plan

## Features Implemented

1. **Issue management**: Create issues (id, name, link), archive old ones
2. **Time tracking**: Start/pause, auto-pause current when starting another
3. **Idle detection**: Auto-pause after 10 minutes of keyboard/mouse inactivity
4. **History view**: See what was worked on by day and time
5. **Export**: Monthly CSV with hours per issue
6. **System tray**: Quick access and status visibility

## TODO Features

### Handsoff Mode
A toggle that temporarily disables idle detection - useful when:
- Letting Claude/AI work while you step away
- Reading documentation
- In meetings with screen share

**Implementation:**
- Add toggle button in header next to tracker status
- When enabled:
  - Idle watcher continues but doesn't pause
  - Visual indicator shows handsoff mode is active
  - Optional: Auto-disable after X hours as safety measure
- Store state in main process, sync to renderer via IPC

## Tech Stack
- Electron + Vue 3 + TypeScript
- SQLite (better-sqlite3)
- Tailwind CSS
- Vite

## Commands
```bash
npm run dev     # Development with hot reload
npm run build   # Production build
```
