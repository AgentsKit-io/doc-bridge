import './theme.css'
// Canvas colors live with the isolated neutral theme, including both contrast palettes.
export const graphTheme = (dark: boolean) => dark
  ? { node: '#c6d5df', selected: '#b4dbf6', edge: '#8995a0', label: '#f0f2f4' }
  : { node: '#53616c', selected: '#174e75', edge: '#68747c', label: '#20262c' }
export const nodeKinds = ['package', 'area', 'document', 'symbol', 'fact', 'decision', 'concept', 'change', 'human-note'] as const
