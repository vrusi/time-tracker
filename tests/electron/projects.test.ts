import { describe, it, expect } from 'vitest'

/**
 * Projects Module Logic - business rules for project management.
 * Tests focus on validation rules and edge cases.
 */
describe('Projects Module Logic', () => {
  describe('project name sanitization', () => {
    /**
     * Replicates the sanitizeName function from projects.ts
     * Creates filesystem-safe folder names from user input.
     */
    function sanitizeName(name: string): string {
      return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    }

    it('creates filesystem-safe folder names', () => {
      expect(sanitizeName('My Project')).toBe('my-project')
      expect(sanitizeName('UPPERCASE')).toBe('uppercase')
      expect(sanitizeName('multiple   spaces')).toBe('multiple-spaces')
    })

    it('removes unsafe filesystem characters', () => {
      expect(sanitizeName('my/project')).toBe('my-project')
      expect(sanitizeName('my\\project')).toBe('my-project')
      expect(sanitizeName('my:project')).toBe('my-project')
      expect(sanitizeName('project@2024!')).toBe('project-2024')
    })

    it('handles edge cases', () => {
      expect(sanitizeName('')).toBe('')
      expect(sanitizeName('   ')).toBe('')
      expect(sanitizeName('---')).toBe('')
      expect(sanitizeName('-myproject-')).toBe('myproject')
    })
  })

  describe('project deletion rules', () => {
    interface Project { id: string; name: string }
    interface Config { activeProjectId: string; projects: Project[] }

    function validateDeletion(config: Config, projectId: string): string | null {
      if (config.projects.length === 1) {
        return 'Cannot delete the last project'
      }
      if (config.activeProjectId === projectId) {
        return 'Cannot delete the active project'
      }
      return null
    }

    it('prevents deleting the last project', () => {
      const config: Config = {
        activeProjectId: 'proj-1',
        projects: [{ id: 'proj-1', name: 'Only Project' }]
      }

      expect(validateDeletion(config, 'proj-1')).toBe('Cannot delete the last project')
    })

    it('prevents deleting the active project', () => {
      const config: Config = {
        activeProjectId: 'proj-1',
        projects: [
          { id: 'proj-1', name: 'Active' },
          { id: 'proj-2', name: 'Other' }
        ]
      }

      expect(validateDeletion(config, 'proj-1')).toBe('Cannot delete the active project')
    })

    it('allows deleting non-active project when multiple exist', () => {
      const config: Config = {
        activeProjectId: 'proj-1',
        projects: [
          { id: 'proj-1', name: 'Active' },
          { id: 'proj-2', name: 'Other' }
        ]
      }

      expect(validateDeletion(config, 'proj-2')).toBeNull()
    })
  })

  describe('folder name collision resolution', () => {
    function resolveCollision(baseName: string, existingFolders: Set<string>): string {
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

    it('appends incrementing counter for collisions', () => {
      expect(resolveCollision('my-project', new Set(['my-project']))).toBe('my-project-1')
      expect(resolveCollision('my-project', new Set(['my-project', 'my-project-1', 'my-project-2']))).toBe('my-project-3')
    })
  })
})
