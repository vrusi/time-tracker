<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useIssuesStore } from '../stores/issues.store'
import { useTrackerStore } from '../stores/tracker.store'
import { useSettingsStore } from '../stores/settings.store'
import type { Issue } from '../types'
import { RButton } from 'roughness'

const issuesStore = useIssuesStore()
const trackerStore = useTrackerStore()
const settingsStore = useSettingsStore()

const link = ref('')
const name = ref('')
const isSubmitting = ref(false)
const matchedIssue = ref<Issue | null>(null)

// Watch link changes to find existing issues
watch(link, (url) => {
  const trimmedUrl = url.trim()
  if (!trimmedUrl) {
    matchedIssue.value = null
    return
  }

  // Check by exact link match first
  let existing = issuesStore.issues.find(i => i.link === trimmedUrl)

  // If no link match, try matching by extracted ID
  if (!existing) {
    const extractedId = settingsStore.extractIssueId(trimmedUrl)
    if (extractedId) {
      existing = issuesStore.issues.find(i => i.externalId === extractedId)
    }
  }

  if (existing) {
    matchedIssue.value = existing
    name.value = existing.name
  } else {
    matchedIssue.value = null
  }
})

const canSubmit = computed(() => name.value.trim())

const submitTooltip = computed(() => {
  if (canSubmit.value) {
    return matchedIssue.value
      ? 'Resume tracking existing issue'
      : 'Start tracking this issue'
  }
  return 'Enter a name to start tracking'
})

async function handleSubmit() {
  const url = link.value.trim() || null
  const issueName = name.value.trim()

  if (!issueName) return

  isSubmitting.value = true
  try {
    let issue: Issue

    if (matchedIssue.value) {
      // Use existing issue
      issue = matchedIssue.value
    } else {
      // Create new issue
      let externalId = ''
      if (url) {
        externalId = settingsStore.extractIssueId(url) || ''
      }
      issue = await issuesStore.createIssue(externalId, issueName, url)
    }

    // Start tracking
    await trackerStore.startTracking(issue.id)
    link.value = ''
    name.value = ''
    matchedIssue.value = null
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="quick-track">
    <span class="form-label">Track something new</span>
    <input
      v-model="link"
      type="text"
      placeholder="URL (optional)"
      class="field-input url-input"
    />
    <input
      v-model="name"
      type="text"
      placeholder="Name"
      class="field-input name-input"
    />
    <span class="submit-wrapper" :title="submitTooltip">
      <RButton
        type="submit"
        size="small"
        color="success"
        :loading="isSubmitting"
        :disabled="!canSubmit"
        :class="{ 'btn-waiting': !canSubmit }"
      >
        {{ isSubmitting ? '...' : (matchedIssue ? 'Resume' : 'Start') }}
      </RButton>
    </span>
  </form>
</template>

<style scoped>
.quick-track {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 0.5rem;
}

.form-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  white-space: nowrap;
  opacity: 0.8;
}

.field-input {
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.8rem;
  box-sizing: border-box;
}

.url-input {
  flex: 1;
  min-width: 0;
}

.name-input {
  flex: 2;
  min-width: 0;
}

.field-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.field-input::placeholder {
  color: var(--color-text-secondary);
  opacity: 0.5;
}

.submit-wrapper {
  flex-shrink: 0;
}

/* Disabled button = waiting, not forbidden */
.btn-waiting :deep(.r-button) {
  text-decoration: none !important;
  opacity: 0.35;
}
</style>
