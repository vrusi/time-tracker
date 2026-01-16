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

const timeSinceClose = computed(() => {
  if (!props.recovery) return ''
  return formatDuration(props.recovery.elapsedSinceLastSeenSeconds)
})

const totalElapsed = computed(() => {
  if (!props.recovery) return ''
  return formatDuration(props.recovery.totalElapsedSeconds)
})

const timeAtCloseSeconds = computed(() => {
  if (!props.recovery) return 0
  return Math.max(0, props.recovery.totalElapsedSeconds - props.recovery.elapsedSinceLastSeenSeconds)
})

const timeAtClose = computed(() => {
  return formatDuration(timeAtCloseSeconds.value)
})

// De-emphasize when values are near-zero (< 60 seconds)
const isLowTime = computed(() => timeAtCloseSeconds.value < 60)

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
          You were tracking <strong>{{ recovery.issue.externalId }}</strong> when the app was closed unexpectedly.
        </RText>
        <RText class="text-secondary issue-name">{{ recovery.issue.name }}</RText>
      </div>

      <div class="recovery-stats" :class="{ 'low-time': isLowTime }">
        <div class="stat">
          <span class="stat-label">App closed at</span>
          <span class="stat-value">{{ closedAtFormatted }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Tracked before</span>
          <span class="stat-value">{{ timeAtClose }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Time since close</span>
          <span class="stat-value">{{ timeSinceClose }}</span>
        </div>
      </div>

      <RText class="recovery-question">What should we do with this tracking session?</RText>
    </div>

    <template #footer>
      <RSpace vertical class="w-full" size="small">
        <div class="primary-action">
          <RButton class="w-full" filled @click="handleAction('keep-all')">
            Keep all time ({{ totalElapsed }})
          </RButton>
          <span class="helper-text">Recommended if you were still working</span>
        </div>
        <RButton class="w-full" @click="handleAction('end-at-close')">
          End at close time ({{ timeAtClose }})
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
  min-width: 20rem;
  max-width: 25rem;
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
  border-radius: 0.25rem;
}

/* De-emphasize when tracked time is near-zero */
.recovery-stats.low-time .stat-value {
  color: var(--color-text-secondary);
  font-weight: 500;
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

.recovery-question {
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.w-full {
  width: 100%;
}

.primary-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.helper-text {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

.discard-btn {
  --r-button-color: var(--color-error, #dc3545) !important;
  opacity: 0.8;
}

.discard-btn:hover {
  opacity: 1;
}
</style>
