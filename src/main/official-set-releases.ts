import bundled from './official-set-releases.json'

export const OFFICIAL_SET_RELEASE_SOURCE = bundled.sourceUrl
export const OFFICIAL_SET_RELEASE_VERSION = bundled.version
export const OFFICIAL_SET_RELEASE_CHECKED_AT = bundled.checkedAt

const releases = new Map(bundled.releases.map((entry) => [entry.setId, entry]))

export function officialSetRelease(setId: string): string | null {
  return releases.get(setId)?.releaseDate ?? null
}

export function officialSetReleases(): readonly { setId: string; product: string; releaseDate: string }[] {
  return bundled.releases
}
