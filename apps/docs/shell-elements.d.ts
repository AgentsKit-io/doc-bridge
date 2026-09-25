import type { DetailedHTMLProps, HTMLAttributes } from 'react'

type AgentsKitShellElementProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  current?: string
  repo?: string
  'data-visual'?: string
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      /** Ecosystem tour, upgraded by the shared shell v1. */
      'agentskit-ecosystem': AgentsKitShellElementProps
      /** Ecosystem footer; server-rendered children are the no-JS fallback. */
      'agentskit-footer': AgentsKitShellElementProps
      /** Fixed, decorative aurora background layer. */
      'agentskit-aurora': AgentsKitShellElementProps
    }
  }
}
