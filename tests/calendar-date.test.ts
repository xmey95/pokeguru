import { describe, expect, it } from 'vitest'
import { localCalendarDate } from '../src/shared/calendar-date'

describe('APP-089 local civil date', () => {
  it('uses the local day across UTC midnight in CET and CEST', () => {
    const previous = process.env.TZ
    try {
      process.env.TZ = 'Europe/Rome'
      expect(localCalendarDate(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-02')
      expect(localCalendarDate(new Date('2026-03-29T22:30:00Z'))).toBe('2026-03-30')
      expect(localCalendarDate(new Date('2026-10-25T22:30:00Z'))).toBe('2026-10-25')
    } finally {
      if (previous === undefined) delete process.env.TZ
      else process.env.TZ = previous
    }
  })
})
