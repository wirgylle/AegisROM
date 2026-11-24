// Память области операций: последняя выбранная область и какие записи операция уже обработала
// (для «только новые»). Хранится в localStorage этого профиля браузера. Если хранилище
// недоступно, всё работает, просто без памяти.
//
// Operation scope memory: the last chosen scope and which records an operation has already
// processed (for "only new"). Kept in this browser profile's localStorage. If storage is
// unavailable, everything still works, just without memory.

import { emptyScope, type OperationScope, type ScopeOperation } from './operationScope.ts';

const SCOPE_KEY = (op: ScopeOperation) => `aegisrom_scope_last_${op}`;
const DONE_KEY = (op: ScopeOperation) => `aegisrom_scope_done_${op}`;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Короткий отпечаток id (FNV-1a 32), чтобы 10k+ записей занимали ~100 КБ. / Short id fingerprint. */
export function fingerprintId(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function loadLastScope(op: ScopeOperation): OperationScope {
  const s = storage();
  try {
    const raw = s?.getItem(SCOPE_KEY(op));
    if (raw) return { ...emptyScope(), ...JSON.parse(raw) };
  } catch {}
  return emptyScope();
}

export function saveLastScope(op: ScopeOperation, scope: OperationScope): void {
  try {
    // Отдельные игры не запоминаем: в следующий раз выбор обычно другой.
    // Single games are not remembered: next time the pick is usually different.
    storage()?.setItem(SCOPE_KEY(op), JSON.stringify({ ...scope, gameIds: [] }));
  } catch {}
}

function loadDoneSet(op: ScopeOperation): Set<string> {
  try {
    const raw = storage()?.getItem(DONE_KEY(op));
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set();
}

/**
 * Набор «уже обработано» в виде, понятном filterRowsByScope (has по id записи).
 * The "already processed" set in the shape filterRowsByScope expects (has by record id).
 */
export function loadProcessedIds(op: ScopeOperation): ReadonlySet<string> {
  const done = loadDoneSet(op);
  return {
    has: (id: string) => done.has(fingerprintId(id)),
    get size() {
      return done.size;
    },
  } as unknown as ReadonlySet<string>;
}

/** Отметить записи как обработанные операцией. / Mark records as processed by the operation. */
export function markProcessed(op: ScopeOperation, ids: Iterable<string>): void {
  const done = loadDoneSet(op);
  for (const id of ids) done.add(fingerprintId(id));
  try {
    storage()?.setItem(DONE_KEY(op), JSON.stringify(Array.from(done)));
  } catch {}
}

/** Забыть, что операция что-то обрабатывала. / Forget what the operation has processed. */
export function clearProcessed(op: ScopeOperation): void {
  try {
    storage()?.removeItem(DONE_KEY(op));
  } catch {}
}
