/**
 * Shared AgentsKit shell v1 (bar, tour, footer, aurora, product wordmark styles).
 * Hosted by AgentsKit; every ecosystem site loads the same `shell/v1.{css,js}`.
 */
const DEFAULT_SHELL_ORIGIN = 'https://www.agentskit.io'

export const SHELL_ORIGIN = (process.env.NEXT_PUBLIC_AGENTSKIT_SHELL_ORIGIN || DEFAULT_SHELL_ORIGIN).replace(/\/+$/u, '')
export const SHELL_CSS_URL = `${SHELL_ORIGIN}/shell/v1.css`
export const SHELL_JS_URL = `${SHELL_ORIGIN}/shell/v1.js`

export const PRODUCT_ID = 'doc-bridge'
export const PRODUCT_REPO = 'AgentsKit-io/doc-bridge'
