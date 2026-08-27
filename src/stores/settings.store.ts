import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { AppSettings, ItemKind } from '@/types'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({
    dailyTargetHours: 8,
    weeklyTargetHours: 40,
    monthlyTargetHours: 160,
    hourlyRate: 18.67,
    currency: 'GBP',
    currencySymbol: '£',
    idleThresholdMinutes: 10,
    idleIndicatorMinutes: 0.5,
    issueUrlPattern: 'gitlab',
    issueBaseUrl: undefined,
    customIssuePattern: undefined,
    theme: 'light',
    showEarnings: false,
    notificationsEnabled: true
  })

  const isLoaded = ref(false)

  // Apply theme to document
  function applyTheme(theme: 'light' | 'dark' | 'system') {
    const root = document.documentElement
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.toggle('dark', prefersDark)
    } else {
      root.classList.toggle('dark', theme === 'dark')
    }
  }

  // Watch for theme changes
  watch(() => settings.value.theme, (newTheme) => {
    applyTheme(newTheme)
  })

  async function loadSettings() {
    settings.value = await window.electronAPI.getSettings()
    applyTheme(settings.value.theme)
    isLoaded.value = true
  }

  async function updateSettings(updates: Partial<AppSettings>) {
    settings.value = await window.electronAPI.updateSettings(updates)
    if (updates.theme) {
      applyTheme(updates.theme)
    }
  }

  // Helper to get issue ID regex based on pattern
  const issueIdRegex = computed(() => {
    switch (settings.value.issueUrlPattern) {
      case 'gitlab':
        return /\/(?:issues|work_items|merge_requests)\/(\d+)/
      case 'github':
        return /\/(?:issues|pull)\/(\d+)/
      case 'jira':
        return /\/browse\/([A-Z]+-\d+)/
      case 'custom':
        if (settings.value.customIssuePattern) {
          try {
            return new RegExp(settings.value.customIssuePattern)
          } catch {
            return /\/issues\/(\d+)/
          }
        }
        return /\/issues\/(\d+)/
      default:
        return /\/issues\/(\d+)/
    }
  })

  // Parse a bare item ID into its parts.
  // "reflow#125" is an issue, "reflow!125" a merge request, "PROJ-123" a Jira issue.
  function parseBareId(input: string): { prefix: string; number: string; kind: ItemKind } | null {
    // Match "project#123" / "project!123" style
    const hashMatch = input.match(/^([a-zA-Z0-9_-]+)([#!])(\d+)$/)
    if (hashMatch) {
      return {
        prefix: hashMatch[1],
        number: hashMatch[3],
        kind: hashMatch[2] === '!' ? 'merge_request' : 'issue'
      }
    }

    // Match "PROJ-123" jira style
    const jiraMatch = input.match(/^([A-Z]+)-(\d+)$/)
    if (jiraMatch) return { prefix: jiraMatch[1], number: jiraMatch[2], kind: 'issue' }

    return null
  }

  // Build a full URL from a bare issue ID using the configured base URL and pattern
  // e.g. "app#222" + base "https://gitlab.avvoka.com/avvoka" + gitlab pattern
  //   → "https://gitlab.avvoka.com/avvoka/app/-/issues/222"
  function buildIssueUrl(bareId: string): string | null {
    const parsed = parseBareId(bareId)
    if (!parsed) return null

    const rawBase = settings.value.issueBaseUrl
    if (!rawBase) return null
    const base = rawBase.replace(/\/+$/, '')

    const isMr = parsed.kind === 'merge_request'
    const pattern = settings.value.issueUrlPattern
    switch (pattern) {
      case 'gitlab':
        return `${base}/${parsed.prefix}/-/${isMr ? 'merge_requests' : 'issues'}/${parsed.number}`
      case 'github':
        return `${base}/${parsed.prefix}/${isMr ? 'pull' : 'issues'}/${parsed.number}`
      case 'jira':
        // Jira has no merge request concept
        return isMr ? null : `${base}/browse/${parsed.prefix}-${parsed.number}`
      default:
        return null
    }
  }

  function extractIssueId(url: string): string | null {
    // Auto-detect tracker type from URL and extract project name where possible
    if (url.includes('gitlab.com') || url.includes('gitlab')) {
      const match = url.match(/\/([^/]+)\/-\/(issues|work_items|merge_requests)\/(\d+)/)
      if (!match) return null
      // Merge requests get "!" so they read the way GitLab writes them
      const separator = match[2] === 'merge_requests' ? '!' : '#'
      return `${match[1]}${separator}${match[3]}`
    }

    if (url.includes('github.com') || url.includes('github')) {
      const match = url.match(/\/([^/]+)\/(issues|pull)\/(\d+)/)
      if (!match) return null
      const separator = match[2] === 'pull' ? '!' : '#'
      return `${match[1]}${separator}${match[3]}`
    }

    if (url.includes('atlassian') || url.includes('jira')) {
      const match = url.match(/\/browse\/([A-Z]+-\d+)/)
      if (!match) return null
      return match[1]
    }

    // Use the user's configured pattern as fallback
    const match = url.match(issueIdRegex.value)
    if (!match) return null

    const id = match[1]
    if (/^\d+$/.test(id)) {
      return `#${id}`
    }
    return id
  }

  return {
    settings,
    isLoaded,
    loadSettings,
    updateSettings,
    issueIdRegex,
    extractIssueId,
    parseBareId,
    buildIssueUrl
  }
})
