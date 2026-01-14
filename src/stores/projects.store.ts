import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Project } from '../types'

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([])
  const activeProject = ref<Project | null>(null)
  const isLoading = ref(false)

  async function loadProjects() {
    isLoading.value = true
    try {
      const config = await window.electronAPI.getProjects()
      projects.value = config.projects
      activeProject.value = config.projects.find(p => p.id === config.activeProjectId) || null
    } finally {
      isLoading.value = false
    }
  }

  async function createProject(name: string): Promise<Project> {
    const project = await window.electronAPI.createProject(name)
    projects.value.push(project)
    return project
  }

  async function switchProject(id: string): Promise<void> {
    isLoading.value = true
    try {
      const project = await window.electronAPI.switchProject(id)
      activeProject.value = project
    } finally {
      isLoading.value = false
    }
  }

  async function renameProject(id: string, name: string): Promise<void> {
    const project = await window.electronAPI.renameProject(id, name)
    const index = projects.value.findIndex(p => p.id === id)
    if (index !== -1) {
      projects.value[index] = project
    }
    if (activeProject.value?.id === id) {
      activeProject.value = project
    }
  }

  async function deleteProject(id: string): Promise<void> {
    await window.electronAPI.deleteProject(id)
    projects.value = projects.value.filter(p => p.id !== id)
  }

  return {
    projects,
    activeProject,
    isLoading,
    loadProjects,
    createProject,
    switchProject,
    renameProject,
    deleteProject
  }
})
