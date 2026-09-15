/**
 * The bundled templates.
 *
 * They live in a TypeScript module rather than next to it as `.md` files because the package
 * ships `dist/` built by tsup, which bundles source and nothing else: a template on disk is a
 * template the published package does not have. `ak-docs render <name> --print-template` prints
 * one, which is how a project starts an override under `render.templates`.
 *
 * knap syntax, with one rule the syntax does not advertise: a block tag whose output is empty
 * swallows the line break after it, and a block whose output is not empty swallows the line
 * break at its own start instead. So a list is written as `{% for %}` followed by a standalone
 * `{% if not … %}` block for its empty state — exactly one of the two renders, exactly one line
 * break is consumed, and the blank line before the next heading survives either way. A test
 * renders every template through knap's own engine to keep these shapes honest.
 */

export const RENDER_TEMPLATE_NAMES = ['llms.txt', 'area', 'ownership', 'change-digest', 'overlay-review'] as const

export type RenderTemplateName = (typeof RENDER_TEMPLATE_NAMES)[number]

export type RenderTemplateInfo = {
  readonly name: RenderTemplateName
  readonly description: string
  /** What `--data` may point at, in place of the default source. */
  readonly data: string
  /** Whether the output is one Markdown page per unit rather than a single file. */
  readonly multiPage: boolean
  /** Whether the output carries generated-region markers. `llms.txt` is a whole-file artifact with its own consumers and carries none. */
  readonly generatedRegion: boolean
}

export const RENDER_TEMPLATES: Readonly<Record<RenderTemplateName, RenderTemplateInfo>> = {
  'llms.txt': {
    name: 'llms.txt',
    description: 'The curated reading order for agents, as `ak-docs index` writes it',
    data: 'a DocBridgeIndex (.doc-bridge/index.json)',
    multiPage: false,
    generatedRegion: false,
  },
  area: {
    name: 'area',
    description: 'One page per code area: purpose, modules, documents, related areas, checks and open findings',
    data: 'a DocBridgeIndex (.doc-bridge/index.json)',
    multiPage: true,
    generatedRegion: true,
  },
  ownership: {
    name: 'ownership',
    description: 'One sidecar per ownership record: where to start, what to read, what to run',
    data: 'a DocBridgeIndex (.doc-bridge/index.json)',
    multiPage: true,
    generatedRegion: true,
  },
  'change-digest': {
    name: 'change-digest',
    description: 'Entities and documents whose content hash moved since the last scan, and the documents that should have moved with them',
    data: 'the previous discovery snapshot to compare against (default: the last `ak-docs scan`)',
    multiPage: false,
    generatedRegion: true,
  },
  'overlay-review': {
    name: 'overlay-review',
    description: 'Pending agent proposals with their evidence, for a human to judge',
    data: 'an enrichment overlay (default: .doc-bridge/enrich/overlay.json)',
    multiPage: false,
    generatedRegion: true,
  },
}

export const isRenderTemplateName = (value: string): value is RenderTemplateName =>
  (RENDER_TEMPLATE_NAMES as readonly string[]).includes(value)

/*
 * `llms.txt` must stay byte-identical to what the string concatenation produced, including the
 * empty corpus: a preamble, a blank line, the heading, a blank line, the entries and a final
 * newline — which for no entries is `## Knowledge` followed by three line breaks. An empty loop
 * swallows the line break after `{% endfor %}`, so the empty case gets its own block: its three
 * line breaks become two after the closing tag's line is trimmed and one after the block's own
 * trim, which is the one the loop swallowed. The template ends at `{% endif %}` on purpose.
 */
const LLMS_TXT = `{{ preamble }}

## Knowledge

{% for entry in entries %}
- [{{ entry.title }}]({{ entry.url }}){% if entry.description %}: {{ entry.description }}{% endif %}
{% endfor %}
{% if not entries %}


{% endif %}`

const AREA = `{{ region.open }}
# Area \`{{ area.path }}\`

{{ area.purpose }}
{% if area.ownership %}

{{ area.ownership }}
{% endif %}

## Modules

{% for module in area.modules %}
- \`{{ module.path }}\`{% if module.symbols %}: exports {{ module.symbols }}{% endif %}
{% endfor %}
{% if not area.modules %}
No module was observed in this area.
{% endif %}

## Documents

{% for document in area.documents %}
- [{{ document.title }}]({{ document.path }}): {{ document.relation }}
{% endfor %}
{% if not area.documents %}
No document covers or mentions this area.
{% endif %}

## Related areas

{% for related in area.related %}
- \`{{ related.path }}\`: {{ related.direction }}, {{ related.strength }} import(s) — {{ related.evidence }}
{% endfor %}
{% if not area.related %}
No import crosses this area's boundary.
{% endif %}

## Checks

{% for check in area.checks %}
- \`{{ check }}\`
{% endfor %}
{% if not area.checks %}
No check is declared for this area.
{% endif %}
{% if area.checksSource %}

Source: {{ area.checksSource }}.
{% endif %}

## Open findings

{% for finding in area.findings %}
- **{{ finding.code }}** ({{ finding.severity }}, {{ finding.status }}): {{ finding.message }} — \`{{ finding.evidence }}\`
{% endfor %}
{% if not area.findings %}
{{ area.findingsEmpty }}
{% endif %}
{{ region.close }}
`

const OWNERSHIP = `---
type: {{ owner.kind }}
id: {{ owner.id }}
editRoot: {{ owner.path }}
{% if owner.humanDoc %}
humanDoc: {{ owner.humanDoc }}
{% endif %}
---

{{ region.open }}
# {{ owner.id }}

{{ owner.purpose }}

## Start here

{{ owner.startHere }}

## Read before editing

{% for path in owner.readBeforeEditing %}
- {{ path }}
{% endfor %}
{% if not owner.readBeforeEditing %}
Nothing beyond the start page.
{% endif %}

## Edit roots

{% for path in owner.editRoots %}
- \`{{ path }}\`
{% endfor %}

## Checks

{% for check in owner.checks %}
- \`{{ check }}\`
{% endfor %}
{% if not owner.checks %}
No check is declared.
{% endif %}
{% if owner.checksSource %}

Source: {{ owner.checksSource }}.
{% endif %}

## Related areas

{% for related in owner.related %}
- \`{{ related.path }}\`: {{ related.direction }}, {{ related.strength }} import(s) — {{ related.evidence }}
{% endfor %}
{% if not owner.related %}
No import crosses this unit's boundary.
{% endif %}
{{ region.close }}
`

const CHANGE_DIGEST = `{{ region.open }}
# Change digest

Compared the current tree with the previous snapshot: {{ digest.summary }}.

## Changed

{% for entity in digest.changed %}
- \`{{ entity.path }}\` ({{ entity.kind }}): {{ entity.previousHash }} → {{ entity.currentHash }}
{% endfor %}
{% if not digest.changed %}
No file-backed entity changed.
{% endif %}

## Added

{% for entity in digest.added %}
- \`{{ entity.path }}\` ({{ entity.kind }}): {{ entity.currentHash }}
{% endfor %}
{% if not digest.added %}
Nothing was added.
{% endif %}

## Removed

{% for entity in digest.removed %}
- \`{{ entity.path }}\` ({{ entity.kind }}): {{ entity.previousHash }}
{% endfor %}
{% if not digest.removed %}
Nothing was removed.
{% endif %}

## Documentation to review

{% for document in digest.documentsToReview %}
- \`{{ document.path }}\`: {{ document.because }}
{% endfor %}
{% if not digest.documentsToReview %}
No unchanged document covers or mentions a changed entity.
{% endif %}
{{ region.close }}
`

const OVERLAY_REVIEW = `{{ region.open }}
# Overlay review

{% if overlay.present %}
{{ overlay.summary }}

{% for proposal in overlay.pending %}
## {{ proposal.kind }}: \`{{ proposal.entity }}\`

{{ proposal.reason }}

Confidence {{ proposal.confidence }} · proposal \`{{ proposal.proposalId }}\`

{% for item in proposal.evidence %}
- {{ item.link }}
{% endfor %}
{% if not proposal.evidence %}
No evidence was attached to this proposal.
{% endif %}

{% endfor %}
{% if not overlay.pending %}
No proposal is pending review.
{% endif %}
{% else %}
No enrichment overlay exists for this repository. Run \`ak-docs enrich\` to produce one, or pass \`--data <overlay.json>\`.
{% endif %}
{{ region.close }}
`

export const BUNDLED_TEMPLATES: Readonly<Record<RenderTemplateName, string>> = {
  'llms.txt': LLMS_TXT,
  area: AREA,
  ownership: OWNERSHIP,
  'change-digest': CHANGE_DIGEST,
  'overlay-review': OVERLAY_REVIEW,
}
