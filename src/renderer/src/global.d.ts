import type { ProjectsApi } from '../../shared/projects'

declare global {
  interface Window {
    projectsApi: ProjectsApi
  }
}

export {}
