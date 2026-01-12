import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '../src/stores/settings.store'

// Mock window.electronAPI
vi.stubGlobal('window', {
  electronAPI: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
  matchMedia: vi.fn(() => ({ matches: false })),
})

describe('Settings Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('extractIssueId', () => {
    it('extracts GitLab issue ID from URL', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'gitlab'

      expect(store.extractIssueId('https://gitlab.com/org/repo/-/issues/123')).toBe('#123')
      expect(store.extractIssueId('https://gitlab.com/group/subgroup/project/-/issues/456')).toBe('#456')
    })

    it('extracts GitHub issue ID from URL', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'github'

      expect(store.extractIssueId('https://github.com/org/repo/issues/789')).toBe('#789')
      expect(store.extractIssueId('https://github.com/facebook/react/issues/12345')).toBe('#12345')
    })

    it('extracts Jira issue ID from URL', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'jira'

      expect(store.extractIssueId('https://company.atlassian.net/browse/PROJ-123')).toBe('PROJ-123')
      expect(store.extractIssueId('https://jira.example.com/browse/ABC-999')).toBe('ABC-999')
    })

    it('returns null for invalid URLs', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'gitlab'

      expect(store.extractIssueId('https://google.com')).toBeNull()
      expect(store.extractIssueId('not a url')).toBeNull()
      expect(store.extractIssueId('')).toBeNull()
    })

    it('works with custom pattern', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'custom'
      store.settings.customIssuePattern = '/ticket/(\\d+)'

      expect(store.extractIssueId('https://support.example.com/ticket/42')).toBe('#42')
    })

    it('falls back to default pattern if custom pattern is invalid', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'custom'
      store.settings.customIssuePattern = '[invalid regex'

      // Falls back to /issues/(\d+)
      expect(store.extractIssueId('https://example.com/issues/123')).toBe('#123')
    })
  })

  describe('issueIdRegex', () => {
    it('returns correct regex for each pattern type', () => {
      const store = useSettingsStore()

      store.settings.issueUrlPattern = 'gitlab'
      expect(store.issueIdRegex.source).toBe('\\/issues\\/(\\d+)')

      store.settings.issueUrlPattern = 'github'
      expect(store.issueIdRegex.source).toBe('\\/issues\\/(\\d+)')

      store.settings.issueUrlPattern = 'jira'
      expect(store.issueIdRegex.source).toBe('\\/browse\\/([A-Z]+-\\d+)')
    })
  })
})
