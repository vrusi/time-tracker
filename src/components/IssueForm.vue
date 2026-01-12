<script setup lang="ts">
import { ref, computed } from 'vue'
import { useIssuesStore } from '../stores/issues.store'
import { useTrackerStore } from '../stores/tracker.store'
import { useSettingsStore } from '../stores/settings.store'
import { RCard, RButton, RText } from 'roughness'

const issuesStore = useIssuesStore()
const trackerStore = useTrackerStore()
const settingsStore = useSettingsStore()

const link = ref('')
const name = ref('')
const isSubmitting = ref(false)

const canSubmit = computed(() => link.value.trim() && name.value.trim())

const submitTooltip = computed(() => {
  if (canSubmit.value) return 'Add issue and start tracking'
  const missing: string[] = []
  if (!link.value.trim()) missing.push('issue URL')
  if (!name.value.trim()) missing.push('name')
  return `Enter ${missing.join(' and ')} to add issue`
})

async function handleSubmit() {
  const url = link.value.trim()
  const issueName = name.value.trim()

  if (!url || !issueName) return

  const issueId = settingsStore.extractIssueId(url)
  if (!issueId) {
    alert('Could not extract issue ID from URL. Check your issue tracker settings.')
    return
  }

  isSubmitting.value = true
  try {
    const newIssue = await issuesStore.createIssue(
      issueId,
      issueName,
      url
    )
    // Auto-start tracking the new issue
    await trackerStore.startTracking(newIssue.id)
    link.value = ''
    name.value = ''
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <RCard>
    <template #title>
      <RText>Add New Issue</RText>
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
          {{ isSubmitting ? 'Adding...' : 'Add Issue' }}
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
