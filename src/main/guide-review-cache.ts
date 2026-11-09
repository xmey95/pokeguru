/** Reuse only complete partitions whose individual calls match the current
 * prompt/config exactly. The reader owns that identity and review validation.
 * All complete matching partitions contribute, so an earlier negative review
 * cannot disappear merely because another partition is also cached. */
export function cachedReviewPartition<T>(ids:string[],stage:string,plans:readonly {stage?:string;groups?:unknown}[],read:(ids:string[],stage:string)=>T|undefined):{groups:string[][];values:T[];partitions:string[][][]} | undefined {
 if(!ids.length||new Set(ids).size!==ids.length)return undefined
 let result:{groups:string[][];values:T[];partitions:string[][][]} | undefined
 const seen=new Set<string>()
 for(const plan of plans){
  if(plan.stage!==stage||!Array.isArray(plan.groups)||plan.groups.length<2||plan.groups.some(g=>!Array.isArray(g)||!g.length||g.some(id=>typeof id!=='string')))continue
  const groups=plan.groups as string[][],flat=groups.flat()
  if(flat.length!==ids.length||flat.some((id,i)=>id!==ids[i]))continue
  const values=groups.map((g,i)=>read([...g],stage+'-part-'+(i+1)))
  if(values.some(v=>v===undefined))continue
  result??={groups:[],values:[],partitions:[]}
  if(groups.length>result.groups.length)result.groups=groups.map(g=>[...g])
  result.partitions.push(groups.map(g=>[...g]))
  for(const [i,value]of values.entries()){
   const key=JSON.stringify([stage+'-part-'+(i+1),groups[i]])
   if(!seen.has(key)){seen.add(key);result.values.push(value as T)}
  }
 }
 return result
}
