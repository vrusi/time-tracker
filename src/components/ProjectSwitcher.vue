<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useProjectsStore } from '../stores/projects.store'
import { useIssuesStore } from '../stores/issues.store'
import { useTrackerStore } from '../stores/tracker.store'
import { useSettingsStore } from '../stores/settings.store'
import { RButton, RDialog, RInput, RSpace, RText } from 'roughness'
import Icon from './Icon.vue'

const projectsStore = useProjectsStore()
const issuesStore = useIssuesStore()
const trackerStore = useTrackerStore()
const settingsStore = useSettingsStore()

const showDropdown = ref(false)
const showCreateModal = ref(false)
const showRenameModal = ref(false)
const showDeleteConfirm = ref(false)
const showSwitchConfirm = ref(false)
const pendingSwitchProjectId = ref<string | null>(null)
const newProjectName = ref('')
const renamingProject = ref<{ id: string; name: string } | null>(null)
const deletingProjectId = ref<string | null>(null)

const otherProjects = computed(() => {
  return projectsStore.projects.filter(p => p.id !== projectsStore.activeProject?.id)
})

function openCreateModal() {
  showDropdown.value = false
  newProjectName.value = ''
  showCreateModal.value = true
}

async function createProject() {
  if (!newProjectName.value.trim()) return

  const project = await projectsStore.createProject(newProjectName.value.trim())
  showCreateModal.value = false
  // Auto-switch to new project
  await switchToProject(project.id)
}

function switchToProject(projectId: string) {
  showDropdown.value = false

  // If actively tracking, show confirmation first
  if (trackerStore.isTracking) {
    pendingSwitchProjectId.value = projectId
    showSwitchConfirm.value = true
    return
  }

  doSwitchProject(projectId)
}

async function doSwitchProject(projectId: string) {
  // Clear tracker state before switching (backend pauses, but frontend needs clearing too)
  trackerStore.clearState()
  await projectsStore.switchProject(projectId)
  // Reload all stores with new project data
  await settingsStore.loadSettings()
  await issuesStore.loadIssues()
  await trackerStore.loadCurrentTracking()
}

async function confirmSwitch() {
  if (!pendingSwitchProjectId.value) return

  showSwitchConfirm.value = false
  await doSwitchProject(pendingSwitchProjectId.value)
  pendingSwitchProjectId.value = null
}

function cancelSwitch() {
  showSwitchConfirm.value = false
  pendingSwitchProjectId.value = null
}

function openRenameModal(project: { id: string; name: string }) {
  showDropdown.value = false
  renamingProject.value = { id: project.id, name: project.name }
  showRenameModal.value = true
}

async function renameProject() {
  if (!renamingProject.value || !renamingProject.value.name.trim()) return

  await projectsStore.renameProject(renamingProject.value.id, renamingProject.value.name.trim())
  showRenameModal.value = false
  renamingProject.value = null
}

function confirmDelete(projectId: string) {
  showDropdown.value = false
  deletingProjectId.value = projectId
  showDeleteConfirm.value = true
}

async function deleteProject() {
  if (!deletingProjectId.value) return

  await projectsStore.deleteProject(deletingProjectId.value)
  showDeleteConfirm.value = false
  deletingProjectId.value = null
}

function closeDropdown(e: MouseEvent) {
  // Close dropdown when clicking outside
  const target = e.target as HTMLElement
  if (!target.closest('.project-switcher')) {
    showDropdown.value = false
  }
}

// Close dropdown when clicking outside
if (typeof window !== 'undefined') {
  window.addEventListener('click', closeDropdown)
}

onUnmounted(() => {
  window.removeEventListener('click', closeDropdown)
})
</script>

<template>
  <div class="project-switcher">
    <RButton @click.stop="showDropdown = !showDropdown" class="project-button">
      <span class="project-name">{{ projectsStore.activeProject?.name || 'Select Project' }}</span>
      <span class="dropdown-arrow">{{ showDropdown ? '&#9650;' : '&#9660;' }}</span>
    </RButton>

    <div v-if="showDropdown" class="dropdown-menu">
      <!-- Other projects -->
      <div
        v-for="project in otherProjects"
        :key="project.id"
        class="dropdown-item"
      >
        <span class="item-name" @click="switchToProject(project.id)">{{ project.name }}</span>
        <div class="item-actions">
          <button class="icon-btn" @click.stop="openRenameModal(project)" title="Rename">
            <Icon name="pencil" :size="14" />
          </button>
          <button class="icon-btn danger" @click.stop="confirmDelete(project.id)" title="Delete">
            <Icon name="delete" :size="14" />
          </button>
        </div>
      </div>

      <!-- Current project (rename only) -->
      <div class="dropdown-item current">
        <span class="item-name">{{ projectsStore.activeProject?.name }} (current)</span>
        <div class="item-actions">
          <button
            class="icon-btn"
            @click.stop="openRenameModal(projectsStore.activeProject!)"
            title="Rename"
          >
            <Icon name="pencil" :size="14" />
          </button>
        </div>
      </div>

      <div class="dropdown-divider"></div>

      <!-- New project -->
      <div class="dropdown-item new-project" @click="openCreateModal">
        <span>+ New Project</span>
      </div>
    </div>

    <!-- Create Project Modal -->
    <RDialog v-model:open="showCreateModal">
      <template #title>New Project</template>
      <form @submit.prevent="createProject" class="modal-form">
        <RInput
          v-model="newProjectName"
          placeholder="Project name"
          autofocus
        />
        <RSpace class="modal-actions">
          <RButton type="button" @click="showCreateModal = false">Cancel</RButton>
          <RButton type="submit" filled :disabled="!newProjectName.trim()">Create</RButton>
        </RSpace>
      </form>
    </RDialog>

    <!-- Rename Project Modal -->
    <RDialog v-model:open="showRenameModal">
      <template #title>Rename Project</template>
      <form @submit.prevent="renameProject" class="modal-form">
        <RInput
          v-if="renamingProject"
          v-model="renamingProject.name"
          placeholder="Project name"
          autofocus
        />
        <RSpace class="modal-actions">
          <RButton type="button" @click="showRenameModal = false">Cancel</RButton>
          <RButton type="submit" filled :disabled="!renamingProject?.name.trim()">Rename</RButton>
        </RSpace>
      </form>
    </RDialog>

    <!-- Delete Confirmation -->
    <RDialog v-model:open="showDeleteConfirm">
      <template #title>Delete Project?</template>
      <RText>This will permanently delete the project and all its time entries. This cannot be undone.</RText>
      <RSpace class="modal-actions">
        <RButton @click="showDeleteConfirm = false">Cancel</RButton>
        <RButton color="error" filled @click="deleteProject">Delete</RButton>
      </RSpace>
    </RDialog>

    <!-- Switch While Tracking Confirmation -->
    <RDialog v-model:open="showSwitchConfirm">
      <template #title>Switch Project?</template>
      <RText>
        You're currently tracking <strong>{{ trackerStore.currentIssue?.name }}</strong>.
        Switching projects will stop and save the current session.
      </RText>
      <RSpace class="modal-actions" style="margin-top: 1rem;">
        <RButton @click="cancelSwitch">Cancel</RButton>
        <RButton filled @click="confirmSwitch">Switch</RButton>
      </RSpace>
    </RDialog>
  </div>
</template>

<style scoped>
.project-switcher {
  position: relative;
}

.project-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.project-name {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-arrow {
  font-size: 0.7rem;
  opacity: 0.7;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 0.25rem;
  min-width: 200px;
  background: var(--color-bg);
  border: 2px solid var(--color-border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  overflow: hidden;
}

.dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: background 0.15s;
}

.dropdown-item:hover {
  background: var(--color-bg-secondary);
}

.dropdown-item.current {
  opacity: 0.7;
}

.dropdown-item.current .item-name {
  cursor: default;
}

.dropdown-item.new-project {
  color: var(--color-primary);
  font-weight: 500;
}

.item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-actions {
  display: flex;
  gap: 0.25rem;
  margin-left: 0.5rem;
}

.icon-btn {
  background: none;
  border: none;
  padding: 0.25rem;
  cursor: pointer;
  opacity: 0.6;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover {
  opacity: 1;
  background: var(--color-bg-secondary);
}

.icon-btn.danger:hover {
  color: var(--color-error);
}

.dropdown-divider {
  height: 1px;
  background: var(--color-border);
  margin: 0.25rem 0;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.modal-actions {
  justify-content: flex-end;
}
</style>
