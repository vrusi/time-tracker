import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProjectsStore } from '../../src/stores/projects.store'
import { mockElectronAPI } from '../setup'

// Add project-related mocks to the mock API
const projectMocks = {
  getProjects: vi.fn(),
  createProject: vi.fn(),
  switchProject: vi.fn(),
  renameProject: vi.fn(),
  deleteProject: vi.fn()
}

// Extend the mock
Object.assign(mockElectronAPI, projectMocks)

function createMockProject(overrides: Partial<{
  id: string
  name: string
  dbFile: string
  createdAt: string
}> = {}) {
  return {
    id: 'proj-1',
    name: 'Test Project',
    dbFile: 'projects/test/data.db',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('Projects Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    projectMocks.getProjects.mockReset()
    projectMocks.createProject.mockReset()
    projectMocks.switchProject.mockReset()
    projectMocks.renameProject.mockReset()
    projectMocks.deleteProject.mockReset()
  })

  describe('loadProjects', () => {
    it('loads projects and selects activeProject based on activeProjectId', async () => {
      const store = useProjectsStore()
      const project1 = createMockProject({ id: 'proj-1', name: 'Project 1' })
      const project2 = createMockProject({ id: 'proj-2', name: 'Project 2' })

      projectMocks.getProjects.mockResolvedValue({
        activeProjectId: 'proj-2',
        projects: [project1, project2]
      })

      await store.loadProjects()

      expect(store.projects).toHaveLength(2)
      expect(store.activeProject).toEqual(project2)
    })

    it('sets activeProject to null if not found', async () => {
      const store = useProjectsStore()
      const project1 = createMockProject({ id: 'proj-1' })

      projectMocks.getProjects.mockResolvedValue({
        activeProjectId: 'non-existent',
        projects: [project1]
      })

      await store.loadProjects()

      expect(store.activeProject).toBeNull()
    })

    it('sets isLoading during load', async () => {
      const store = useProjectsStore()
      projectMocks.getProjects.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ activeProjectId: '', projects: [] }), 10))
      )

      const loadPromise = store.loadProjects()
      expect(store.isLoading).toBe(true)

      await loadPromise
      expect(store.isLoading).toBe(false)
    })
  })

  describe('createProject', () => {
    it('creates project and adds to store', async () => {
      const store = useProjectsStore()
      store.projects = [createMockProject({ id: 'existing' })]

      const newProject = createMockProject({ id: 'new-proj', name: 'New Project' })
      projectMocks.createProject.mockResolvedValue(newProject)

      const result = await store.createProject('New Project')

      expect(projectMocks.createProject).toHaveBeenCalledWith('New Project')
      expect(result).toEqual(newProject)
      expect(store.projects).toHaveLength(2)
      expect(store.projects[1]).toEqual(newProject)
    })
  })

  describe('switchProject', () => {
    it('updates activeProject after switch', async () => {
      const store = useProjectsStore()
      const project1 = createMockProject({ id: 'proj-1', name: 'Project 1' })
      const project2 = createMockProject({ id: 'proj-2', name: 'Project 2' })
      store.projects = [project1, project2]
      store.activeProject = project1

      projectMocks.switchProject.mockResolvedValue(project2)

      await store.switchProject('proj-2')

      expect(projectMocks.switchProject).toHaveBeenCalledWith('proj-2')
      expect(store.activeProject).toEqual(project2)
    })

    it('sets isLoading during switch', async () => {
      const store = useProjectsStore()
      const project = createMockProject()

      projectMocks.switchProject.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(project), 10))
      )

      const switchPromise = store.switchProject('proj-1')
      expect(store.isLoading).toBe(true)

      await switchPromise
      expect(store.isLoading).toBe(false)
    })
  })

  describe('renameProject', () => {
    it('updates project in array', async () => {
      const store = useProjectsStore()
      const project = createMockProject({ id: 'proj-1', name: 'Old Name' })
      store.projects = [project]

      const renamedProject = createMockProject({ id: 'proj-1', name: 'New Name' })
      projectMocks.renameProject.mockResolvedValue(renamedProject)

      await store.renameProject('proj-1', 'New Name')

      expect(projectMocks.renameProject).toHaveBeenCalledWith('proj-1', 'New Name')
      expect(store.projects[0].name).toBe('New Name')
    })

    it('updates activeProject name if applicable', async () => {
      const store = useProjectsStore()
      const project = createMockProject({ id: 'proj-1', name: 'Old Name' })
      store.projects = [project]
      store.activeProject = project

      const renamedProject = createMockProject({ id: 'proj-1', name: 'New Name' })
      projectMocks.renameProject.mockResolvedValue(renamedProject)

      await store.renameProject('proj-1', 'New Name')

      expect(store.activeProject?.name).toBe('New Name')
    })

    it('does not update activeProject if renaming different project', async () => {
      const store = useProjectsStore()
      const project1 = createMockProject({ id: 'proj-1', name: 'Active' })
      const project2 = createMockProject({ id: 'proj-2', name: 'Other' })
      store.projects = [project1, project2]
      store.activeProject = project1

      const renamedProject = createMockProject({ id: 'proj-2', name: 'Renamed Other' })
      projectMocks.renameProject.mockResolvedValue(renamedProject)

      await store.renameProject('proj-2', 'Renamed Other')

      expect(store.activeProject?.name).toBe('Active') // Unchanged
      expect(store.projects[1].name).toBe('Renamed Other')
    })
  })

  describe('deleteProject', () => {
    it('removes project from store', async () => {
      const store = useProjectsStore()
      const project1 = createMockProject({ id: 'proj-1' })
      const project2 = createMockProject({ id: 'proj-2' })
      store.projects = [project1, project2]

      projectMocks.deleteProject.mockResolvedValue(undefined)

      await store.deleteProject('proj-2')

      expect(projectMocks.deleteProject).toHaveBeenCalledWith('proj-2')
      expect(store.projects).toHaveLength(1)
      expect(store.projects[0].id).toBe('proj-1')
    })
  })
})
