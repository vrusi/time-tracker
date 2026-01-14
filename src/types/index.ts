export interface Issue {
  id: number
  externalId: string
  name: string
  link: string | null
  notes: string | null
  archived: boolean
  createdAt: string
}

export interface TimeEntry {
  id: number
  issueId: number
  startedAt: string
  endedAt: string | null
  pausedReason: 'manual' | 'idle' | 'switched' | null
  notes: string | null
}

export interface IssueWithTime extends Issue {
  totalSeconds: number
  isTracking: boolean
}

export interface DayGroup {
  date: string
  entries: (TimeEntry & { issue: Issue })[]
  totalSeconds: number
}

export interface MonthlyReport {
  issueId: number
  externalId: string
  name: string
  totalHours: number
}

export interface Project {
  id: string
  name: string
  dbFile: string
  createdAt: string
}

export interface ProjectsConfig {
  activeProjectId: string
  projects: Project[]
}

export interface AppSettings {
  dailyTargetHours: number
  monthlyTargetHours: number
  hourlyRate: number
  currency: string
  currencySymbol: string
  idleThresholdMinutes: number
  idleIndicatorMinutes: number
  issueUrlPattern: 'gitlab' | 'github' | 'jira' | 'custom'
  customIssuePattern?: string
  theme: 'light' | 'dark' | 'system'
  showEarnings: boolean
  notificationsEnabled: boolean
}

// IPC API exposed to renderer
export interface ElectronAPI {
  // Issues
  getIssues: (includeArchived?: boolean) => Promise<Issue[]>
  createIssue: (issue: Omit<Issue, 'id' | 'createdAt'>) => Promise<Issue>
  updateIssue: (id: number, updates: Partial<Pick<Issue, 'externalId' | 'name' | 'link' | 'notes'>>) => Promise<Issue>
  archiveIssue: (id: number) => Promise<void>
  unarchiveIssue: (id: number) => Promise<void>
  deleteIssue: (id: number) => Promise<void>
  mergeIssues: (sourceId: number, targetId: number) => Promise<void>

  // Tracking
  startTracking: (issueId: number) => Promise<TimeEntry>
  pauseTracking: (reason?: 'manual' | 'switched') => Promise<TimeEntry | null>
  getCurrentTracking: () => Promise<{ entry: TimeEntry; issue: Issue } | null>

  // Presence mode
  getPresenceMode: () => Promise<boolean>
  setPresenceMode: (enabled: boolean) => Promise<void>

  // History
  getTimeEntries: (startDate: string, endDate: string) => Promise<(TimeEntry & { issue: Issue })[]>
  getIssueTime: (issueId: number) => Promise<number>
  getIssueEntries: (issueId: number) => Promise<TimeEntry[]>

  // Time entry management
  createTimeEntry: (issueId: number, startedAt: string, endedAt: string, notes?: string) => Promise<TimeEntry>
  updateTimeEntry: (id: number, updates: { startedAt?: string; endedAt?: string; notes?: string }) => Promise<TimeEntry>
  deleteTimeEntry: (id: number) => Promise<void>
  deleteTimeEntries: (ids: number[]) => Promise<void>
  deleteIssues: (ids: number[]) => Promise<void>
  wipeDatabase: () => Promise<void>
  exportDatabase: () => Promise<boolean>
  importDatabase: () => Promise<boolean>

  // Export
  exportMonth: (year: number, month: number) => Promise<MonthlyReport[]>

  // Idle
  getIdleTime: () => Promise<number>
  resetIdleTime: () => Promise<void>

  // Settings
  getSettings: () => Promise<AppSettings>
  updateSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>

  // Projects
  getProjects: () => Promise<ProjectsConfig>
  getActiveProject: () => Promise<Project>
  createProject: (name: string) => Promise<Project>
  switchProject: (id: string) => Promise<Project>
  renameProject: (id: string, name: string) => Promise<Project>
  deleteProject: (id: string) => Promise<void>

  // Events from main process
  onIdlePause: (callback: () => void) => void
  onTrackingUpdate: (callback: (data: { entry: TimeEntry; issue: Issue } | null) => void) => void
  onPresenceModeChange: (callback: (enabled: boolean) => void) => void
  onIdleUpdate: (callback: (seconds: number) => void) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
