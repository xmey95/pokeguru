import type { DatabaseSync, StatementSync } from 'node:sqlite'

/** Bound to one connection. Only for completed get/all/run calls: a cached
 * iterator could be reset by a second reader while its consumer is suspended. */
export function statementCache(db: DatabaseSync): (sql: string) => StatementSync {
  const statements = new Map<string, StatementSync>()
  return (sql) => {
    const cached = statements.get(sql)
    if (cached) return cached
    const statement = db.prepare(sql)
    if (statements.size >= 128) statements.delete(statements.keys().next().value!)
    statements.set(sql, statement)
    return statement
  }
}
