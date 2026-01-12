import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { AppSettings } from '@/types'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({
    dailyTargetHours: 8,
    monthlyTargetHours: 160,
    hourlyRate: 18.67,
    currency: 'GBP',
    currencySymbol: '£',
    idleThresholdMinutes: 10,
    idleIndicatorSeconds: 30,
    issueUrlPattern: 'gitlab',
    customIssuePattern: undefined,
    theme: 'light'
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
        return /\/issues\/(\d+)/
      case 'github':
        return /\/issues\/(\d+)/
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

  function extractIssueId(url: string): string | null {
    const match = url.match(issueIdRegex.value)
    if (!match) return null

    const id = match[1]
    // Add # prefix for numeric IDs
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
    extractIssueId
  }
})
