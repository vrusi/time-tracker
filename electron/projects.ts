import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'fs'
import { randomUUID } from 'crypto'

export interface Project {
  id: string
  name: string
  dbFile: string
  createdAt: string
}

export interface ProjectsConfig {
  activeProjectId: string
  projects: Project[]
}

const CONFIG_FILE = 'projects.json'
const PROJECTS_DIR = 'projects'
const OLD_DB_NAME = 'time-tracker.db'

function getConfigPath(): string {
  return join(app.getPath('userData'), CONFIG_FILE)
}

function getProjectsDir(): string {
  return join(app.getPath('userData'), PROJECTS_DIR)
}

export function getProjectDbPath(project: Project): string {
  return join(app.getPath('userData'), project.dbFile)
}

export function loadProjectsConfig(): ProjectsConfig {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    // First run - need to migrate or create default
    return migrateOrCreateDefault()
  }

  const data = readFileSync(configPath, 'utf-8')
  return JSON.parse(data)
}

export function saveProjectsConfig(config: ProjectsConfig): void {
  const configPath = getConfigPath()
  writeFileSync(configPath, JSON.stringify(config, null, 2))
}

function migrateOrCreateDefault(): ProjectsConfig {
  const projectsDir = getProjectsDir()
  const oldDbPath = join(app.getPath('userData'), OLD_DB_NAME)

  // Ensure projects directory exists
  if (!existsSync(projectsDir)) {
    mkdirSync(projectsDir, { recursive: true })
  }

  const defaultProject: Project = {
    id: randomUUID(),
    name: 'Default',
    dbFile: join(PROJECTS_DIR, 'default', 'data.db'),
    createdAt: new Date().toISOString()
  }

  const defaultProjectDir = join(projectsDir, 'default')
  if (!existsSync(defaultProjectDir)) {
    mkdirSync(defaultProjectDir, { recursive: true })
  }

  // If old database exists, move it to default project
  if (existsSync(oldDbPath)) {
    const newDbPath = getProjectDbPath(defaultProject)
    renameSync(oldDbPath, newDbPath)
  }

  const config: ProjectsConfig = {
    activeProjectId: defaultProject.id,
    projects: [defaultProject]
  }

  saveProjectsConfig(config)
  return config
}

export function getActiveProject(): Project {
  const config = loadProjectsConfig()
  const project = config.projects.find(p => p.id === config.activeProjectId)
  if (!project) {
    throw new Error('Active project not found')
  }
  return project
}

export function setActiveProject(projectId: string): Project {
  const config = loadProjectsConfig()
  const project = config.projects.find(p => p.id === projectId)
  if (!project) {
    throw new Error('Project not found')
  }
  config.activeProjectId = projectId
  saveProjectsConfig(config)
  return project
}

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function createProject(name: string): Project {
  const config = loadProjectsConfig()
  const projectsDir = getProjectsDir()

  // Generate unique folder name
  let folderName = sanitizeName(name)
  let counter = 1
  while (existsSync(join(projectsDir, folderName))) {
    folderName = `${sanitizeName(name)}-${counter}`
    counter++
  }

  const projectDir = join(projectsDir, folderName)
  mkdirSync(projectDir, { recursive: true })

  const project: Project = {
    id: randomUUID(),
    name,
    dbFile: join(PROJECTS_DIR, folderName, 'data.db'),
    createdAt: new Date().toISOString()
  }

  config.projects.push(project)
  saveProjectsConfig(config)

  return project
}

export function renameProject(projectId: string, newName: string): Project {
  const config = loadProjectsConfig()
  const project = config.projects.find(p => p.id === projectId)
  if (!project) {
    throw new Error('Project not found')
  }

  project.name = newName
  saveProjectsConfig(config)
  return project
}

export function deleteProject(projectId: string): void {
  const config = loadProjectsConfig()
  const projectIndex = config.projects.findIndex(p => p.id === projectId)

  if (projectIndex === -1) {
    throw new Error('Project not found')
  }

  if (config.projects.length === 1) {
    throw new Error('Cannot delete the last project')
  }

  if (config.activeProjectId === projectId) {
    throw new Error('Cannot delete the active project')
  }

  const project = config.projects[projectIndex]
  const dbPath = getProjectDbPath(project)
  const projectDir = dirname(dbPath)

  // Remove project directory and database
  if (existsSync(projectDir)) {
    rmSync(projectDir, { recursive: true })
  }

  config.projects.splice(projectIndex, 1)
  saveProjectsConfig(config)
}
