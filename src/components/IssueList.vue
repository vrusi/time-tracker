<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useIssuesStore } from '../stores/issues.store'
import { useTrackerStore } from '../stores/tracker.store'
import { useSettingsStore } from '../stores/settings.store'
import type { Issue } from '../types'
import { RCard, RButton, RInput, RText, RSpace, RList, RListItem, RDialog } from 'roughness'
import Icon from './Icon.vue'

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
  <RCard>
    <template #title>
      <RSpace align="center" justify="between" class="w-full">
        <RText>Issues</RText>
        <RSpace>
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
        <div v-else-if="editingNotesId === issue.id" class="space-y-2 w-full">
          <RText class="text-secondary text-sm">
            <strong>{{ issue.externalId }}</strong> {{ issue.name }}
          </RText>
          <RInput
            v-model="notesForm"
            :lines="4"
            placeholder="Add notes about this issue..."
          />
          <RSpace>
            <RButton size="small" filled @click="saveNotes">Save Notes</RButton>
            <RButton size="small" @click="cancelEditingNotes">Cancel</RButton>
          </RSpace>
        </div>

        <!-- Normal display mode -->
        <div v-else class="flex items-center gap-4 w-full">
          <!-- Play/Pause button -->
          <RButton
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

          <!-- Action buttons -->
          <RSpace>
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
              :filled="!!issue.notes"
              @click="startEditingNotes(issue)"
              :title="issue.notes ? 'View/edit notes' : 'Add notes'"
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
  </RCard>
</template>

<style scoped>
.text-secondary {
  color: var(--color-text-secondary);
}

.issue-item {
  padding: 0.75rem 0;
}
</style>
