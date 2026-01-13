<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useIssuesStore } from '../stores/issues.store'
import { useTrackerStore } from '../stores/tracker.store'
import { useSettingsStore } from '../stores/settings.store'
import type { Issue } from '../types'
import { RCard, RButton, RText } from 'roughness'

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

const canSubmit = computed(() => link.value.trim() && name.value.trim())

const submitTooltip = computed(() => {
  if (canSubmit.value) {
    return matchedIssue.value
      ? 'Resume tracking existing issue'
      : 'Start tracking this issue'
  }
  const missing: string[] = []
  if (!link.value.trim()) missing.push('issue URL')
  if (!name.value.trim()) missing.push('name')
  return `Enter ${missing.join(' and ')} to start tracking`
})

async function handleSubmit() {
  const url = link.value.trim()
  const issueName = name.value.trim()

  if (!url || !issueName) return

  isSubmitting.value = true
  try {
    let issue: Issue

    if (matchedIssue.value) {
      // Use existing issue
      issue = matchedIssue.value
    } else {
      // Create new issue
      const issueId = settingsStore.extractIssueId(url)
      if (!issueId) {
        alert('Could not extract issue ID from URL. Check your issue tracker settings.')
        return
      }
      issue = await issuesStore.createIssue(issueId, issueName, url)
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
  <RCard>
    <template #title>
      <RText>Start Tracking</RText>
    </template>

    <form @submit.prevent="handleSubmit" class="form-row">
      <div class="url-field">
        <label class="field-label">Issue URL</label>
        <input
          v-model="link"
          type="text"
          placeholder="https://github.com/org/repo/issues/123"
          class="field-input"
        />
      </div>

      <div class="name-field">
        <label class="field-label">Name</label>
        <input
          v-model="name"
          type="text"
          placeholder="Brief description"
          class="field-input"
        />
      </div>

      <span class="submit-wrapper" :title="submitTooltip">
        <RButton
          filled
          type="submit"
          :loading="isSubmitting"
          :disabled="!canSubmit"
        >
          {{ isSubmitting ? 'Starting...' : (matchedIssue ? 'Resume' : 'Start') }}
        </RButton>
      </span>
    </form>
  </RCard>
</template>

<style scoped>
.form-row {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
}

.url-field {
  flex: 2;
  min-width: 0;
}

.name-field {
  flex: 1;
  min-width: 0;
}

.submit-wrapper {
  flex-shrink: 0;
}

.field-label {
  display: block;
  font-size: 0.875rem;
  margin-bottom: 0.25rem;
  color: var(--color-text);
}

.field-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: 1rem;
  box-sizing: border-box;
}

.field-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.field-input::placeholder {
  color: var(--color-text-secondary);
}
</style>
