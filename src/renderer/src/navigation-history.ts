export type AppView = 'project' | 'catalog' | 'tournament' | 'ai'
export type ProjectTab = 'deck' | 'threads' | 'matchups'
export interface Route { view: AppView; tab: ProjectTab; projectId: string | null }
export interface LocationState {
  id: number
  route: Route
  label: string
  ui: Record<string, unknown>
}
export const routeLabel = (route: Route): string => route.view === 'project'
  ? ({ deck: 'Lista', threads: 'Thread', matchups: 'Matchup' })[route.tab]
  : ({ catalog: 'Catalogo', tournament: 'Eventi', ai: 'Impostazioni AI' })[route.view]
export const sameRoute = (a: Route, b: Route): boolean => a.view === b.view && (a.view !== 'project' || a.tab === b.tab) && a.projectId === b.projectId

/** Session-only history. UI state is separate from saved domain records and commands. */
export class NavigationHistory {
  entries: LocationState[] = [{ id: 1, route: { view: 'project', tab: 'deck', projectId: null }, label: 'Lista', ui: {} }]
  index = 0
  private sequence = 1
  get current(): LocationState { return this.entries[this.index] }
  get previous(): LocationState | undefined { return this.entries[this.index - 1] }
  get next(): LocationState | undefined { return this.entries[this.index + 1] }
  push(route: Route, patch?: Record<string, unknown>, label?: string): boolean {
    if (sameRoute(route, this.current.route) && (!patch || Object.keys(patch).every((key) => Object.is(patch[key], this.current.ui[key])))) return false
    const remembered = [...this.entries.slice(0, this.index + 1)].reverse().find((entry) => sameRoute(entry.route, route))
    const entry: LocationState = { id: ++this.sequence, route, label: label ?? remembered?.label ?? routeLabel(route), ui: { ...remembered?.ui, ...patch } }
    this.entries = [...this.entries.slice(0, this.index + 1), entry].slice(-80)
    this.index = this.entries.length - 1
    return true
  }
  move(delta: -1 | 1): boolean {
    if (!this.entries[this.index + delta]) return false
    this.index += delta
    return true
  }
}
