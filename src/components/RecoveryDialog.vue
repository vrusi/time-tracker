<script setup lang="ts">
import { computed } from 'vue'
import type { TrackingRecoveryInfo } from '../types'
import { RDialog, RButton, RText, RSpace } from 'roughness'
import { formatDuration } from '../utils/format'

const props = defineProps<{
  open: boolean
  recovery: TrackingRecoveryInfo | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'resolve': [action: 'keep-all' | 'end-at-close' | 'discard']
}>()

const closedAgo = computed(() => {
  if (!props.recovery) return ''
  return formatDuration(props.recovery.elapsedSinceLastSeenSeconds)
})

const totalElapsed = computed(() => {
  if (!props.recovery) return ''
  return formatDuration(props.recovery.totalElapsedSeconds)
})

const timeAtClose = computed(() => {
  if (!props.recovery) return ''
  // Time from entry start to last seen
  const timeAtCloseSeconds = props.recovery.totalElapsedSeconds - props.recovery.elapsedSinceLastSeenSeconds
  return formatDuration(timeAtCloseSeconds)
})

const closedAtFormatted = computed(() => {
  if (!props.recovery) return ''
  const date = new Date(props.recovery.lastSeenAt)
  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
})

function handleAction(action: 'keep-all' | 'end-at-close' | 'discard') {
  emit('resolve', action)
  emit('update:open', false)
}
</script>

<template>
  <RDialog :open="open" @update:open="emit('update:open', $event)">
    <template #title>Recover Tracking Session</template>

    <div class="recovery-content" v-if="recovery">
      <div class="recovery-message">
        <RText>
          You were tracking <strong>{{ recovery.issue.externalId }}</strong> when the app closed.
        </RText>
        <RText class="text-secondary issue-name">{{ recovery.issue.name }}</RText>
      </div>

      <div class="recovery-stats">
        <div class="stat">
          <span class="stat-label">App closed</span>
          <span class="stat-value">{{ closedAtFormatted }}</span>
          <span class="stat-sub">{{ closedAgo }} ago</span>
        </div>
        <div class="stat">
          <span class="stat-label">Tracked before close</span>
          <span class="stat-value">{{ timeAtClose }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Total elapsed</span>
          <span class="stat-value highlight">{{ totalElapsed }}</span>
        </div>
      </div>

      <RText class="recovery-question">How much time should be recorded?</RText>
    </div>

    <template #footer>
      <RSpace vertical class="w-full" size="small">
        <RButton class="w-full" @click="handleAction('end-at-close')">
          End at close time ({{ timeAtClose }})
        </RButton>
        <RButton class="w-full" @click="handleAction('keep-all')">
          Keep all time ({{ totalElapsed }})
        </RButton>
        <RButton class="w-full discard-btn" @click="handleAction('discard')">
          Discard session
        </RButton>
      </RSpace>
    </template>
  </RDialog>
</template>

<style scoped>
.recovery-content {
  min-width: 320px;
  max-width: 400px;
}

.recovery-message {
  margin-bottom: 1.5rem;
}

.recovery-message strong {
  color: var(--color-accent);
}

.issue-name {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.9rem;
}

.text-secondary {
  color: var(--color-text-secondary);
}

.recovery-stats {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--color-bg-secondary);
  border-radius: 4px;
}

.stat {
  flex: 1;
  text-align: center;
}

.stat-label {
  display: block;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-bottom: 0.25rem;
}

.stat-value {
  display: block;
  font-size: 1.1rem;
  font-weight: 600;
}

.stat-value.highlight {
  color: var(--color-accent);
}

.stat-sub {
  display: block;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.recovery-question {
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.w-full {
  width: 100%;
}

.discard-btn {
  opacity: 0.7;
}

.discard-btn:hover {
  opacity: 1;
}
</style>
