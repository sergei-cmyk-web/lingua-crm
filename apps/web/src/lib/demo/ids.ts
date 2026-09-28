let counter = 0

// Идентификатор сущности, созданной посетителем демо — ВСЕГДА начинается с "demo-" (тип сущности
// идёт вторым сегментом, только для читаемости) — merge.ts (mergeSingle) по этому префиксу решает,
// что GET по такому id никогда не найдёт запись на сервере и искать нужно только в оверлее.
// (Раньше `kind` ошибочно передавался как ПОЛНАЯ замена префикса, а не второй сегмент — id вида
// "task-…" не проходил проверку isDemoId, и повторный GET уже созданной сущности 404-ил.)
export function demoId(kind = 'entity'): string {
  counter += 1
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `demo-${kind}-${Date.now().toString(36)}-${counter}-${rand}`
}

export function isDemoId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith('demo-')
}
