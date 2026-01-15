<script setup lang="ts">
import { ref, watch, inject } from 'vue'
import { useIssuesStore } from '../stores/issues.store'
import { useTrackerStore } from '../stores/tracker.store'
import { useSettingsStore } from '../stores/settings.store'
import type { Issue, TimeEntry } from '../types'
import { RCard, RButton, RInput, RText, RSpace, RDialog } from 'roughness'
import Icon from './Icon.vue'
import IssueForm from './IssueForm.vue'

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
      <div class="card-header">
        <div class="header-left">
          <span class="card-title">Issues</span>
          <div class="view-toggle">
            <RButton
              size="small"
              :class="{ 'view-active': !issuesStore.showArchived }"
              @click="issuesStore.showArchived = false"
            >
              Active
            </RButton>
            <RButton
              size="small"
              :class="{ 'view-active': issuesStore.showArchived }"
              @click="issuesStore.showArchived = true"
            >
              Archived
            </RButton>
          </div>
        </div>
        <div class="header-right">
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
              Delete{{ selectedIds.size > 0 ? ` (${selectedIds.size})` : '' }}
            </RButton>
          </template>
        </div>
      </div>
    </template>

    <!-- Quick track inline form -->
    <IssueForm />

    <div v-if="issuesStore.isLoading" class="p-8 text-center">
      <RText class="text-secondary">Loading...</RText>
    </div>

    <div v-else-if="issuesStore.displayedIssues.length === 0" class="p-8 text-center">
      <RText class="text-secondary">
        {{ issuesStore.showArchived ? 'Archived issues will appear here.' : 'No issues yet. Add one above!' }}
      </RText>
    </div>

    <div v-else class="issues-list">
      <div
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
        <div v-else class="issue-row">
          <!-- Top row: play button + title + actions (aligned) -->
          <div class="issue-main">
            <!-- Play/Pause button OR Checkbox (same slot) -->
            <div class="play-slot">
              <input
                v-if="selectionMode"
                type="checkbox"
                :checked="selectedIds.has(issue.id)"
                @change="toggleIssue(issue.id)"
                class="bulk-checkbox"
              />
              <RButton
                v-else
                @click="toggleTracking(issue)"
                :disabled="issue.archived"
                :color="isCurrentlyTracking(issue) ? 'error' : 'success'"
                :class="{ 'btn-archived': issue.archived }"
                :title="issue.archived ? 'Restore issue to track' : (isCurrentlyTracking(issue) ? 'Stop tracking' : 'Start tracking')"
              >
                <Icon :name="isCurrentlyTracking(issue) ? 'pause' : 'play'" :size="16" />
              </RButton>
            </div>

            <!-- Issue title and metadata -->
            <div class="issue-info">
              <div class="issue-title">
                <span v-if="issue.externalId" class="issue-id">{{ issue.externalId }}</span>
                <span class="issue-name">{{ issue.name }}</span>
              </div>
              <div class="issue-meta">
                Total: {{ formatDuration(issueTimes.get(issue.id) || 0) }}
              </div>
            </div>

            <!-- Action buttons (always present, faded in selection mode) -->
            <div class="action-buttons" :class="{ 'selection-mode': selectionMode }">
              <!-- Primary action: open link (always visible if exists) -->
              <RButton
                v-if="issue.link"
                tag="a"
                :href="issue.link"
                target="_blank"
                size="small"
                title="Open in tracker"
                @click.stop
                :disabled="selectionMode"
              >
                <span class="link-icon">↗</span>
              </RButton>

              <!-- Secondary actions (visible on hover, disabled in selection mode) -->
              <div class="secondary-actions">
                <!-- Notes -->
                <RButton
                  size="small"
                  @click="startEditingNotes(issue)"
                  title="Notes"
                  :disabled="selectionMode"
                >
                  <Icon name="note" :size="16" />
                </RButton>

                <!-- Edit -->
                <RButton
                  size="small"
                  @click="startEditing(issue)"
                  title="Edit"
                  :disabled="selectionMode"
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
                    :disabled="selectionMode"
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
                    :disabled="selectionMode"
                  >
                    ↩
                  </RButton>
                  <RButton
                    v-if="confirmingDeleteId !== issue.id"
                    size="small"
                    color="error"
                    @click="confirmDelete(issue.id)"
                    title="Delete"
                    :disabled="selectionMode"
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
                  :disabled="selectionMode"
                >
                  <Icon name="box" :size="16" />
                </RButton>
              </div><!-- end secondary-actions -->
            </div>
          </div><!-- end issue-main -->
        </div>
      </div>
    </div>

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

.issues-list {
  display: flex;
  flex-direction: column;
}

.issue-item {
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
}

.issue-item:last-child {
  border-bottom: none;
}

/* Make link icon same size as other icons */
.link-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 1.75rem;
}


.issue-row {
  width: 100%;
}

.issue-main {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
}

/* Fixed-width slot for play button / checkbox */
.play-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  flex-shrink: 0;
  margin: 0 0.5rem;
}

/* Archived issues - grayed out play button */
.btn-archived {
  opacity: 0.3 !important;
  filter: grayscale(1);
}

.action-buttons {
  display: flex;
  align-items: flex-start;
  gap: 0.25rem;
  flex-shrink: 0;
}

/* Fade all actions in selection mode */
.action-buttons.selection-mode {
  opacity: 0.2;
  pointer-events: none;
}

.secondary-actions {
  display: flex;
  gap: 0.25rem;
  opacity: 0.25;
  transition: opacity 0.15s ease;
}

.issue-item:hover .secondary-actions {
  opacity: 1;
}

/* Keep secondary actions faded in selection mode even on hover */
.action-buttons.selection-mode .secondary-actions {
  opacity: 1;
}


/* Issue info styling */
.issue-info {
  flex: 1;
  min-width: 0;
}

.issue-title {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: baseline;
}

.issue-id {
  color: var(--color-text-secondary);
  font-weight: 500;
}

.issue-name {
  color: var(--color-text);
}

.issue-meta {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
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

/* Header styling */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 1rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.card-title {
  font-weight: 600;
  font-size: 1.1rem;
}

.view-toggle {
  display: flex;
  gap: 0.5rem;
}

/* Both buttons look similar, inactive one is faded */
.view-toggle > :not(.view-active) {
  opacity: 0.5;
}

.card-header :deep(.r-button) {
  font-size: 0.8rem;
}

</style>
