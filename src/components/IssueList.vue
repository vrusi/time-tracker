<script setup lang="ts">
import { ref, watch, inject } from 'vue'
import { useIssuesStore } from '../stores/issues.store'
import { useTrackerStore } from '../stores/tracker.store'
import { useSettingsStore } from '../stores/settings.store'
import type { Issue, TimeEntry } from '../types'
import { RCard, RButton, RInput, RText, RSpace, RDialog, RPopover } from 'roughness'
import Icon from './Icon.vue'
import IssueForm from './IssueForm.vue'
import { formatDuration } from '@/utils/format'

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

// Actions menu state
const openMenuId = ref<number | null>(null)

// Notes state
const editingNotesId = ref<number | null>(null)
const notesForm = ref('')
const workLogEntries = ref<TimeEntry[]>([])
const noteSavedMessage = ref('')

async function loadIssueTimes() {
  const issueIds = issuesStore.issues.map(i => i.id)
  if (issueIds.length === 0) return

  const times = await window.electronAPI.getIssueTimesBatch(issueIds)
  for (const [id, seconds] of Object.entries(times)) {
    issueTimes.value.set(Number(id), seconds)
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

async function executeDelete() {
  if (!confirmingDeleteId.value) return
  await issuesStore.deleteIssue(confirmingDeleteId.value)
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

// Save notes on blur (without closing the panel)
async function saveNotesOnBlur() {
  if (!editingNotesId.value) return

  await issuesStore.updateIssue(editingNotesId.value, { notes: notesForm.value || null })
  // Show brief confirmation
  noteSavedMessage.value = 'Note saved'
  setTimeout(() => {
    noteSavedMessage.value = ''
  }, 2000)
}

function formatDateTime(isoString: string): string {
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
              @blur="saveNotesOnBlur"
            />
            <div v-if="noteSavedMessage" class="note-saved-toast">
              {{ noteSavedMessage }}
            </div>
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
                <RText size="small" class="text-secondary">{{ formatDateTime(entry.startedAt) }}</RText>
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
          <!-- Top row: checkbox (selection mode) + title + actions + play button -->
          <div class="issue-main">
            <!-- Checkbox for selection mode (left side) -->
            <div v-if="selectionMode" class="checkbox-slot">
              <input
                type="checkbox"
                :checked="selectedIds.has(issue.id)"
                @change="toggleIssue(issue.id)"
                class="bulk-checkbox"
              />
            </div>

            <!-- Issue title and metadata -->
            <div class="issue-info">
              <div class="issue-title">
                <span v-if="issue.externalId" class="issue-id">{{ issue.externalId }}</span>
                <span class="issue-name">{{ issue.name }}</span>
                <span v-if="issue.notes" class="notes-indicator" title="Has notes">
                  <Icon name="note" :size="12" />
                </span>
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

              <!-- Actions dropdown menu -->
              <RPopover
                trigger="click"
                side="bottom"
                align="end"
                :open="openMenuId === issue.id"
                @update:open="(v: boolean) => openMenuId = v ? issue.id : null"
              >
                <template #anchor>
                  <RButton
                    size="small"
                    title="Actions"
                    :disabled="selectionMode"
                    class="menu-trigger"
                  >
                    <span class="menu-dots">⋮</span>
                  </RButton>
                </template>

                <div class="actions-menu">
                  <!-- Notes -->
                  <button class="menu-item" @click="startEditingNotes(issue); openMenuId = null">
                    <Icon name="note" :size="16" />
                    <span>Notes</span>
                  </button>

                  <!-- Edit -->
                  <button class="menu-item" @click="startEditing(issue); openMenuId = null">
                    <Icon name="pencil" :size="16" />
                    <span>Edit</span>
                  </button>

                  <!-- Merge -->
                  <template v-if="mergingIssueId !== issue.id">
                    <button class="menu-item" @click="startMerging(issue.id); openMenuId = null">
                      <span class="menu-icon-text">⤵</span>
                      <span>Merge</span>
                    </button>
                  </template>
                  <div v-else class="merge-select-inline">
                    <select @change="(e) => { if ((e.target as HTMLSelectElement).value) { executeMerge(Number((e.target as HTMLSelectElement).value)); openMenuId = null } }" class="merge-dropdown">
                      <option value="">Merge into...</option>
                      <option v-for="target in issuesStore.issues.filter(i => i.id !== issue.id)" :key="target.id" :value="target.id">
                        {{ target.externalId || target.name }}
                      </option>
                    </select>
                    <button class="menu-item-small" @click="cancelMerging">✕</button>
                  </div>

                  <div class="menu-divider"></div>

                  <!-- Archive/Restore/Delete -->
                  <template v-if="issue.archived">
                    <button class="menu-item" @click="issuesStore.unarchiveIssue(issue.id); openMenuId = null">
                      <span class="menu-icon-text">↩</span>
                      <span>Restore</span>
                    </button>
                    <button class="menu-item menu-item-danger" @click="confirmDelete(issue.id); openMenuId = null">
                      <Icon name="delete" :size="16" />
                      <span>Delete</span>
                    </button>
                  </template>
                  <button
                    v-else
                    class="menu-item"
                    @click="issuesStore.archiveIssue(issue.id); openMenuId = null"
                  >
                    <Icon name="box" :size="16" />
                    <span>Archive</span>
                  </button>
                </div>
              </RPopover>
            </div>

            <!-- Play/Pause button (right side, hidden in selection mode) -->
            <div v-if="!selectionMode" class="play-slot">
              <RButton
                @click="toggleTracking(issue)"
                :disabled="issue.archived"
                :color="isCurrentlyTracking(issue) ? 'error' : 'success'"
                :class="{ 'btn-archived': issue.archived }"
                :title="issue.archived ? 'Restore issue to track' : (isCurrentlyTracking(issue) ? 'Stop tracking' : 'Start tracking')"
              >
                <Icon :name="isCurrentlyTracking(issue) ? 'pause' : 'play'" :size="16" />
              </RButton>
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

    <!-- Single Issue Delete Confirmation Dialog -->
    <RDialog :open="confirmingDeleteId !== null" @update:open="(v: boolean) => !v && cancelDelete()">
      <template #title>Delete Issue?</template>
      <RText>Are you sure? This is forever.</RText>
      <RSpace class="modal-actions">
        <RButton @click="cancelDelete">Cancel</RButton>
        <RButton color="error" filled @click="executeDelete">Delete</RButton>
      </RSpace>
    </RDialog>
  </RCard>
</template>

<style scoped>
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

/* Fixed-width slot for checkbox in selection mode (left side) */
.checkbox-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  flex-shrink: 0;
}

/* Fixed-width slot for play button (right side) */
.play-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  flex-shrink: 0;
  margin-left: 0.5rem;
}

/* Archived issues - grayed out play button */
.btn-archived {
  opacity: 0.3 !important;
  filter: grayscale(1);
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

/* Fade all actions in selection mode */
.action-buttons.selection-mode {
  opacity: 0.2;
  pointer-events: none;
}

/* Menu trigger button */
.menu-trigger {
  opacity: 0.4;
  transition: opacity 0.15s ease;
}

.issue-item:hover .menu-trigger {
  opacity: 1;
}

.menu-dots {
  font-size: 1.25rem;
  line-height: 1;
  font-weight: bold;
}

/* Actions dropdown menu */
.actions-menu {
  display: flex;
  flex-direction: column;
  min-width: 140px;
  padding: 0.25rem 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: none;
  background: none;
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.menu-item:hover {
  background-color: var(--color-bg-secondary, rgba(0, 0, 0, 0.05));
}

.menu-item-danger {
  color: var(--r-color-error, #e53935);
}

.menu-item-danger:hover {
  background-color: rgba(229, 57, 53, 0.1);
}

.menu-icon-text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  font-size: 1rem;
}

.menu-divider {
  height: 1px;
  margin: 0.25rem 0;
  background-color: var(--color-border, rgba(0, 0, 0, 0.1));
}

.merge-select-inline {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
}

.menu-item-small {
  padding: 0.25rem 0.5rem;
  border: none;
  background: none;
  color: var(--color-text);
  font-family: inherit;
  cursor: pointer;
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

.notes-indicator {
  display: inline-flex;
  align-items: center;
  color: var(--color-text-secondary);
  opacity: 0.6;
  margin-left: 0.25rem;
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

.note-saved-toast {
  margin-top: 0.5rem;
  padding: 0.375rem 0.75rem;
  background: var(--color-success);
  color: white;
  border-radius: 4px;
  font-size: 0.875rem;
  text-align: center;
  animation: fadeInOut 2s ease-in-out;
}

@keyframes fadeInOut {
  0% { opacity: 0; }
  10% { opacity: 1; }
  80% { opacity: 1; }
  100% { opacity: 0; }
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

.merge-dropdown {
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.8rem;
  min-width: 120px;
}

.card-title {
  font-weight: 600;
  font-size: 1.1rem;
}

.card-header :deep(.r-button) {
  font-size: 0.8rem;
}

</style>
