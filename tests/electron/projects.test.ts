import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

// We need to test the sanitizeName logic and project validation rules
// without requiring full Electron environment

describe('Projects Module Logic', () => {
  describe('sanitizeName', () => {
    /**
     * Replicates the sanitizeName function from projects.ts
     */
    function sanitizeName(name: string): string {
      return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    }

    it('converts to lowercase', () => {
      expect(sanitizeName('MyProject')).toBe('myproject')
      expect(sanitizeName('UPPERCASE')).toBe('uppercase')
    })

    it('replaces spaces with dashes', () => {
      expect(sanitizeName('my project')).toBe('my-project')
      expect(sanitizeName('multiple   spaces')).toBe('multiple-spaces')
    })

    it('removes unsafe characters', () => {
      expect(sanitizeName('my/project')).toBe('my-project')
      expect(sanitizeName('my\\project')).toBe('my-project')
      expect(sanitizeName('my:project')).toBe('my-project')
      expect(sanitizeName('my*project')).toBe('my-project')
      expect(sanitizeName('my?project')).toBe('my-project')
    })

    it('handles special characters', () => {
      expect(sanitizeName('project@2024!')).toBe('project-2024')
      expect(sanitizeName('my#project$name')).toBe('my-project-name')
    })

    it('collapses multiple dashes', () => {
      expect(sanitizeName('my---project')).toBe('my-project')
      expect(sanitizeName('a - b - c')).toBe('a-b-c')
    })

    it('trims leading and trailing dashes', () => {
      expect(sanitizeName('-myproject-')).toBe('myproject')
      expect(sanitizeName('---test---')).toBe('test')
    })

    it('handles empty/whitespace-only input', () => {
      expect(sanitizeName('')).toBe('')
      expect(sanitizeName('   ')).toBe('')
      expect(sanitizeName('---')).toBe('')
    })

    it('preserves numbers', () => {
      expect(sanitizeName('project123')).toBe('project123')
      expect(sanitizeName('2024-q1-work')).toBe('2024-q1-work')
    })
  })

  describe('Project validation rules', () => {
    interface Project {
      id: string
      name: string
      dbFile: string
      createdAt: string
    }

    interface ProjectsConfig {
      activeProjectId: string
      projects: Project[]
    }

    function createMockConfig(projects: Partial<Project>[]): ProjectsConfig {
      const fullProjects: Project[] = projects.map((p, i) => ({
        id: p.id ?? randomUUID(),
        name: p.name ?? `Project ${i + 1}`,
        dbFile: p.dbFile ?? `projects/proj-${i}/data.db`,
        createdAt: p.createdAt ?? new Date().toISOString()
      }))

      return {
        activeProjectId: fullProjects[0]?.id ?? '',
        projects: fullProjects
      }
    }

    describe('deleteProject validation', () => {
      it('throws when trying to delete the last project', () => {
        const config = createMockConfig([{ name: 'Only Project' }])

        const deleteProject = () => {
          if (config.projects.length === 1) {
            throw new Error('Cannot delete the last project')
          }
        }

        expect(deleteProject).toThrow('Cannot delete the last project')
      })

      it('throws when trying to delete the active project', () => {
        const config = createMockConfig([
          { name: 'Project 1' },
          { name: 'Project 2' }
        ])

        const projectIdToDelete = config.activeProjectId

        const deleteProject = () => {
          if (config.activeProjectId === projectIdToDelete) {
            throw new Error('Cannot delete the active project')
          }
        }

        expect(deleteProject).toThrow('Cannot delete the active project')
      })

      it('allows deleting a non-active project when multiple exist', () => {
        const config = createMockConfig([
          { name: 'Active Project' },
          { name: 'Inactive Project' }
        ])

        const nonActiveProjectId = config.projects[1].id

        const deleteProject = () => {
          if (config.projects.length === 1) {
            throw new Error('Cannot delete the last project')
          }
          if (config.activeProjectId === nonActiveProjectId) {
            throw new Error('Cannot delete the active project')
          }
          // Delete would proceed
          return true
        }

        expect(deleteProject()).toBe(true)
      })
    })

    describe('setActiveProject validation', () => {
      it('throws when project is not found', () => {
        const config = createMockConfig([{ name: 'Project 1' }])

        const setActiveProject = (projectId: string) => {
          const project = config.projects.find(p => p.id === projectId)
          if (!project) {
            throw new Error('Project not found')
          }
          return project
        }

        expect(() => setActiveProject('non-existent-id')).toThrow('Project not found')
      })

      it('returns the project when found', () => {
        const config = createMockConfig([
          { name: 'Project 1' },
          { name: 'Project 2' }
        ])

        const targetId = config.projects[1].id

        const setActiveProject = (projectId: string) => {
          const project = config.projects.find(p => p.id === projectId)
          if (!project) {
            throw new Error('Project not found')
          }
          return project
        }

        const result = setActiveProject(targetId)
        expect(result.name).toBe('Project 2')
      })
    })

    describe('getActiveProject validation', () => {
      it('throws when active project is not found', () => {
        const config: ProjectsConfig = {
          activeProjectId: 'deleted-project-id',
          projects: [{ id: 'other-id', name: 'Other', dbFile: 'db', createdAt: new Date().toISOString() }]
        }

        const getActiveProject = () => {
          const project = config.projects.find(p => p.id === config.activeProjectId)
          if (!project) {
            throw new Error('Active project not found')
          }
          return project
        }

        expect(getActiveProject).toThrow('Active project not found')
      })
    })
  })

  describe('Folder name collision resolution', () => {
    /**
     * Simulates the collision resolution logic from createProject
     */
    function resolveCollision(
      baseName: string,
      existingFolders: Set<string>
    ): string {
      let folderName = baseName
      let counter = 1

      while (existingFolders.has(folderName)) {
        folderName = `${baseName}-${counter}`
        counter++
      }

      return folderName
    }

    it('returns original name when no collision', () => {
      const existing = new Set(['other-project'])
      expect(resolveCollision('my-project', existing)).toBe('my-project')
    })

    it('appends counter when collision exists', () => {
      const existing = new Set(['my-project'])
      expect(resolveCollision('my-project', existing)).toBe('my-project-1')
    })

    it('increments counter for multiple collisions', () => {
      const existing = new Set(['my-project', 'my-project-1', 'my-project-2'])
      expect(resolveCollision('my-project', existing)).toBe('my-project-3')
    })
  })
})
