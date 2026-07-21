import { ImageResponse } from 'next/og'

export const alt = 'Doc Bridge — one repository, two audiences, zero duplicated truth'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const dynamic = 'force-static'

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: 'stretch',
        background: '#0b0f0d',
        color: '#f4f7f2',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'space-between',
        padding: '64px 72px',
        width: '100%',
      }}
    >
      <div style={{ alignItems: 'center', display: 'flex', fontSize: 28, fontWeight: 650, gap: 18 }}>
        <div style={{ alignItems: 'center', background: '#f4f7f2', borderRadius: 14, color: '#087a45', display: 'flex', fontSize: 22, fontWeight: 750, height: 56, justifyContent: 'center', width: 56 }}>DB</div>
        AgentsKit / Doc Bridge
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ color: '#69e7a2', fontSize: 22, letterSpacing: 4, textTransform: 'uppercase' }}>Code &lt;-&gt; docs &lt;-&gt; humans and agents</div>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 72, fontWeight: 750, letterSpacing: -4, lineHeight: 1.02, maxWidth: 960 }}>
          <span>One repository.</span>
          <span>Two audiences.</span>
          <span style={{ color: '#69e7a2' }}>Zero duplicated truth.</span>
        </div>
      </div>
      <div style={{ color: '#b8bdb8', display: 'flex', fontSize: 24, justifyContent: 'space-between' }}>
        <span>Deterministic handoffs · MCP · freshness gates</span>
        <span>doc-bridge.agentskit.io</span>
      </div>
    </div>,
    size,
  )
}
