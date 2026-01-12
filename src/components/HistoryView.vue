<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { TimeEntry, Issue, DayGroup } from '../types'
import { useIssuesStore } from '../stores/issues.store'

const issuesStore = useIssuesStore()

const entries = ref<(TimeEntry & { issue: Issue })[]>([])
const isLoading = ref(false)

// Date range - default to current week
const today = new Date()
const weekStart = new Date(today)
weekStart.setDate(today.getDate() - today.getDay())

const startDate = ref(weekStart.toISOString().split('T')[0])
const endDate = ref(today.toISOString().split('T')[0])

// Edit state (for time only)
const editingEntryId = ref<number | null>(null)
const editForm = ref({ startedAt: '', endedAt: '' })

// Notes state (separate from time edit)
const editingNotesId = ref<number | null>(null)
const notesForm = ref('')

// Issue edit state
const editingIssueId = ref<number | null>(null)
const issueEditForm = ref({ name: '', link: '' })

// Delete confirmation state
const confirmingDeleteId = ref<number | null>(null)

// Add entry modal state
const showAddEntryModal = ref(false)
const addEntryForm = ref({
  issueId: 0,
  date: today.toISOString().split('T')[0],
  startTime: '09:00',
  endTime: '17:00',
  notes: ''
})

const groupedEntries = computed<DayGroup[]>(() => {
  const groups = new Map<string, DayGroup>()

  entries.value.forEach(entry => {
    const date = entry.startedAt.split('T')[0]

    if (!groups.has(date)) {
      groups.set(date, { date, entries: [], totalSeconds: 0 })
    }

    const group = groups.get(date)!
    group.entries.push(entry)

    const start = new Date(entry.startedAt).getTime()
    const end = entry.endedAt ? new Date(entry.endedAt).getTime() : Date.now()
    group.totalSeconds += (end - start) / 1000
  })

  // Sort by date descending
  return Array.from(groups.values()).sort((a, b) => b.date.localeCompare(a.date))
})

async function loadEntries() {
  isLoading.value = true
  try {
    const start = new Date(startDate.value)
    start.setHours(0, 0, 0, 0)

    const end = new Date(endDate.value)
    end.setHours(23, 59, 59, 999)

    entries.value = await window.electronAPI.getTimeEntries(
      start.toISOString(),
      end.toISOString()
    )
  } finally {
    isLoading.value = false
  }
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })
}

function entryDuration(entry: TimeEntry): number {
  const start = new Date(entry.startedAt).getTime()
  const end = entry.endedAt ? new Date(entry.endedAt).getTime() : Date.now()
  return (end - start) / 1000
}

// Edit functions (time only)
function startEditing(entry: TimeEntry & { issue: Issue }) {
  editingEntryId.value = entry.id
  editForm.value = {
    startedAt: entry.startedAt.slice(0, 16), // Format for datetime-local input
    endedAt: entry.endedAt ? entry.endedAt.slice(0, 16) : ''
  }
}

function cancelEditing() {
  editingEntryId.value = null
}

async function saveEdit() {
  if (!editingEntryId.value) return

  const updates: { startedAt?: string; endedAt?: string } = {}

  if (editForm.value.startedAt) {
    updates.startedAt = new Date(editForm.value.startedAt).toISOString()
  }
  if (editForm.value.endedAt) {
    updates.endedAt = new Date(editForm.value.endedAt).toISOString()
  }

  await window.electronAPI.updateTimeEntry(editingEntryId.value, updates)
  editingEntryId.value = null
  await loadEntries()
}

// Notes functions (separate)
function startEditingNotes(entry: TimeEntry & { issue: Issue }) {
  editingNotesId.value = entry.id
  notesForm.value = entry.notes || ''
}

function cancelEditingNotes() {
  editingNotesId.value = null
}

async function saveNotes() {
  if (!editingNotesId.value) return

  await window.electronAPI.updateTimeEntry(editingNotesId.value, { notes: notesForm.value || undefined })
  editingNotesId.value = null
  await loadEntries()
}

// Issue edit functions
function startEditingIssue(entry: TimeEntry & { issue: Issue }) {
  editingIssueId.value = entry.issue.id
  issueEditForm.value = {
    name: entry.issue.name,
    link: entry.issue.link || ''
  }
}

function cancelEditingIssue() {
  editingIssueId.value = null
}

async function saveIssueEdit() {
  if (!editingIssueId.value) return

  await issuesStore.updateIssue(editingIssueId.value, {
    name: issueEditForm.value.name.trim(),
    link: issueEditForm.value.link.trim() || null
  })
  editingIssueId.value = null
  await loadEntries()
}

// Delete functions
function confirmDelete(entryId: number) {
  confirmingDeleteId.value = entryId
}

function cancelDelete() {
  confirmingDeleteId.value = null
}

async function executeDelete(entryId: number) {
  await window.electronAPI.deleteTimeEntry(entryId)
  confirmingDeleteId.value = null
  await loadEntries()
}

// Add entry functions
function openAddEntryModal() {
  addEntryForm.value = {
    issueId: issuesStore.activeIssues[0]?.id || 0,
    date: today.toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '17:00',
    notes: ''
  }
  showAddEntryModal.value = true
}

function closeAddEntryModal() {
  showAddEntryModal.value = false
}

async function submitAddEntry() {
  if (!addEntryForm.value.issueId) return

  const startedAt = new Date(`${addEntryForm.value.date}T${addEntryForm.value.startTime}`).toISOString()
  const endedAt = new Date(`${addEntryForm.value.date}T${addEntryForm.value.endTime}`).toISOString()

  await window.electronAPI.createTimeEntry(
    addEntryForm.value.issueId,
    startedAt,
    endedAt,
    addEntryForm.value.notes || undefined
  )

  showAddEntryModal.value = false
  await loadEntries()
}

// Computed preview duration for add entry form
const addEntryDuration = computed(() => {
  const start = new Date(`${addEntryForm.value.date}T${addEntryForm.value.startTime}`).getTime()
  const end = new Date(`${addEntryForm.value.date}T${addEntryForm.value.endTime}`).getTime()
  if (isNaN(start) || isNaN(end) || end <= start) return ''
  return formatDuration((end - start) / 1000)
})

watch([startDate, endDate], loadEntries)
onMounted(() => {
  loadEntries()
  issuesStore.loadIssues()
})
</script>

<template>
  <div>
    <!-- Date filter and Add button -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">From</label>
            <input
              v-model="startDate"
              type="date"
              class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">To</label>
            <input
              v-model="endDate"
              type="date"
              class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button
          @click="openAddEntryModal"
          class="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors"
          title="Add a manual time entry"
        >
          + Add Entry
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="bg-white rounded-lg shadow p-8 text-center text-gray-500">
      Loading...
    </div>

    <!-- Empty state -->
    <div v-else-if="groupedEntries.length === 0" class="bg-white rounded-lg shadow p-8 text-center text-gray-500">
      No time entries for this period.
    </div>

    <!-- Entries grouped by day -->
    <div v-else class="space-y-4">
      <div
        v-for="group in groupedEntries"
        :key="group.date"
        class="bg-white rounded-lg shadow overflow-hidden"
      >
        <!-- Day header -->
        <div class="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
          <span class="font-medium text-gray-900">{{ formatDate(group.date) }}</span>
          <span class="text-sm text-gray-500">Total: {{ formatDuration(group.totalSeconds) }}</span>
        </div>

        <!-- Entries -->
        <ul class="divide-y">
          <li
            v-for="entry in group.entries"
            :key="entry.id"
            class="px-4 py-3"
          >
            <!-- Edit time mode -->
            <form v-if="editingEntryId === entry.id" @submit.prevent="saveEdit" class="space-y-3">
              <div class="flex items-center gap-3">
                <div>
                  <label class="block text-xs text-gray-500 mb-1">Start</label>
                  <input
                    v-model="editForm.startedAt"
                    type="datetime-local"
                    class="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label class="block text-xs text-gray-500 mb-1">End</label>
                  <input
                    v-model="editForm.endedAt"
                    type="datetime-local"
                    class="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div class="flex items-center gap-2 self-end">
                  <button type="submit" class="px-3 py-1 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded">Save</button>
                  <button type="button" @click="cancelEditing" class="px-3 py-1 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                </div>
              </div>
            </form>

            <!-- Edit notes mode -->
            <div v-else-if="editingNotesId === entry.id" class="space-y-2">
              <div class="flex items-center gap-2 text-sm text-gray-600">
                <span class="font-medium">{{ entry.issue.externalId }}</span>
                <span>{{ entry.issue.name }}</span>
              </div>
              <textarea
                v-model="notesForm"
                rows="4"
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Add notes about what you worked on..."
              ></textarea>
              <div class="flex items-center gap-2">
                <button @click="saveNotes" class="px-3 py-1 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded">Save Notes</button>
                <button @click="cancelEditingNotes" class="px-3 py-1 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              </div>
            </div>

            <!-- Edit issue mode -->
            <form v-else-if="editingIssueId === entry.issue.id" @submit.prevent="saveIssueEdit" class="flex items-center gap-3">
              <input
                v-model="issueEditForm.link"
                type="url"
                class="w-64 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Issue URL"
              />
              <input
                v-model="issueEditForm.name"
                type="text"
                class="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Name"
                required
              />
              <button type="submit" class="px-3 py-1 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded">Save</button>
              <button type="button" @click="cancelEditingIssue" class="px-3 py-1 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            </form>

            <!-- Normal display mode -->
            <div v-else class="flex items-center gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-gray-900">{{ entry.issue.externalId }}</span>
                  <span class="text-gray-600">{{ entry.issue.name }}</span>
                </div>
                <div class="text-sm text-gray-400">
                  {{ formatTime(entry.startedAt) }} - {{ entry.endedAt ? formatTime(entry.endedAt) : 'ongoing' }}
                  <span v-if="entry.pausedReason" class="ml-2 text-xs">
                    ({{ entry.pausedReason }})
                  </span>
                </div>
                <div v-if="entry.notes" class="mt-1 text-sm text-gray-500 italic">
                  {{ entry.notes }}
                </div>
              </div>
              <span class="text-sm font-medium text-gray-900">
                {{ formatDuration(entryDuration(entry)) }}
              </span>

              <!-- Notes button -->
              <button
                @click="startEditingNotes(entry)"
                :class="[
                  'hover:text-blue-600',
                  entry.notes ? 'text-blue-500' : 'text-gray-400'
                ]"
                :title="entry.notes ? 'View/edit notes' : 'Add notes'"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>

              <!-- Edit time button -->
              <button
                @click="startEditing(entry)"
                class="text-gray-400 hover:text-gray-600"
                title="Edit start/end time"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>

              <!-- Edit issue button -->
              <button
                @click="startEditingIssue(entry)"
                class="text-gray-400 hover:text-gray-600"
                title="Edit issue name/link"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>

              <!-- Delete with confirmation -->
              <div v-if="confirmingDeleteId === entry.id" class="flex items-center gap-2 bg-red-50 px-2 py-1 rounded">
                <span class="text-xs text-red-600">Delete?</span>
                <button
                  @click="executeDelete(entry.id)"
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
                @click="confirmDelete(entry.id)"
                class="text-gray-400 hover:text-red-600"
                title="Delete entry"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <!-- Add Entry Modal -->
    <div
      v-if="showAddEntryModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="closeAddEntryModal"
    >
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div class="px-6 py-4 border-b flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900">Add Manual Entry</h2>
          <button @click="closeAddEntryModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form @submit.prevent="submitAddEntry" class="px-6 py-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Issue</label>
            <select
              v-model="addEntryForm.issueId"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="0" disabled>Select an issue</option>
              <option v-for="issue in issuesStore.activeIssues" :key="issue.id" :value="issue.id">
                {{ issue.externalId }} - {{ issue.name }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              v-model="addEntryForm.date"
              type="date"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input
                v-model="addEntryForm.startTime"
                type="time"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input
                v-model="addEntryForm.endTime"
                type="time"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div v-if="addEntryDuration" class="text-sm text-gray-500">
            Duration: <span class="font-medium">{{ addEntryDuration }}</span>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Notes (optional, markdown)</label>
            <textarea
              v-model="addEntryForm.notes"
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="What did you work on?"
            ></textarea>
          </div>

          <div class="flex justify-end gap-3 pt-2">
            <button
              type="button"
              @click="closeAddEntryModal"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="!addEntryForm.issueId"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors disabled:opacity-50"
            >
              Add Entry
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
