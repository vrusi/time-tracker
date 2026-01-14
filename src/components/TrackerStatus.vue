<script setup lang="ts">
import { ref, watch } from 'vue'
import { useTrackerStore } from '../stores/tracker.store'
import { RCard, RButton, RInput, RBadge, RProgress, RText, RSpace } from 'roughness'
import Icon from './Icon.vue'

const trackerStore = useTrackerStore()

const showNotes = ref(false)
const currentNotes = ref('')

// Save notes to current entry when pausing
async function pauseWithNotes() {
  if (trackerStore.currentEntry && currentNotes.value.trim()) {
    await window.electronAPI.updateTimeEntry(trackerStore.currentEntry.id, {
      notes: currentNotes.value.trim()
    })
  }
  currentNotes.value = ''
  showNotes.value = false
  await trackerStore.pauseTracking()
}

// Reset notes when tracking changes
watch(() => trackerStore.currentEntry?.id, () => {
  currentNotes.value = ''
  showNotes.value = false
})
</script>

<template>
  <RCard class="tracker-hero">
    <!-- Paused state - show last tracked issue -->
    <template v-if="(!trackerStore.isTracking || !trackerStore.currentIssue) && trackerStore.lastTrackedIssue">
      <div class="tracker-row">
        <div class="issue-info">
          <RText class="text-secondary text-sm">{{ trackerStore.lastTrackedIssue.externalId }}</RText>
          <RText class="issue-name">{{ trackerStore.lastTrackedIssue.name }}</RText>
        </div>
        <div class="timer-section">
          <span class="timer-display paused">{{ trackerStore.formattedPausedTime }}</span>
          <span class="status-badge">{{ trackerStore.pauseReason === 'idle' ? 'Idle' : 'Paused' }}</span>
        </div>
        <div class="action-buttons">
          <RButton
            size="small"
            color="success"
            @click="trackerStore.startTracking(trackerStore.lastTrackedIssue!.id)"
            title="Resume tracking"
          >
            <Icon name="play" :size="16" />
          </RButton>
          <RButton
            size="small"
            @click="trackerStore.clearLastTracked()"
            title="Dismiss"
          >
            Clear
          </RButton>
        </div>
      </div>
    </template>

    <!-- Not tracking state (no last issue) -->
    <template v-else-if="!trackerStore.isTracking || !trackerStore.currentIssue">
      <div class="not-tracking">
        <RText class="text-secondary">Not tracking</RText>
        <RText size="small" class="text-secondary">Select an issue below to start</RText>
      </div>
    </template>

    <!-- Actively tracking -->
    <template v-else>
      <div class="tracking-content">
        <div class="tracker-row">
          <div class="issue-info">
            <RText class="text-secondary text-sm">{{ trackerStore.currentIssue.externalId }}</RText>
            <RText class="issue-name">{{ trackerStore.currentIssue.name }}</RText>
          </div>
          <div class="timer-section">
            <span class="timer-display">{{ trackerStore.formattedTime }}</span>
            <span class="status-dot" :class="trackerStore.isIdle && !trackerStore.presenceMode ? 'idle' : 'active'"></span>
          </div>
          <div class="action-buttons">
            <RButton
              size="small"
              :class="['subtle-btn', trackerStore.presenceMode && 'subtle-btn-active']"
              @click="trackerStore.togglePresenceMode()"
              :title="trackerStore.presenceMode ? 'Presence mode ON - idle detection disabled. Click to disable.' : 'Enable presence mode - disables idle detection'"
            >
              <Icon name="presence" :size="16" />
            </RButton>
            <RButton
              size="small"
              :class="['subtle-btn', showNotes && 'subtle-btn-active']"
              @click="showNotes = !showNotes"
              title="Add notes to this time entry (saved when you pause)"
            >
              <Icon name="note" :size="16" />
            </RButton>
            <RButton
              size="small"
              color="error"
              @click="pauseWithNotes"
              title="Stop tracking"
            >
              Pause
            </RButton>
          </div>
        </div>

        <!-- Idle progress bar (when idle) -->
        <div v-if="trackerStore.isIdle && !trackerStore.presenceMode" class="idle-section">
          <div class="idle-header">
            <RText size="small" class="text-warning">
              Idle {{ trackerStore.formattedIdleTime }} - auto-pause in {{ Math.ceil((trackerStore.idleThresholdSeconds - trackerStore.idleSeconds) / 60) }} min
            </RText>
            <RButton size="small" @click="trackerStore.resetIdle()">I'm back</RButton>
          </div>
          <div class="idle-progress-wrapper">
            <RProgress :value="trackerStore.idleProgress / 100" color="warning" />
          </div>
        </div>

        <!-- Notes input -->
        <div v-if="showNotes" class="notes-section">
          <RInput
            v-model="currentNotes"
            :lines="2"
            placeholder="Notes (saved when you pause)"
          />
        </div>
      </div>
    </template>
  </RCard>
</template>

<style scoped>
.tracker-hero {
  --r-card-padding: 0.75rem;
  min-height: 70px;
}

.not-tracking {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
}

.tracker-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.tracking-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.issue-info {
  flex: 1;
  min-width: 0;
}

.issue-name {
  display: block;
}

.timer-display.paused {
  opacity: 0.6;
}

.status-badge {
  font-size: 0.65rem;
  padding: 0.125rem 0.35rem;
  border-radius: 3px;
  text-transform: uppercase;
  font-weight: 500;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
}

.timer-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.timer-display {
  font-family: ui-monospace, monospace;
  font-size: 1.75rem;
  font-weight: bold;
  letter-spacing: 0.05em;
  color: var(--color-text);
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.status-dot.active {
  background-color: var(--color-success);
}

.status-dot.idle {
  background-color: var(--color-warning);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 160px;
  justify-content: flex-end;
}


/* Subtle icon buttons - muted until hover/active */
.subtle-btn {
  opacity: 0.5;
  transition: opacity 0.15s ease;
}

.subtle-btn:hover {
  opacity: 1;
}

.subtle-btn-active {
  opacity: 1;
  --r-button-color: var(--color-warning) !important;
}

/* Pause button - red without stripes */
.pause-btn {
  --r-button-color: var(--color-error) !important;
}

.idle-section {
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
}

.idle-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.idle-progress-wrapper {
  width: 100%;
}

.idle-progress-wrapper :deep(.r-progress) {
  width: 100%;
}

.notes-section {
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
}

.text-secondary {
  color: var(--color-text-secondary);
}

.text-success {
  color: var(--color-success);
}

.text-warning {
  color: var(--color-warning);
}
</style>
