/** Verified set abbreviations in Limitless deck text. Extend only after an import check. */
export const OFFICIAL_SET_CODES: Readonly<Record<string, string>> = {
  sv01: 'SVI', sv02: 'PAL', 'sv04.5': 'PAF', me01: 'MEG', 'me02.5': 'ASC'
}

export const DOTTED_CODE_EVIDENCE: Readonly<Record<string, string>> = {
  'sv04.5': 'https://my.limitlesstcg.com/builder',
  'me02.5': 'https://my.limitlesstcg.com/builder'
}
