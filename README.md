# Time Tracker

A minimal, offline-first desktop time tracking app for freelancers and developers. Track time spent on issues/tasks, monitor daily and monthly progress, and export reports.

Built with Electron, Vue 3, and SQLite. All data stays local on your machine.

**Why a desktop app?** Unlike browser-based trackers, this app detects system-wide idle time and automatically pauses tracking when you step away. No more forgetting to stop the timer and logging 8 hours of "lunch break".

## Features

- **Issue Tracking** - Add issues from GitLab, GitHub, Jira, or custom URLs
- **One-Click Tracking** - Start/pause tracking with a single click
- **Idle Detection** - Auto-pauses when you're away, with configurable threshold
- **Session Recovery** - Gracefully handles unexpected closes, lets you recover or discard time
- **Presence Mode** - Disable idle detection for meetings or reading
- **Progress Bars** - Visual daily and monthly hour targets
- **Earnings Display** - Optional earnings widget (hidden by default for privacy)
- **History View** - Browse, edit, and delete past entries with per-day quick-add
- **Calendar View** - Monthly overview with day-level entry creation
- **Multi-Project Support** - Switch between separate databases for different clients/projects
- **Export** - Generate CSV reports for any date range
- **Dark Mode** - Light, dark, or system theme
- **Fully Offline** - No accounts, no cloud, no tracking

## Installation

### Download

Check the [Releases](https://github.com/vrusi/time-tracker/releases) page for pre-built binaries.

### From Source

```bash
git clone https://github.com/vrusi/time-tracker.git
cd time-tracker

pnpm install
pnpm run dev      # Development with hot reload
pnpm run build    # Build for production
```

## Usage

1. **Add an Issue** - Paste a URL or type a name
2. **Start Tracking** - Click the play button
3. **Work** - Timer runs in background, auto-pauses on idle
4. **Review** - Check History (list) or Calendar (monthly view)
5. **Export** - Generate reports from Settings

## Data Storage

All data is stored locally in SQLite databases. No cloud sync, no accounts.

**Database location:**
- macOS: `~/Library/Application Support/Time Tracker/`
- Windows: `%APPDATA%/Time Tracker/`
- Linux: `~/.config/Time Tracker/`

**Backup & Restore:**
- **Export**: Settings → Export Database (saves a `.db` file)
- **Import**: Settings → Import Database (replaces current data)
- **Manual backup**: Copy the `.db` files from the location above

Each project has its own database file, so you can back up or share projects independently.

## Tech Stack

- **Frontend**: Vue 3, TypeScript, Pinia
- **UI**: [Roughness](https://github.com/aspect-build/roughness) (hand-drawn style components)
- **Desktop**: Electron
- **Database**: SQLite (better-sqlite3)
- **Build**: Vite, electron-builder

## Development

```bash
pnpm run dev        # Dev server with hot reload
pnpm run test       # Run tests
pnpm run typecheck  # Type check
pnpm run build      # Production build
```

## License

MIT