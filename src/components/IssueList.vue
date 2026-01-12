<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useIssuesStore } from '../stores/issues.store'
import { useTrackerStore } from '../stores/tracker.store'
import type { Issue } from '../types'

const issuesStore = useIssuesStore()
const trackerStore = useTrackerStore()

const issueTimes = ref<Map<number, number>>(new Map())
const editingIssue = ref<Issue | null>(null)
const editForm = ref({ name: '', link: '' })

function extractIssueId(url: string): string | null {
  const match = url.match(/\/issues\/(\d+)/)
  return match ? `#${match[1]}` : null
}

async function loadIssueTimes() {
  for (const issue of issuesStore.issues) {
    const seconds = await window.electronAPI.getIssueTime(issue.id)
    issueTimes.value.set(issue.id, seconds)
  }
}

onMounted(loadIssueTimes)

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

function isCurrentlyTracking(issue: Issue): boolean {
  return trackerStore.currentIssue?.id === issue.id && trackerStore.isTracking
}

async function toggleTracking(issue: Issue) {
  if (isCurrentlyTracking(issue)) {
    await trackerStore.pauseTracking()
  } else {
    await trackerStore.startTracking(issue.id)
  }
  await loadIssueTimes()
}

function startEditing(issue: Issue) {
  editingIssue.value = issue
  editForm.value = {
    name: issue.name,
    link: issue.link || ''
  }
}

function cancelEditing() {
  editingIssue.value = null
}

async function saveEdit() {
  if (!editingIssue.value) return

  const url = editForm.value.link.trim()
  const issueId = url ? extractIssueId(url) : editingIssue.value.externalId

  if (url && !issueId) {
    alert('Could not extract issue ID from URL')
    return
  }

  await issuesStore.updateIssue(editingIssue.value.id, {
    externalId: issueId || editingIssue.value.externalId,
    name: editForm.value.name.trim(),
    link: url || null
  })
  editingIssue.value = null
}
</script>

<template>
  <div class="bg-white rounded-lg shadow">
    <div class="px-4 py-3 border-b flex items-center justify-between">
      <h2 class="text-lg font-medium text-gray-900">Issues</h2>
      <label class="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          v-model="issuesStore.showArchived"
          class="rounded border-gray-300"
        />
        Show archived
      </label>
    </div>

    <div v-if="issuesStore.isLoading" class="p-8 text-center text-gray-500">
      Loading...
    </div>

    <div v-else-if="issuesStore.displayedIssues.length === 0" class="p-8 text-center text-gray-500">
      No issues yet. Add one above!
    </div>

    <ul v-else class="divide-y">
      <li
        v-for="issue in issuesStore.displayedIssues"
        :key="issue.id"
        :class="[
          'px-4 py-3 hover:bg-gray-50 transition-colors',
          issue.archived && 'opacity-50'
        ]"
      >
        <!-- Edit mode -->
        <form v-if="editingIssue?.id === issue.id" @submit.prevent="saveEdit" class="flex items-center gap-3">
          <input
            v-model="editForm.link"
            type="url"
            class="w-64 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="GitLab URL"
          />
          <input
            v-model="editForm.name"
            type="text"
            class="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Name"
            required
          />
          <button type="submit" class="px-3 py-1 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded">Save</button>
          <button type="button" @click="cancelEditing" class="px-3 py-1 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
        </form>

        <!-- Normal display mode -->
        <div v-else class="flex items-center gap-4">
          <!-- Play/Pause button -->
          <button
            @click="toggleTracking(issue)"
            :disabled="issue.archived"
            :class="[
              'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
              isCurrentlyTracking(issue)
                ? 'bg-red-100 text-red-600 hover:bg-red-200'
                : 'bg-green-100 text-green-600 hover:bg-green-200',
              issue.archived && 'cursor-not-allowed opacity-50'
            ]"
          >
            <svg v-if="isCurrentlyTracking(issue)" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <rect x="5" y="4" width="4" height="12" rx="1" />
              <rect x="11" y="4" width="4" height="12" rx="1" />
            </svg>
            <svg v-else class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
          </button>

          <!-- Issue info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-900">{{ issue.externalId }}</span>
              <span class="text-gray-600 truncate">{{ issue.name }}</span>
            </div>
            <div class="text-sm text-gray-400">
              Total: {{ formatDuration(issueTimes.get(issue.id) || 0) }}
            </div>
          </div>

          <!-- Link -->
          <a
            v-if="issue.link"
            :href="issue.link"
            target="_blank"
            class="text-blue-500 hover:text-blue-600"
            @click.stop
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>

          <!-- Edit button -->
          <button
            @click="startEditing(issue)"
            class="text-gray-400 hover:text-gray-600"
            title="Edit"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>

          <!-- Archive/Unarchive button -->
          <button
            v-if="issue.archived"
            @click="issuesStore.unarchiveIssue(issue.id)"
            class="text-gray-400 hover:text-gray-600"
            title="Unarchive"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button
            v-else
            @click="issuesStore.archiveIssue(issue.id)"
            class="text-gray-400 hover:text-gray-600"
            title="Archive"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
