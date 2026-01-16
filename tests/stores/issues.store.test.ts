import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useIssuesStore } from '../../src/stores/issues.store'
import { mockElectronAPI } from '../setup'
import { createMockIssue } from '../fixtures'

describe('Issues Store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    // Reset mocks
    mockElectronAPI.getIssues.mockReset()
    mockElectronAPI.createIssue.mockReset()
    mockElectronAPI.updateIssue.mockReset()
    mockElectronAPI.archiveIssue.mockReset()
    mockElectronAPI.unarchiveIssue.mockReset()
    mockElectronAPI.deleteIssue.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('computed views', () => {
    it('activeIssues excludes archived', () => {
      const store = useIssuesStore()
      store.issues = [
        createMockIssue({ id: 1, archived: false }),
        createMockIssue({ id: 2, archived: true }),
        createMockIssue({ id: 3, archived: false })
      ]

      expect(store.activeIssues).toHaveLength(2)
      expect(store.activeIssues.every(i => !i.archived)).toBe(true)
    })

    it('archivedIssues includes only archived', () => {
      const store = useIssuesStore()
      store.issues = [
        createMockIssue({ id: 1, archived: false }),
        createMockIssue({ id: 2, archived: true }),
        createMockIssue({ id: 3, archived: true })
      ]

      expect(store.archivedIssues).toHaveLength(2)
      expect(store.archivedIssues.every(i => i.archived)).toBe(true)
    })

    it('displayedIssues shows active issues when showArchived is false', () => {
      const store = useIssuesStore()
      store.issues = [
        createMockIssue({ id: 1, archived: false }),
        createMockIssue({ id: 2, archived: true })
      ]
      store.showArchived = false

      expect(store.displayedIssues).toHaveLength(1)
      expect(store.displayedIssues[0].archived).toBe(false)
    })

    it('displayedIssues shows archived issues when showArchived is true', () => {
      const store = useIssuesStore()
      store.issues = [
        createMockIssue({ id: 1, archived: false }),
        createMockIssue({ id: 2, archived: true })
      ]
      store.showArchived = true

      expect(store.displayedIssues).toHaveLength(1)
      expect(store.displayedIssues[0].archived).toBe(true)
    })
  })

  describe('loadIssues', () => {
    it('loads all issues from API', async () => {
      const store = useIssuesStore()
      const mockIssues = [
        createMockIssue({ id: 1 }),
        createMockIssue({ id: 2 })
      ]
      mockElectronAPI.getIssues.mockResolvedValue(mockIssues)

      await store.loadIssues()

      expect(mockElectronAPI.getIssues).toHaveBeenCalledWith(true)
      expect(store.issues).toEqual(mockIssues)
    })

    it('sets isLoading during load', async () => {
      const store = useIssuesStore()
      let resolvePromise: (value: any[]) => void
      mockElectronAPI.getIssues.mockImplementation(() =>
        new Promise(resolve => { resolvePromise = resolve })
      )

      const loadPromise = store.loadIssues()
      expect(store.isLoading).toBe(true)

      resolvePromise!([])
      await loadPromise
      expect(store.isLoading).toBe(false)
    })

    it('clears isLoading on error', async () => {
      const store = useIssuesStore()
      mockElectronAPI.getIssues.mockRejectedValue(new Error('API error'))

      await expect(store.loadIssues()).rejects.toThrow()
      expect(store.isLoading).toBe(false)
    })
  })

  describe('createIssue', () => {
    it('creates issue and adds to beginning of store', async () => {
      const store = useIssuesStore()
      store.issues = [createMockIssue({ id: 1 })]

      const newIssue = createMockIssue({ id: 2, externalId: '#new', name: 'New Issue' })
      mockElectronAPI.createIssue.mockResolvedValue(newIssue)

      const result = await store.createIssue('#new', 'New Issue', null)

      expect(mockElectronAPI.createIssue).toHaveBeenCalledWith({
        externalId: '#new',
        name: 'New Issue',
        link: null,
        notes: null,
        archived: false
      })
      expect(result).toEqual(newIssue)
      expect(store.issues[0]).toEqual(newIssue) // At beginning
    })
  })

  describe('updateIssue', () => {
    it('updates issue in store', async () => {
      const store = useIssuesStore()
      store.issues = [
        createMockIssue({ id: 1, name: 'Original Name' }),
        createMockIssue({ id: 2 })
      ]

      const updatedIssue = createMockIssue({ id: 1, name: 'Updated Name' })
      mockElectronAPI.updateIssue.mockResolvedValue(updatedIssue)

      await store.updateIssue(1, { name: 'Updated Name' })

      expect(mockElectronAPI.updateIssue).toHaveBeenCalledWith(1, { name: 'Updated Name' })
      expect(store.issues[0].name).toBe('Updated Name')
    })

    it('handles issue not found in store', async () => {
      const store = useIssuesStore()
      store.issues = [createMockIssue({ id: 1 })]

      const updatedIssue = createMockIssue({ id: 999, name: 'Updated' })
      mockElectronAPI.updateIssue.mockResolvedValue(updatedIssue)

      await store.updateIssue(999, { name: 'Updated' })

      // Should not throw, just not update anything
      expect(store.issues).toHaveLength(1)
      expect(store.issues[0].id).toBe(1)
    })
  })

  describe('archiveIssue', () => {
    it('archives issue in store', async () => {
      const store = useIssuesStore()
      store.issues = [createMockIssue({ id: 1, archived: false })]

      mockElectronAPI.archiveIssue.mockResolvedValue(undefined)

      await store.archiveIssue(1)

      expect(mockElectronAPI.archiveIssue).toHaveBeenCalledWith(1)
      expect(store.issues[0].archived).toBe(true)
    })

    it('affects computed lists correctly', async () => {
      const store = useIssuesStore()
      store.issues = [
        createMockIssue({ id: 1, archived: false }),
        createMockIssue({ id: 2, archived: false })
      ]

      mockElectronAPI.archiveIssue.mockResolvedValue(undefined)

      expect(store.activeIssues).toHaveLength(2)
      expect(store.archivedIssues).toHaveLength(0)

      await store.archiveIssue(1)

      expect(store.activeIssues).toHaveLength(1)
      expect(store.archivedIssues).toHaveLength(1)
    })
  })

  describe('unarchiveIssue', () => {
    it('unarchives issue in store', async () => {
      const store = useIssuesStore()
      store.issues = [createMockIssue({ id: 1, archived: true })]

      mockElectronAPI.unarchiveIssue.mockResolvedValue(undefined)

      await store.unarchiveIssue(1)

      expect(mockElectronAPI.unarchiveIssue).toHaveBeenCalledWith(1)
      expect(store.issues[0].archived).toBe(false)
    })
  })

  describe('deleteIssue', () => {
    it('removes issue from store', async () => {
      const store = useIssuesStore()
      store.issues = [
        createMockIssue({ id: 1 }),
        createMockIssue({ id: 2 }),
        createMockIssue({ id: 3 })
      ]

      mockElectronAPI.deleteIssue.mockResolvedValue(undefined)

      await store.deleteIssue(2)

      expect(mockElectronAPI.deleteIssue).toHaveBeenCalledWith(2)
      expect(store.issues).toHaveLength(2)
      expect(store.issues.map(i => i.id)).toEqual([1, 3])
    })
  })

  describe('error handling', () => {
    it('does not modify state when createIssue fails', async () => {
      const store = useIssuesStore()
      store.issues = [createMockIssue({ id: 1 })]
      const originalLength = store.issues.length

      mockElectronAPI.createIssue.mockRejectedValue(new Error('Create failed'))

      await expect(store.createIssue('#new', 'Test', null)).rejects.toThrow('Create failed')
      expect(store.issues).toHaveLength(originalLength)
    })

    it('does not modify state when updateIssue fails', async () => {
      const store = useIssuesStore()
      store.issues = [createMockIssue({ id: 1, name: 'Original' })]
      const originalName = store.issues[0].name

      mockElectronAPI.updateIssue.mockRejectedValue(new Error('Update failed'))

      await expect(store.updateIssue(1, { name: 'Updated' })).rejects.toThrow('Update failed')
      expect(store.issues[0].name).toBe(originalName)
    })

    it('does not modify state when archiveIssue fails', async () => {
      const store = useIssuesStore()
      store.issues = [createMockIssue({ id: 1, archived: false })]

      mockElectronAPI.archiveIssue.mockRejectedValue(new Error('Archive failed'))

      await expect(store.archiveIssue(1)).rejects.toThrow('Archive failed')
      expect(store.issues[0].archived).toBe(false)
    })

    it('does not modify state when unarchiveIssue fails', async () => {
      const store = useIssuesStore()
      store.issues = [createMockIssue({ id: 1, archived: true })]

      mockElectronAPI.unarchiveIssue.mockRejectedValue(new Error('Unarchive failed'))

      await expect(store.unarchiveIssue(1)).rejects.toThrow('Unarchive failed')
      expect(store.issues[0].archived).toBe(true)
    })

    it('does not modify state when deleteIssue fails', async () => {
      const store = useIssuesStore()
      store.issues = [createMockIssue({ id: 1 }), createMockIssue({ id: 2 })]
      const originalLength = store.issues.length

      mockElectronAPI.deleteIssue.mockRejectedValue(new Error('Delete failed'))

      await expect(store.deleteIssue(1)).rejects.toThrow('Delete failed')
      expect(store.issues).toHaveLength(originalLength)
    })
  })
})
