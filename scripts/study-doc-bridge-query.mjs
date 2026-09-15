const lookupKeys = { package: 'packages', ownership: 'ownership', intent: 'intents', change: 'changes' }

export const resolveDocBridgeQueryId = (index, queryType, queryId) => {
  if (queryId !== 'auto') return queryId
  const candidates = index?.lookup?.[lookupKeys[queryType]]
  const first = Array.isArray(candidates)
    ? candidates[0]
    : candidates && typeof candidates === 'object'
      ? Object.keys(candidates)[0]
      : undefined
  return typeof first === 'string' && first.length > 0 ? first : undefined
}
