import { describe, expect, it } from 'vitest'
import { NavigationHistory } from '../src/renderer/src/navigation-history'

describe('session navigation', () => {
  it('keeps selected content and filters, branches after Back, ignores identical destinations', () => {
    const history = new NavigationHistory()
    history.current.route.projectId = 'A'
    const initial = history.current
    history.push({ ...initial.route, tab: 'matchups' }, { opponent: 'gardevoir' }, 'Matchup · Gardevoir')
    history.current.ui.query = 'stored search'
    const guide = history.current
    expect(history.push({ ...guide.route }, { opponent: 'gardevoir' })).toBe(false)
    history.push({ ...guide.route, view: 'catalog' }, { card: 'absol' })
    expect(history.move(-1)).toBe(true)
    expect(history.current).toBe(guide)
    expect(history.current.ui.query).toBe('stored search')
    expect(history.move(1)).toBe(true)
    history.move(-1)
    history.push({ ...guide.route, view: 'ai' })
    expect(history.next).toBeUndefined()
    expect(history.entries.some((entry) => entry.route.view === 'catalog')).toBe(false)
  })
  it('isolates projects, restores remembered views, and caps the session history', () => {
    const history = new NavigationHistory()
    const route = { ...history.current.route, projectId: 'A', tab: 'threads' as const }
    history.push(route, { selected: 'thread-A' })
    history.push({ ...route, projectId: 'B' })
    expect(history.current.ui.selected).toBeUndefined()
    history.push(route)
    expect(history.current.ui.selected).toBe('thread-A')
    for (let index = 0; index < 100; index++) history.push(route, { selected: `thread-${index}` })
    expect(history.entries).toHaveLength(80)
    for (let index = 0; index < 79; index++) expect(history.move(-1)).toBe(true)
    expect(history.move(-1)).toBe(false)
    expect(history.current.ui.selected).toBe('thread-20')
  })
})
