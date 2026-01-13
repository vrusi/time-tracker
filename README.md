# Time Tracker

A desktop time tracking app for freelancers and developers. Track time spent on issues/tasks, monitor daily and monthly progress, and export reports.

## Features

- **Issue Tracking** - Add issues from GitLab, GitHub, Jira, or custom URLs
- **One-Click Tracking** - Start/pause tracking with a single click
- **Idle Detection** - Auto-pauses when you're away, resumes when you're back
- **Presence Mode** - Disable idle detection for meetings or reading (indicate you're present even without input)
- **Progress Bars** - Visual daily and monthly hour targets
- **Earnings Display** - Optional earnings widget (hidden by default for privacy)
- **Dark Mode** - Light, dark, or system theme
- **Notes** - Add notes to issues and time entries
- **History View** - Browse, edit, and manage past entries
- **Calendar View** - Monthly overview of tracked time
- **Export** - Generate monthly CSV reports

## Screenshots

*Coming soon*

## Installation

### From Source

```bash
# Clone the repo
git clone https://github.com/yourusername/time-tracker.git
cd time-tracker

# Install dependencies
npm install

# Run in development
npm run dev

# Build for production
npm run build
```

## Usage

1. **Add an Issue** - Paste a URL from your issue tracker and give it a name
2. **Start Tracking** - Click the play button on any issue
3. **Work** - The timer runs in the background, detecting idle time
4. **Pause** - Click pause when done, optionally add notes
5. **Review** - Check your progress in History or Calendar tabs
6. **Export** - Generate monthly reports in Settings > Export

## Settings

- **Work Hours** - Set daily and monthly hour targets
- **Earnings** - Configure hourly rate and currency (widget hidden by default)
- **Idle Detection** - Adjust auto-pause threshold
- **Notifications** - Toggle desktop notifications
- **Theme** - Choose light, dark, or system theme
- **Issue Tracker** - Select GitLab, GitHub, Jira, or custom pattern

## Tech Stack

- **Frontend**: Vue 3, TypeScript, Pinia, Tailwind CSS
- **Desktop**: Electron
- **Database**: SQLite (better-sqlite3)
- **Build**: Vite, electron-builder

## Development

```bash
# Run development server with hot reload
npm run dev

# Type check
npm run typecheck

# Build production app
npm run build
```