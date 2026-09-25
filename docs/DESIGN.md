# Doc Bridge Design

This guide adapts the AgentsKit homepage visual system to Doc Bridge. The product story remains specific: repository knowledge moves between people and agents, with human review at the boundary. Keep documentation pages calm and readable; homepage effects must never leak into docs or interior routes.

## Principles

- Use the local AgentsKit home and `agentskit/docs/DESIGN.md` as the source of shared brand decisions.
- Prefer hierarchy, space, and typography over decorative panels. Use glass only on focused chrome such as the product header, chat, and footer.
- Make the knowledge handoff visible: source docs → structured context → agent action → reviewable human-owned draft.
- Lead the home with a three-part map: human documentation sources → Doc Bridge → agent context, with agent memory returning as a reviewable draft.
- Keep all interface copy in English and state product claims in terms users can verify.

## Tokens

| Role | Token | Dark value | Use |
| --- | --- | --- | --- |
| Canvas | `--ak-bg` | `#0d1117` | Default homepage background |
| Raised surface | `--ak-surface` | `#161b22` | Code, chat, and handoff surfaces |
| Border | `--ak-border` | `#30363d` | Dividers and quiet outlines |
| Foreground | `--ak-fg` | `#e6edf3` | Primary text |
| Muted | `--ak-muted` | `#8b949e` | Eyebrows and supporting labels |
| Blue | `--ak-blue` | `#58a6ff` | Links and navigation cues |
| Green | `--ak-green` | `#2ea043` | Doc Bridge handoff / verified state |

Use `--bridge-home-*` aliases in the homepage CSS when a component needs a role-specific name. The imported `brand-tokens.css` is generated; do not edit it directly. Keep the documentation theme independent from homepage-only surface styling.

## Type

- Use the system sans stack for home display and body text; use `--ak-font-mono` for commands, technical labels, and compact metrics.
- Headlines use tight tracking and a clear scale; body copy remains comfortable at 16px or larger where it carries explanation.
- Avoid long all-caps text. Eyebrows are short, muted, and letter-spaced.

## Background and glass

- Keep one shared near-black canvas with faint blue and green ambient gradients across the complete home.
- The pointer-reactive liquid cursor reuses the AgentsKit CSS/interaction pattern. It is homepage-only, ignores touch pointers, and is disabled for reduced motion.
- Use translucent surfaces and backdrop blur for the product header, handoff proof, footer, and chat. Borders should remain visible against both the canvas and surface.
- Keep ordinary content sections open on the canvas. Avoid a card around every content group or competing colored section backgrounds.

## Borders and radii

- Use a 24px radius for the primary handoff demonstration and chat window; use 12–16px for compact technical surfaces and controls.
- Prefer one-pixel neutral borders and restrained separators. Primary actions may use a pill shape; secondary actions stay quiet and outlined.

## Motion

- Animate the hero map's connectors to show repository knowledge moving toward agents and memory returning to people. Motion must remain subtle, loop slowly, and preserve readable static content.
- Use short easing for hover/focus transitions. Do not animate documentation content or introduce cursor effects on interior routes.
- Under `prefers-reduced-motion`, remove ambient cursor motion and stop proof animation without hiding information.

## Responsive behavior

- Keep the hero map as three clear columns on desktop and stack its human, bridge, and agent areas on mobile. Hide the desktop connector paths on narrow screens and retain a readable static sequence.
- Collapse principle and flow rows to a single column on narrow screens; keep command blocks horizontally scrollable rather than widening the page.
- Test narrow mobile widths for clipped copy, controls, and horizontal overflow.

## Accessibility

- Maintain WCAG AA contrast for normal text and visible keyboard focus for links and controls.
- Give decorative gradients and motion `aria-hidden`; keep the handoff stages and return path understandable in document order without animation.
- Honor reduced motion. Preserve usable touch targets and keyboard dismissal for navigation and chat.

## Reused components

- `apps/docs/public/ecosystem-bar.js` is kept byte-for-byte aligned with the AgentsKit local source at `agentskit/apps/docs-next/public/ecosystem-bar.js`. Refresh this asset from that source when the shared bar changes; the Doc Bridge page passes its current product identity to the same custom element.
- The home reuses the AgentsKit liquid cursor behavior and brand tokens without adding a UI dependency.
- Install commands use the same tab pattern as AgentsKit and expose one copyable command per package manager.
- The proof terminal follows the AgentsKit demo pattern: colored code tokens, a slowly advancing active step, pause on hover or keyboard focus, manual play/pause, and a static reduced-motion mode.
- The proof terminal reveals demo, index, and resolve output in sequence. Stage tabs are keyboard operable; hover and focus pause the sequence, and reduced-motion users see a static first frame.
- The footer follows the AgentsKit home column layout while keeping Doc Bridge routes, repository links, and ecosystem links. Mark the current product in the Ecosystem column with `aria-current="page"` and a quiet green indicator.
- Product navigation, the animated handoff proof, and chat remain Doc Bridge components with shared visual tokens.
