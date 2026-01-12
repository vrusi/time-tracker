<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useIssuesStore } from '../stores/issues.store'
import { useTrackerStore } from '../stores/tracker.store'
import { useSettingsStore } from '../stores/settings.store'
import type { Issue } from '../types'

const issuesStore = useIssuesStore()
const trackerStore = useTrackerStore()
const settingsStore = useSettingsStore()

const issueTimes = ref<Map<number, number>>(new Map())
const editingIssue = ref<Issue | null>(null)
const editForm = ref({ name: '', link: '' })
const confirmingDeleteId = ref<number | null>(null)

// Notes state
const editingNotesId = ref<number | null>(null)
const notesForm = ref('')

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
  const issueId = url ? settingsStore.extractIssueId(url) : editingIssue.value.externalId

  if (url && !issueId) {
    alert('Could not extract issue ID from URL. Check your issue tracker settings.')
    return
  }

  await issuesStore.updateIssue(editingIssue.value.id, {
    externalId: issueId || editingIssue.value.externalId,
    name: editForm.value.name.trim(),
    link: url || null
  })
  editingIssue.value = null
}

function confirmDelete(issueId: number) {
  confirmingDeleteId.value = issueId
}

function cancelDelete() {
  confirmingDeleteId.value = null
}

async function executeDelete(issueId: number) {
  await issuesStore.deleteIssue(issueId)
  confirmingDeleteId.value = null
}

// Notes functions
function startEditingNotes(issue: Issue) {
  editingNotesId.value = issue.id
  notesForm.value = issue.notes || ''
}

function cancelEditingNotes() {
  editingNotesId.value = null
}

async function saveNotes() {
  if (!editingNotesId.value) return

  await issuesStore.updateIssue(editingNotesId.value, { notes: notesForm.value || null })
  editingNotesId.value = null
}
</script>

<template>
  <div class="bg-white rounded-lg shadow">
    <div class="px-4 py-3 border-b flex items-center justify-between">
      <h2 class="text-lg font-medium text-gray-900">Issues</h2>
      <div class="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
        <button
          @click="issuesStore.showArchived = false"
          :class="[
            'px-3 py-1 text-sm font-medium rounded-md transition-colors',
            !issuesStore.showArchived
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          ]"
        >
          Active
        </button>
        <button
          @click="issuesStore.showArchived = true"
          :class="[
            'px-3 py-1 text-sm font-medium rounded-md transition-colors',
            issuesStore.showArchived
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          ]"
        >
          Archived
        </button>
      </div>
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
        class="px-4 py-3 hover:bg-gray-50 transition-colors"
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

        <!-- Notes edit mode -->
        <div v-else-if="editingNotesId === issue.id" class="space-y-2">
          <div class="flex items-center gap-2 text-sm text-gray-600">
            <span class="font-medium">{{ issue.externalId }}</span>
            <span>{{ issue.name }}</span>
          </div>
          <textarea
            v-model="notesForm"
            rows="4"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Add notes about this issue (e.g., investigation findings, handoff notes)..."
          ></textarea>
          <div class="flex items-center gap-2">
            <button @click="saveNotes" class="px-3 py-1 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded">Save Notes</button>
            <button @click="cancelEditingNotes" class="px-3 py-1 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          </div>
        </div>

        <!-- Normal display mode -->
        <div v-else class="flex items-center gap-4">
          <!-- Play/Pause button -->
          <button
            @click="toggleTracking(issue)"
            :disabled="issue.archived"
            :title="isCurrentlyTracking(issue) ? 'Pause tracking' : 'Start tracking this issue'"
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
            title="Open in issue tracker"
            @click.stop
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>

          <!-- Notes button -->
          <button
            @click="startEditingNotes(issue)"
            :class="[
              'hover:text-blue-600',
              issue.notes ? 'text-blue-500' : 'text-gray-400'
            ]"
            :title="issue.notes ? 'View/edit notes' : 'Add notes'"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>

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

          <!-- Archive/Unarchive/Delete buttons -->
          <template v-if="issue.archived">
            <button
              @click="issuesStore.unarchiveIssue(issue.id)"
              class="text-gray-400 hover:text-gray-600"
              title="Restore"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
            <!-- Delete with confirmation -->
            <div v-if="confirmingDeleteId === issue.id" class="flex items-center gap-2 bg-red-50 px-2 py-1 rounded">
              <span class="text-xs text-red-600">Delete?</span>
              <button
                @click="executeDelete(issue.id)"
                class="px-2 py-0.5 text-xs text-white bg-red-500 hover:bg-red-600 rounded"
              >
                Yes
              </button>
              <button
                @click="cancelDelete"
                class="px-2 py-0.5 text-xs text-gray-600 hover:text-gray-800"
              >
                No
              </button>
            </div>
            <button
              v-else
              @click="confirmDelete(issue.id)"
              class="text-red-400 hover:text-red-600"
              title="Delete permanently (removes all tracked time)"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </template>
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
