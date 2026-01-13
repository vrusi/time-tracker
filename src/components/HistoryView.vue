<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { TimeEntry, Issue, DayGroup } from '../types'
import { useIssuesStore } from '../stores/issues.store'
import { RCard, RButton, RInput, RText, RSpace, RList, RListItem, RDialog, RFormItem, RSelect } from 'roughness'
import Icon from './Icon.vue'

const issuesStore = useIssuesStore()

const entries = ref<(TimeEntry & { issue: Issue })[]>([])
const isLoading = ref(false)

// Date range - default to current month (1st to last day)
const today = new Date()
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)

const startDate = ref(monthStart.toISOString().split('T')[0])
const endDate = ref(monthEnd.toISOString().split('T')[0])

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
const successMessage = ref('')
const addEntryForm = ref({
  issueText: '',
  issueLink: '',
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
    minute: '2-digit',
    hour12: false
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
    issueText: '',
    issueLink: '',
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
  const issueText = addEntryForm.value.issueText.trim()
  if (!issueText) return

  // Find existing issue or create new one
  let issueId: number
  const existingIssue = issuesStore.issues.find(
    i => `${i.externalId} - ${i.name}` === issueText ||
         i.externalId === issueText ||
         i.name === issueText
  )

  if (existingIssue) {
    issueId = existingIssue.id
  } else {
    // Create new issue with the text as name
    const link = addEntryForm.value.issueLink.trim() || null
    // Don't duplicate name as ID - leave ID empty for manual entries
    const newIssue = await issuesStore.createIssue('', issueText, link)
    issueId = newIssue.id
  }

  const startedAt = new Date(`${addEntryForm.value.date}T${addEntryForm.value.startTime}`).toISOString()
  const endedAt = new Date(`${addEntryForm.value.date}T${addEntryForm.value.endTime}`).toISOString()

  await window.electronAPI.createTimeEntry(
    issueId,
    startedAt,
    endedAt,
    addEntryForm.value.notes || undefined
  )

  showAddEntryModal.value = false
  await loadEntries()

  // Show success message
  successMessage.value = 'Entry added successfully'
  setTimeout(() => {
    successMessage.value = ''
  }, 3000)
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

// Expose for parent component
defineExpose({ openAddEntryModal, loadEntries })
</script>

<template>
  <RSpace vertical>
    <!-- Success message -->
    <div v-if="successMessage" class="success-toast">
      {{ successMessage }}
    </div>

    <!-- Date filter -->
    <RCard>
      <template #title>Filter by Date</template>
      <div class="date-filter-row">
        <div class="date-field">
          <label class="date-label">From</label>
          <input
            v-model="startDate"
            type="date"
            class="date-input"
          />
        </div>
        <div class="date-field">
          <label class="date-label">To</label>
          <input
            v-model="endDate"
            type="date"
            class="date-input"
          />
        </div>
      </div>
    </RCard>

    <!-- Loading -->
    <RCard v-if="isLoading">
      <div class="p-8 text-center">
        <RText class="text-secondary">Loading...</RText>
      </div>
    </RCard>

    <!-- Empty state -->
    <RCard v-else-if="groupedEntries.length === 0">
      <div class="p-8 text-center">
        <RText class="text-secondary">No time entries for this period.</RText>
      </div>
    </RCard>

    <!-- Entries grouped by day -->
    <RCard
      v-for="group in groupedEntries"
      :key="group.date"
    >
      <template #title>
        <RSpace justify="between" class="w-full">
          <RText>{{ formatDate(group.date) }}</RText>
          <RText class="text-secondary">Total: {{ formatDuration(group.totalSeconds) }}</RText>
        </RSpace>
      </template>

      <RList>
        <RListItem
          v-for="entry in group.entries"
          :key="entry.id"
          class="entry-item"
        >
          <!-- Edit time mode -->
          <form v-if="editingEntryId === entry.id" @submit.prevent="saveEdit" class="space-y-3 w-full">
            <RSpace>
              <RFormItem label="Start">
                <input
                  v-model="editForm.startedAt"
                  type="datetime-local"
                  class="date-input"
                  required
                />
              </RFormItem>
              <RFormItem label="End">
                <input
                  v-model="editForm.endedAt"
                  type="datetime-local"
                  class="date-input"
                />
              </RFormItem>
              <RSpace class="self-end">
                <RButton type="submit" size="small" filled>Save</RButton>
                <RButton type="button" size="small" @click="cancelEditing">Cancel</RButton>
              </RSpace>
            </RSpace>
          </form>

          <!-- Edit notes mode -->
          <div v-else-if="editingNotesId === entry.id" class="space-y-2 w-full">
            <RText class="text-secondary text-sm">
              <strong>{{ entry.issue.externalId }}</strong> {{ entry.issue.name }}
            </RText>
            <RInput
              v-model="notesForm"
              :lines="4"
              placeholder="Add notes about what you worked on..."
            />
            <RSpace>
              <RButton size="small" filled @click="saveNotes">Save Notes</RButton>
              <RButton size="small" @click="cancelEditingNotes">Cancel</RButton>
            </RSpace>
          </div>

          <!-- Edit issue mode -->
          <form v-else-if="editingIssueId === entry.issue.id" @submit.prevent="saveIssueEdit" class="flex items-center gap-3 w-full">
            <RInput
              v-model="issueEditForm.link"
              placeholder="Issue URL"
              class="w-48"
            />
            <RInput
              v-model="issueEditForm.name"
              placeholder="Name"
              class="flex-1"
            />
            <RButton type="submit" size="small" filled>Save</RButton>
            <RButton type="button" size="small" @click="cancelEditingIssue">Cancel</RButton>
          </form>

          <!-- Normal display mode -->
          <div v-else class="flex items-center gap-4 w-full">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <RText class="font-medium">{{ entry.issue.externalId }}</RText>
                <RText class="text-secondary">{{ entry.issue.name }}</RText>
              </div>
              <RText size="small" class="text-secondary">
                {{ formatTime(entry.startedAt) }} - {{ entry.endedAt ? formatTime(entry.endedAt) : 'ongoing' }}
                <span v-if="entry.pausedReason" class="ml-2">({{ entry.pausedReason }})</span>
              </RText>
              <RText v-if="entry.notes" size="small" class="text-secondary italic block mt-1">
                {{ entry.notes }}
              </RText>
            </div>
            <RText class="font-medium">
              {{ formatDuration(entryDuration(entry)) }}
            </RText>

            <!-- Action buttons -->
            <RSpace>
              <RButton
                size="small"
                @click="startEditingNotes(entry)"
                title="Notes"
              >
                <Icon name="note" :size="16" />
              </RButton>
              <RButton
                size="small"
                @click="startEditing(entry)"
                title="Edit time"
              >
                <Icon name="clock" :size="16" />
              </RButton>
              <RButton
                size="small"
                @click="startEditingIssue(entry)"
                title="Edit issue"
              >
                <Icon name="pencil" :size="16" />
              </RButton>
              <RButton
                v-if="confirmingDeleteId !== entry.id"
                size="small"
                color="error"
                @click="confirmDelete(entry.id)"
                title="Delete"
              >
                <Icon name="delete" :size="16" />
              </RButton>
              <RSpace v-else>
                <RButton size="small" color="error" filled @click="executeDelete(entry.id)" title="Confirm delete">Yes</RButton>
                <RButton size="small" @click="cancelDelete" title="Cancel delete">No</RButton>
              </RSpace>
            </RSpace>
          </div>
        </RListItem>
      </RList>
    </RCard>

    <!-- Add Entry Dialog -->
    <RDialog v-model:open="showAddEntryModal">
      <template #title>Add Manual Entry</template>

      <form @submit.prevent="submitAddEntry" class="dialog-form">
        <div class="form-group">
          <label class="form-label">Issue (select existing or type new)</label>
          <input
            v-model="addEntryForm.issueText"
            list="issue-suggestions"
            class="select-input"
            placeholder="Type issue name or select from list"
            required
          />
          <datalist id="issue-suggestions">
            <option v-for="issue in issuesStore.issues" :key="issue.id" :value="`${issue.externalId} - ${issue.name}`" />
          </datalist>
        </div>

        <div class="form-group">
          <label class="form-label">Link (optional, for new issues)</label>
          <input
            v-model="addEntryForm.issueLink"
            type="text"
            class="select-input"
            placeholder="www.example.com or https://..."
          />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input
              v-model="addEntryForm.date"
              type="date"
              class="date-input"
              required
            />
          </div>
          <div class="form-group">
            <label class="form-label">Start</label>
            <input
              v-model="addEntryForm.startTime"
              type="time"
              class="date-input"
              required
            />
          </div>
          <div class="form-group">
            <label class="form-label">End</label>
            <input
              v-model="addEntryForm.endTime"
              type="time"
              class="date-input"
              required
            />
          </div>
          <div class="form-group duration-display" v-if="addEntryDuration">
            <label class="form-label">Duration</label>
            <span class="duration-value">{{ addEntryDuration }}</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Notes (optional)</label>
          <textarea
            v-model="addEntryForm.notes"
            class="notes-input"
            rows="3"
            placeholder="What did you work on?"
          ></textarea>
        </div>

        <div class="form-actions">
          <RButton type="button" @click="closeAddEntryModal">Cancel</RButton>
          <RButton type="submit" filled :disabled="!addEntryForm.issueText.trim()">Add Entry</RButton>
        </div>
      </form>
    </RDialog>
  </RSpace>
</template>

<style scoped>
.text-secondary {
  color: var(--color-text-secondary);
}

.date-filter-row {
  display: flex;
  justify-content: space-around;
  gap: 2rem;
}

.date-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  max-width: 200px;
}

.date-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.entry-item {
  padding: 0.75rem 0;
}

.date-input,
.select-input {
  padding: 0.5rem 0.75rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
}

.date-input:focus,
.select-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.select-input {
  width: 100%;
}

/* Dialog form styles */
.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.form-row {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
}

.duration-display {
  justify-content: flex-end;
}

.duration-value {
  font-weight: 600;
  padding: 0.5rem 0;
}

.notes-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  resize: vertical;
}

.notes-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.success-toast {
  background: var(--color-success);
  color: white;
  padding: 0.75rem 1rem;
  border-radius: 4px;
  text-align: center;
  font-weight: 500;
}
</style>
