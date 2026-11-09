import type {GuideBudgetSample} from './guide-request-budget'

/** Only reconciled individual-request counters identify request overhead.
 * Turn totals, missing receipts and a single observed size retain the legacy
 * ratio model. No sample is averaged away and no outlier is discarded. */
export function guideRequestOverhead(samples:GuideBudgetSample[]){
 const valid=samples.filter(s=>s.visibleTokens>0&&s.inputTokens>0)
 if(new Set(valid.map(s=>s.visibleTokens)).size<2||valid.some(s=>s.usageScope!=='codex-turn'||s.requestReconciled!==true||!Number.isSafeInteger(s.requestInputTokens)||s.requestInputTokens!<=0||s.requestInputTokens!>s.inputTokens))return null
 return {model:'request-overhead-v1' as const,overheadTokens:Math.max(0,...valid.map(s=>s.requestInputTokens!-s.visibleTokens)),visibleFactor:1.12,overheadFactor:1.1}
}

/** At every observed size this covers at least 110% of the reconciled input,
 * plus the unchanged 2048-token allowance. New overhead maxima only increase
 * the estimate. It remains an estimate, distinct from service/account quota. */
export function estimateGuideRequestOverhead(visibleTokens:number,model:NonNullable<ReturnType<typeof guideRequestOverhead>>){
 return Math.ceil(visibleTokens*model.visibleFactor+model.overheadTokens*model.overheadFactor)+2048
}
