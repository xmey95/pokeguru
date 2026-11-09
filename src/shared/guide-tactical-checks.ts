import type { GuideContent, GuideList, GuideScenario, GuideSource, GuideStep } from './matchup-guide'

export interface GuideRetreatCost {
  id: string; context: string; side: 'ours' | 'opponent'; printId: string; printedCost: number
  adjustments: { sourceId: string; amount: number; reason: string }[]
}
export interface GuideReplyComparison {
  coverage?: { direct:string; access:string; defend:string }
  omissionMode?: 'consumption-budget'
  objective: string; threshold: number; minimumReplyId: string | null; preferredReplyId: string
  options: { id: string; sequence: string[]; requiredCards: { printId: string; count: number; access: string }[];
    specificDraws: string[]; attachments: number; terms: number[]; multiplier: number; damage: number;
    reachesThreshold: boolean; remainingHp: number; outcome: string; sourceIds: string[]; steps?: GuideStep[]; intent?: 'attack' | 'defend'; replyTurn?: number; retreatEnergy?:number; promotionRationale?:string; accessProof?:{sourceIds:string[];reason:string}|null }[]
  omissionTests: { printId: string; remainingDamage: number; reason: string; maximumNewCards?:number; terms?:number[];multiplier?:number;witnessReplyId?:string|null }[]
  conclusion: string
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9:._-]{1,160}$/.test(v)
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 4000
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 60
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 10000
const list = (v: unknown, test: (x: unknown) => boolean, max = 30): v is unknown[] => Array.isArray(v) && v.length <= max && v.every(test)
export function validBenchEntries(v: unknown): boolean {
  return v == null || list(v, x => object(x) && id(x.printId) && text(x.description), 8)
}
export function validRetreatCosts(v: unknown): v is GuideRetreatCost[] {
  return list(v, r => object(r) && id(r.id) && text(r.context) && ['ours', 'opponent'].includes(String(r.side)) &&
    id(r.printId) && count(r.printedCost) && list(r.adjustments, a => object(a) && id(a.sourceId) && num(a.amount) && text(a.reason), 12), 20)
}
export function validReplyComparison(v: unknown,maximumConsumptionReplies=8): v is GuideReplyComparison {
  return object(v) && (v.omissionMode===undefined||v.omissionMode==='consumption-budget') && text(v.objective) && num(v.threshold) && Number(v.threshold) > 0 &&
    (v.coverage===undefined||(object(v.coverage)&&id(v.coverage.direct)&&id(v.coverage.access)&&id(v.coverage.defend))) &&
    (v.minimumReplyId === null || id(v.minimumReplyId)) && id(v.preferredReplyId) && text(v.conclusion) &&
    list(v.options, r => object(r) && id(r.id) && list(r.sequence, text, 30) && r.sequence.length > 0 &&
      list(r.requiredCards, c => object(c) && id(c.printId) && count(c.count) && Number(c.count) > 0 && text(c.access)) &&
      list(r.specificDraws, id) && count(r.attachments) && list(r.terms, num) && r.terms.length > 0 &&
      (r.replyTurn===undefined||(count(r.replyTurn)&&r.replyTurn>0)) && (r.retreatEnergy===undefined||count(r.retreatEnergy)) &&
      (r.accessProof==null||(object(r.accessProof)&&text(r.accessProof.reason)&&list(r.accessProof.sourceIds,id,12)&&r.accessProof.sourceIds.length>0)) &&
      num(r.multiplier) && num(r.damage) && typeof r.reachesThreshold === 'boolean' && num(r.remainingHp) &&
      Number(r.remainingHp) >= 0 && text(r.outcome) && list(r.sourceIds, id, 100) && (r.intent === undefined || ['attack','defend'].includes(String(r.intent))) &&
      (r.steps === undefined || list(r.steps, s => object(s) && ['gust', 'active-ko', 'bench-ko', 'promote', 'bench', 'other', 'board-exit'].includes(String(s.action)) && ['ours', 'opponent'].includes(String(s.side)) && text(s.description) && count(s.prizesTaken) && validBenchEntries(s.benchEntries) && [s.before, s.after].every(p => object(p) && count(p.ourBench) && count(p.opponentBench) && count(p.ourPrizes) && count(p.opponentPrizes)), 40)), v.omissionMode==='consumption-budget'?maximumConsumptionReplies:6) && v.options.length >= 2 &&
    list(v.omissionTests, r => object(r) && id(r.printId) && num(r.remainingDamage) && Number(r.remainingDamage) >= 0 && text(r.reason) &&
      (r.maximumNewCards===undefined||count(r.maximumNewCards)) && (r.terms===undefined||list(r.terms,num)) &&
      (r.multiplier===undefined||num(r.multiplier)) && (r.witnessReplyId===undefined||r.witnessReplyId===null||id(r.witnessReplyId)))
}

/** Compile explicitly declared facts only. No inferred card play, text patch or waived error. */
export function compileGuideTactics(content: GuideContent): GuideContent {
  const next = structuredClone(content)
  for (const s of next.scenarios) {
    const indexMap: number[][] = []; let emitted = 0
    s.steps = s.steps.flatMap(step => {
      const entries = step.benchEntries ?? []
      const field = step.side === 'ours' ? 'ourBench' : 'opponentBench'
      const others = (['ourBench', 'opponentBench', 'ourPrizes', 'opponentPrizes'] as const).filter(k => k !== field)
      // A contradictory before/after or a mixed KO/cost event must be rejected, not repaired here.
      if (step.action !== 'bench' || entries.length < 2 || step.prizesTaken !== 0 ||
        step.after[field] - step.before[field] !== entries.length || others.some(k => step.before[k] !== step.after[k])) { indexMap.push([emitted++]); return [step] }
      indexMap.push(entries.map(() => emitted++))
      return entries.map((entry, i) => ({ ...step, description: entry.description,
        groupDescription: i === 0 ? step.description : null, benchEntries: [entry],
        before: { ...step.before, [field]: step.before[field] + i }, after: { ...step.before, [field]: step.before[field] + i + 1 } }))
    })
    for (const d of s.development ?? []) d.stepIndexes = d.stepIndexes.flatMap(i => indexMap[i] ?? [i])
    for (const o of s.replyComparison?.options ?? []) if (o.steps) o.steps = compileGuideTactics({ ...content,
      scenarios: [{ ...s, steps: o.steps, development: undefined, replyComparison: undefined }] }).scenarios[0].steps
    if (s.retreatCosts) {
      // Idempotent over archived compiled drafts. Preserve all non-derived calculations.
      s.calculations = s.calculations.filter(c => !c.retreatCostId)
      for (const r of s.retreatCosts) {
        const terms = [r.printedCost, ...r.adjustments.map(a => a.amount)]
        s.calculations.push({ label: `Ritirata: ${r.context}`, terms, multiplier: 1, minimum: 0,
          expected: Math.max(0, terms.reduce((n, v) => n + v, 0)), retreatCostId: r.id })
      }
    }
  }
  return next
}

export function checkGuideTactics(s: GuideScenario, ours: GuideList, opponent: GuideList | undefined,
  sources: GuideSource[], required: boolean,typedCalculations=false,constructionPrefix=false,comparisonScope:'historical'|'declared-lines'='historical'): string[] {
  const errors: string[] = [], fail = (message: string) => errors.push(`${s.id}: ${message}`)
  const hasSource = (id: string) => sources.some(source => source.id === id)
  for (const step of s.steps) {
    const entries = step.benchEntries ?? []
    if (required && step.action === 'bench' && entries.length !== 1) fail('ogni ingresso in Panchina richiede una carta dichiarata e una transizione atomica.')
    if (entries.length && step.action !== 'bench') fail('ingressi dichiarati fuori da un evento bench.')
    for (const entry of entries) if (!(step.side === 'ours' ? ours : opponent)?.cards.some(c => c.printId === entry.printId) ||
      !s.resources.some(c => c.side === step.side && c.printId === entry.printId && c.count > 0)) fail(`ingresso non disponibile: ${entry.printId}.`)
  }
  if (required && !s.retreatCosts) fail('registro dei costi di ritirata mancante.')
  if (s.retreatCosts) {
    if (new Set(s.retreatCosts.map(r => r.id)).size !== s.retreatCosts.length) fail('ID di ritirata duplicati.')
    for (const r of s.retreatCosts) {
      const source = sources.find(source => source.id === `card:${r.printId}`)
      let printed: unknown
      try { printed = source && JSON.parse(source.content).gameplay?.retreat } catch { /* Missing evidence is an error below. */ }
      if (printed !== r.printedCost || !(r.side === 'ours' ? ours : opponent)?.cards.some(c => c.printId === r.printId)) fail(`${r.id}: costo stampato della ritirata non verificato.`)
      for (const a of r.adjustments) if (!hasSource(a.sourceId)) fail(`${r.id}: fonte del modificatore assente.`)
      const terms = [r.printedCost, ...r.adjustments.map(a => a.amount)]
      const derived = s.calculations.filter(c => c.retreatCostId === r.id)
      if (derived.length !== 1 || JSON.stringify(derived[0].terms) !== JSON.stringify(terms) || derived[0].multiplier !== 1 ||
        derived[0].minimum !== 0 || derived[0].expected !== Math.max(0, terms.reduce((n, v) => n + v, 0))) fail(`${r.id}: formula di ritirata incompleta.`)
    }
    for (const c of s.calculations) if (c.retreatCostId && !s.retreatCosts.some(r => r.id === c.retreatCostId)) fail('formula di ritirata senza costo dichiarato.')
    const verifiedDamage=new Set<GuideScenario['calculations'][number]>()
    if(typedCalculations)for(const c of s.calculations.filter(c=>!c.retreatCostId)){
      if(c.purpose==='damage'){
        let card:any;try{card=JSON.parse(sources.find(s=>s.id===`card:${c.attack?.printId}`)?.content??'null')}catch{/* Gate below. */}
        const events=[...(s.setupLedger?.events??[]),...((s as any).lineEvents??[]),...s.replyComparison?.options.flatMap(o=>(o as any).expandedLineEvents??[])??[]]
        if(!c.attack||!card?.gameplay?.attacks?.some((a:any)=>a.name===c.attack!.attackName)||!events.some((e:any)=>e.attackerPrintId===c.attack!.printId&&e.attackName===c.attack!.attackName))fail('calcolo di danno senza attacco verificato nel registro.')
        else verifiedDamage.add(c)
      }else if(c.purpose!=='other'||c.attack!=null)fail('scopo del calcolo assente o incoerente.')
    }
    if (s.calculations.some(c => /ritirat|retreat/i.test(c.label) && !c.retreatCostId&&!verifiedDamage.has(c))) fail('ritirata da esprimere tramite costo stampato e modificatori, non come risultato precalcolato.')
    if (s.setupLedger?.events.some(e => e.kind === 'retreat') && !s.retreatCosts.length) fail('ritirata nel setup senza calcolo del costo.')
  }
  if (required && !s.replyComparison && !constructionPrefix) fail('confronto delle repliche mancante.')
  const comparison = s.replyComparison
  if (!comparison) return errors
  const options = comparison.options, minimum = options.find(o => o.id === comparison.minimumReplyId)
  if(comparison.omissionMode==='consumption-budget'&&new Set(comparison.omissionTests.map(t=>t.printId)).size!==comparison.omissionTests.length)fail('prove di rimozione duplicate.')
  if(comparison.omissionMode==='consumption-budget'&&!minimum&&comparison.omissionTests.length)fail('prove di rimozione senza replica minima.')
  if (new Set(options.map(o => o.id)).size !== options.length || !options.some(o => o.id === comparison.preferredReplyId)) fail('identificativi delle repliche incoerenti.')
  for (const o of options) {
    if (Math.abs(o.terms.reduce((n, v) => n + v, 0) * o.multiplier - o.damage) > 0.000001 || o.damage < 0) fail(`${o.id}: danno della replica non coerente.`)
    if (o.reachesThreshold !== (o.damage >= comparison.threshold)) fail(`${o.id}: soglia di KO incoerente.`)
    if (new Set(o.requiredCards.map(c => c.printId)).size !== o.requiredCards.length) fail(`${o.id}: risorse della replica duplicate.`)
    for (const c of o.requiredCards) if (!opponent?.cards.some(card => card.printId === c.printId && card.count >= c.count)) fail(`${o.id}: risorsa avversaria non disponibile ${c.printId}.`)
    for (const id of o.specificDraws) if (!opponent?.cards.some(c => c.printId === id)) fail(`${o.id}: pescata non presente nella lista.`)
    if (!o.sourceIds.length || o.sourceIds.some(id => !hasSource(id))) fail(`${o.id}: prove della replica incomplete.`)
  }
  if (options.some(o => o.reachesThreshold) && !minimum?.reachesThreshold) fail('replica sufficiente al KO non identificata.')
  if (comparison.minimumReplyId !== null && !minimum) fail('replica minima assente.')
  if (minimum && !minimum.reachesThreshold) fail('replica minima dichiarata senza raggiungere il KO.')
  if (minimum) {
    const cost = (o: typeof minimum) => [o.specificDraws.length, o.requiredCards.reduce((n, c) => n + c.count, 0), o.attachments,...comparison.omissionMode==='consumption-budget'?[o.retreatEnergy??0]:[]]
    const chosen = cost(minimum)
    if (options.some(o => o.id !== minimum.id && o.reachesThreshold && cost(o).every((n, i) => n <= chosen[i]) && cost(o).some((n, i) => n < chosen[i])))
      fail('una replica sufficiente usa meno risorse/pescate rispetto alla minima dichiarata.')
    // Non-dominance among the actual compared lines is checked above in both
    // contracts. Only the historical claim additionally requires witnesses
    // for removing each consumed resource and a reduced-budget search.
    if(comparisonScope==='historical')for (const card of minimum.requiredCards) if (!comparison.omissionTests.some(t => t.printId === card.printId)) fail(`manca prova di rimozione per ${card.printId}.`)
    for (const test of comparison.omissionTests) {
      if (!minimum.requiredCards.some(c => c.printId === test.printId)) fail(`rimozione di una risorsa non richiesta: ${test.printId}.`)
      if (test.remainingDamage >= comparison.threshold) fail(`il KO resta raggiungibile senza una copia di ${test.printId}: requisito superfluo nella replica minima.`)
      if(comparison.omissionMode==='consumption-budget'){
        const budget=minimum.requiredCards.reduce((n,c)=>n+c.count,0)-1
        if(test.maximumNewCards!==budget||!test.terms?.length||typeof test.multiplier!=='number'||Math.abs(test.terms.reduce((n,v)=>n+v,0)*test.multiplier-test.remainingDamage)>0.000001)fail('formula o budget della prova di rimozione incoerenti.')
        const witness=options.find(o=>o.id===test.witnessReplyId)
        if(test.witnessReplyId!=null&&!witness)fail('identificativo del ramo testimone assente.')
        if(test.remainingDamage>0&&!witness)fail('prova di rimozione positiva senza ramo testimone.')
        if(witness&&(witness.damage!==test.remainingDamage||witness.requiredCards.reduce((n,c)=>n+c.count,0)>budget||
          (witness.requiredCards.find(c=>c.printId===test.printId)?.count??0)>(minimum.requiredCards.find(c=>c.printId===test.printId)?.count??0)-1))fail('ramo testimone fuori dal budget ridotto.')
      }
    }
  }
  return errors
}
