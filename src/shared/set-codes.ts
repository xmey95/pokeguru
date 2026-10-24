/** Official abbreviations verified against detailed TCGdex set responses; fallback for older local catalogs. */
export const OFFICIAL_SET_CODES: Readonly<Record<string, string>> = {
  sv01: 'SVI', sv02: 'PAL', sv03: 'OBF', 'sv03.5': 'MEW',
  sv04: 'PAR', 'sv04.5': 'PAF', sv05: 'TEF', sv06: 'TWM',
  'sv06.5': 'SFA', sv07: 'SCR', sv08: 'SSP', 'sv08.5': 'PRE',
  sv09: 'JTG', sv10: 'DRI', 'sv10.5w': 'WHT', 'sv10.5b': 'BLK',
  me01: 'MEG', me02: 'PFL', 'me02.5': 'ASC', me03: 'POR',
  me04: 'CRI', me05: 'PBL', '30th': '30C',
  sve: 'SVE', mee: 'MEE', svp: 'SVP', mep: 'MEP'
}

export const DOTTED_CODE_EVIDENCE: Readonly<Record<string, string>> = {
  'sv04.5': 'https://my.limitlesstcg.com/builder',
  'me02.5': 'https://my.limitlesstcg.com/builder'
}
