import type { ProjectsApi } from '../../shared/projects'
import type { DemoProfile } from '../../shared/demo-profile'

declare global {
  interface Window {
    projectsApi: ProjectsApi
    demoApi: { getInfo(): Promise<DemoProfile | null> }
  }
}

export {}
