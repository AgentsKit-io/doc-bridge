export function aliases(values) {
  const seen = new Set()
  return values.filter((value) => {
    if (typeof value !== 'string') return false
    const key = value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
