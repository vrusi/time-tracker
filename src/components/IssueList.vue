<script setup lang="ts">
import { ref, watch, inject } from 'vue'
import { useIssuesStore } from '../stores/issues.store'
import { useTrackerStore } from '../stores/tracker.store'
import { useSettingsStore } from '../stores/settings.store'
import type { Issue, TimeEntry } from '../types'
import { RCard, RButton, RInput, RText, RSpace, RList, RListItem, RDialog } from 'roughness'
import Icon from './Icon.vue'

const issuesStore = useIssuesStore()
const trackerStore = useTrackerStore()
const settingsStore = useSettingsStore()
const refreshProgress = inject<() => void>('refreshProgress')

const issueTimes = ref<Map<number, number>>(new Map())
const editingIssue = ref<Issue | null>(null)
const editForm = ref({ name: '', link: '' })
const confirmingDeleteId = ref<number | null>(null)

// Bulk delete state
const selectionMode = ref(false)
const selectedIds = ref<Set<number>>(new Set())
const showBulkDeleteConfirm = ref(false)

// Merge state
const mergingIssueId = ref<number | null>(null)

// Notes state
const editingNotesId = ref<number | null>(null)
const notesForm = ref('')
const workLogEntries = ref<TimeEntry[]>([])

async function loadIssueTimes() {
  for (const issue of issuesStore.issues) {
    const seconds = await window.electronAPI.getIssueTime(issue.id)
    issueTimes.value.set(issue.id, seconds)
  }
}

// Watch for issues to load and reload times when they change
watch(() => issuesStore.issues, loadIssueTimes, { immediate: true })

// Refresh times when tracking stops (e.g., paused from TrackerStatus)
watch(() => trackerStore.isTracking, (isTracking, wasTracking) => {
  if (wasTracking && !isTracking) {
    loadIssueTimes()
  }
})

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
  refreshProgress?.()
}

// Merge functions
function startMerging(issueId: number) {
  mergingIssueId.value = issueId
}

function cancelMerging() {
  mergingIssueId.value = null
}

async function executeMerge(targetId: number) {
  if (!mergingIssueId.value) return
  await window.electronAPI.mergeIssues(mergingIssueId.value, targetId)
  mergingIssueId.value = null
  await issuesStore.loadIssues()
  await loadIssueTimes()
}

// Notes functions
async function startEditingNotes(issue: Issue) {
  editingNotesId.value = issue.id
  notesForm.value = issue.notes || ''
  // Fetch work log entries for this issue
  workLogEntries.value = await window.electronAPI.getIssueEntries(issue.id)
}

function cancelEditingNotes() {
  editingNotesId.value = null
  workLogEntries.value = []
}

async function saveNotes() {
  if (!editingNotesId.value) return

  await issuesStore.updateIssue(editingNotesId.value, { notes: notesForm.value || null })
  editingNotesId.value = null
  workLogEntries.value = []
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

// Bulk delete functions
function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value) {
    selectedIds.value.clear()
  }
}

function toggleIssue(id: number) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
  selectedIds.value = new Set(selectedIds.value)
}

function toggleAll() {
  const displayedIds = issuesStore.displayedIssues.map(i => i.id)
  const allSelected = displayedIds.every(id => selectedIds.value.has(id))

  if (allSelected) {
    displayedIds.forEach(id => selectedIds.value.delete(id))
  } else {
    displayedIds.forEach(id => selectedIds.value.add(id))
  }
  selectedIds.value = new Set(selectedIds.value)
}

function isAllSelected(): boolean {
  const displayedIds = issuesStore.displayedIssues.map(i => i.id)
  return displayedIds.length > 0 && displayedIds.every(id => selectedIds.value.has(id))
}

async function executeBulkDelete() {
  const idsToDelete = Array.from(selectedIds.value)

  // Stop tracking if any selected issue is currently being tracked
  if (trackerStore.currentIssue && selectedIds.value.has(trackerStore.currentIssue.id)) {
    await trackerStore.pauseTracking()
  }

  if (idsToDelete.length > 0) {
    await window.electronAPI.deleteIssues(idsToDelete)
    await issuesStore.loadIssues()
  }

  showBulkDeleteConfirm.value = false
  selectedIds.value.clear()
  selectionMode.value = false
  refreshProgress?.()
}
</script>

<template>
  <RCard>
    <template #title>
      <RSpace align="center" justify="between" class="w-full">
        <RSpace align="center">
          <RText>Issues</RText>
          <RButton
            size="small"
            :filled="selectionMode"
            @click="toggleSelectionMode"
          >
            {{ selectionMode ? 'Cancel' : 'Select' }}
          </RButton>
          <template v-if="selectionMode">
            <input
              type="checkbox"
              :checked="isAllSelected()"
              @change="toggleAll"
              class="bulk-checkbox"
              title="Select all"
            />
            <RButton
              size="small"
              color="error"
              :disabled="selectedIds.size === 0"
              @click="showBulkDeleteConfirm = true"
            >
              Delete ({{ selectedIds.size }})
            </RButton>
          </template>
        </RSpace>
        <RSpace v-if="!selectionMode">
          <RButton
            :filled="!issuesStore.showArchived"
            size="small"
            @click="issuesStore.showArchived = false"
            title="Show active issues"
          >
            Active
          </RButton>
          <RButton
            :filled="issuesStore.showArchived"
            size="small"
            @click="issuesStore.showArchived = true"
            title="Show archived issues"
          >
            Archived
          </RButton>
        </RSpace>
      </RSpace>
    </template>

    <div v-if="issuesStore.isLoading" class="p-8 text-center">
      <RText class="text-secondary">Loading...</RText>
    </div>

    <div v-else-if="issuesStore.displayedIssues.length === 0" class="p-8 text-center">
      <RText class="text-secondary">No issues yet. Add one above!</RText>
    </div>

    <RList v-else>
      <RListItem
        v-for="issue in issuesStore.displayedIssues"
        :key="issue.id"
        class="issue-item"
      >
        <!-- Edit mode -->
        <form v-if="editingIssue?.id === issue.id" @submit.prevent="saveEdit" class="flex items-center gap-3 w-full">
          <RInput
            v-model="editForm.link"
            placeholder="Issue URL"
            class="w-48"
          />
          <RInput
            v-model="editForm.name"
            placeholder="Name"
            class="flex-1"
          />
          <RButton type="submit" size="small" filled>Save</RButton>
          <RButton type="button" size="small" @click="cancelEditing">Cancel</RButton>
        </form>

        <!-- Notes edit mode -->
        <div v-else-if="editingNotesId === issue.id" class="notes-panel w-full">
          <RText class="text-secondary text-sm">
            <strong>{{ issue.externalId }}</strong> {{ issue.name }}
          </RText>

          <!-- Issue notes -->
          <div class="notes-section">
            <RText size="small" class="section-label">Issue Notes</RText>
            <RInput
              v-model="notesForm"
              :lines="3"
              placeholder="Add notes about this issue..."
            />
          </div>

          <!-- Work log -->
          <div v-if="workLogEntries.some(e => e.notes)" class="notes-section">
            <RText size="small" class="section-label">Work Log</RText>
            <div class="work-log">
              <div
                v-for="entry in workLogEntries.filter(e => e.notes)"
                :key="entry.id"
                class="work-log-entry"
              >
                <RText size="small" class="text-secondary">{{ formatDate(entry.startedAt) }}</RText>
                <RText size="small">{{ entry.notes }}</RText>
              </div>
            </div>
          </div>

          <RSpace>
            <RButton size="small" filled @click="saveNotes">Save</RButton>
            <RButton size="small" @click="cancelEditingNotes">Cancel</RButton>
          </RSpace>
        </div>

        <!-- Normal display mode -->
        <div v-else class="flex items-center gap-4 w-full">
          <!-- Selection checkbox -->
          <input
            v-if="selectionMode"
            type="checkbox"
            :checked="selectedIds.has(issue.id)"
            @change="toggleIssue(issue.id)"
            class="bulk-checkbox"
          />

          <!-- Play/Pause button -->
          <RButton
            v-if="!selectionMode"
            @click="toggleTracking(issue)"
            :disabled="issue.archived"
            :filled="isCurrentlyTracking(issue)"
            :color="isCurrentlyTracking(issue) ? 'error' : 'success'"
            :title="isCurrentlyTracking(issue) ? 'Pause tracking' : 'Start tracking'"
          >
<Icon :name="isCurrentlyTracking(issue) ? 'pause' : 'play'" :size="16" />
          </RButton>

          <!-- Issue info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2">
              <RText class="font-medium">{{ issue.externalId }}</RText>
              <RText class="text-secondary">{{ issue.name }}</RText>
            </div>
            <RText size="small" class="text-secondary">
              Total: {{ formatDuration(issueTimes.get(issue.id) || 0) }}
            </RText>
          </div>

          <!-- Action buttons (hidden in selection mode) -->
          <RSpace v-if="!selectionMode">
            <!-- Link -->
            <RButton
              v-if="issue.link"
              tag="a"
              :href="issue.link"
              target="_blank"
              size="small"
              title="Open in tracker"
              @click.stop
            >
              ↗
            </RButton>

            <!-- Notes -->
            <RButton
              size="small"
              @click="startEditingNotes(issue)"
              title="Notes"
            >
<Icon name="note" :size="16" />
            </RButton>

            <!-- Edit -->
            <RButton
              size="small"
              @click="startEditing(issue)"
              title="Edit"
            >
<Icon name="pencil" :size="16" />
            </RButton>

            <!-- Merge -->
            <div class="merge-wrapper">
              <RButton
                v-if="mergingIssueId !== issue.id"
                size="small"
                @click="startMerging(issue.id)"
                title="Merge into another issue"
              >
                ⤵
              </RButton>
              <div v-else class="merge-select">
                <select @change="(e) => { if ((e.target as HTMLSelectElement).value) executeMerge(Number((e.target as HTMLSelectElement).value)) }" class="merge-dropdown">
                  <option value="">Merge into...</option>
                  <option v-for="target in issuesStore.issues.filter(i => i.id !== issue.id)" :key="target.id" :value="target.id">
                    {{ target.externalId || target.name }}
                  </option>
                </select>
                <RButton size="small" @click="cancelMerging">✕</RButton>
              </div>
            </div>

            <!-- Archive/Restore/Delete -->
            <template v-if="issue.archived">
              <RButton
                size="small"
                @click="issuesStore.unarchiveIssue(issue.id)"
                title="Restore"
              >
                ↩
              </RButton>
              <RButton
                v-if="confirmingDeleteId !== issue.id"
                size="small"
                color="error"
                @click="confirmDelete(issue.id)"
                title="Delete"
              >
<Icon name="delete" :size="16" />
              </RButton>
              <RSpace v-else>
                <RButton size="small" color="error" filled @click="executeDelete(issue.id)" title="Confirm delete">Yes</RButton>
                <RButton size="small" @click="cancelDelete" title="Cancel delete">No</RButton>
              </RSpace>
            </template>
            <RButton
              v-else
              size="small"
              @click="issuesStore.archiveIssue(issue.id)"
              title="Archive"
            >
<Icon name="box" :size="16" />
            </RButton>
          </RSpace>
        </div>
      </RListItem>
    </RList>

    <!-- Bulk Delete Confirmation Dialog -->
    <RDialog v-model:open="showBulkDeleteConfirm">
      <template #title>Delete Issues?</template>
      <RText>
        This will permanently delete {{ selectedIds.size }}
        {{ selectedIds.size === 1 ? 'issue' : 'issues' }} and all their time entries.
        This cannot be undone.
      </RText>
      <RSpace class="modal-actions">
        <RButton @click="showBulkDeleteConfirm = false">Cancel</RButton>
        <RButton color="error" filled @click="executeBulkDelete">Delete</RButton>
      </RSpace>
    </RDialog>
  </RCard>
</template>

<style scoped>
.text-secondary {
  color: var(--color-text-secondary);
}

.issue-item {
  padding: 0.75rem 0;
}

.notes-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.notes-section {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.section-label {
  font-weight: 600;
  color: var(--color-text-secondary);
}

.work-log {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 200px;
  overflow-y: auto;
  padding: 0.5rem;
  background: var(--color-bg-secondary);
  border-radius: 4px;
}

.work-log-entry {
  display: flex;
  flex-direction: column;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

.work-log-entry:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.merge-wrapper {
  position: relative;
}

.merge-select {
  position: absolute;
  right: 0;
  top: 100%;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: var(--color-bg);
  padding: 0.5rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

.merge-dropdown {
  padding: 0.25rem 0.5rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.875rem;
  min-width: 150px;
}

.bulk-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--color-primary);
}

.modal-actions {
  margin-top: 1rem;
  justify-content: flex-end;
}
</style>
