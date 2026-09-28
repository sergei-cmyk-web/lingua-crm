const MAX_LIMIT = 200

// Клампит page/limit из query: limit ∈ [1, 200], page ≥ 1 — иначе ?limit=999999 обходит пагинацию
export function parsePagination(query: Record<string, unknown>, defaultLimit = 50) {
  const page = Math.max(Math.floor(Number(query.page)) || 1, 1)
  const limit = Math.min(Math.max(Math.floor(Number(query.limit)) || defaultLimit, 1), MAX_LIMIT)
  return { page, limit, skip: (page - 1) * limit }
}
