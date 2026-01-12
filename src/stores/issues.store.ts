import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Issue } from '@/types'

export const useIssuesStore = defineStore('issues', () => {
  const issues = ref<Issue[]>([])
  const showArchived = ref(false)
  const isLoading = ref(false)

  const activeIssues = computed(() => issues.value.filter(i => !i.archived))
  const archivedIssues = computed(() => issues.value.filter(i => i.archived))

  const displayedIssues = computed(() =>
    showArchived.value ? issues.value : activeIssues.value
  )

  async function loadIssues() {
    isLoading.value = true
    try {
      issues.value = await window.electronAPI.getIssues(true) // Always load all, filter in frontend
    } finally {
      isLoading.value = false
    }
  }

  async function createIssue(externalId: string, name: string, link: string | null) {
    const newIssue = await window.electronAPI.createIssue({
      externalId,
      name,
      link,
      archived: false
    })
    issues.value.unshift(newIssue)
    return newIssue
  }

  async function archiveIssue(id: number) {
    await window.electronAPI.archiveIssue(id)
    const issue = issues.value.find(i => i.id === id)
    if (issue) issue.archived = true
  }

  async function unarchiveIssue(id: number) {
    await window.electronAPI.unarchiveIssue(id)
    const issue = issues.value.find(i => i.id === id)
    if (issue) issue.archived = false
  }

  return {
    issues,
    showArchived,
    isLoading,
    activeIssues,
    archivedIssues,
    displayedIssues,
    loadIssues,
    createIssue,
    archiveIssue,
    unarchiveIssue
  }
})
