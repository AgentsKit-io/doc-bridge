// Recorded from a demo repository walkthrough with ak-docs 2.1.0 and claude-haiku-5-5; outputs are verbatim.
export type DemoRecording = { command: string; exitCode: number; output: string }

export const ask: DemoRecording = {
  command: 'ak-docs ask "How do I send a notification?"',
  exitCode: 0,
  output: `Question: How do I send a notification?
Best match: knowledge sending-notifications (docs/guides/sending-notifications.md)
Matches:
  [knowledge] sending-notifications score=14.164204999999997
    docs/guides/sending-notifications.md
    To send a notification, call \`send\` from \`@demo/notify\`. The function lives in [\`packages/notify/src
  [knowledge] getting-started score=12.448117499999997
    docs/guides/getting-started.md
    \`@demo/notify\` is a tiny notification library. It exposes one function, \`send\`, implemented in [\`pac
  [knowledge] testing score=12.4036125
    docs/guides/testing.md
    Because \`send\` only records messages, tests can assert on the outbox instead of mocking a transport.
Next commands:
ak-docs search "How do I send a notification?" --agent
ak-docs list knowledge --text`,
}

export const drift = {
  before: 'export async function send(to: string, text: string): Promise<SendResult> {',
  after: 'export type Channel = "email" | "sms" | "push";\ninterface SendInput { to: string; text: string; channel: Channel; }\nexport async function send({ to, text, channel }: SendInput): Promise<SendResult> {',
  file: 'packages/notify/src/send.ts',
} as const

/** Lines of the recorded `git diff -U0 -- packages/notify/src/send.ts` after the code change. */
export const driftDiff = {
  command: 'git diff -U0 -- packages/notify/src/send.ts',
  removed: ['export async function send(to: string, text: string): Promise<SendResult> {'],
  added: [
    'export type Channel = "email" | "sms" | "push";',
    'export interface SendInput {',
    '  to: string;',
    '  text: string;',
    '  channel: Channel;',
    '}',
    'export async function send({ to, text, channel }: SendInput): Promise<SendResult> {',
  ],
}

/** docs/guides/sending-notifications.md before the fix, with its real line numbers (from the recorded sources). */
export const guideLines: { line: number; text: string }[] = [
  { line: 8, text: 'To send a notification, call `send` from `@demo/notify`. The function lives in' },
  { line: 9, text: '[`packages/notify/src/send.ts`](../../packages/notify/src/send.ts).' },
  { line: 13, text: '```ts' },
  { line: 14, text: 'import { send } from "@demo/notify";' },
  { line: 15, text: '' },
  { line: 16, text: 'await send("ana@example.com", "Your order has shipped");' },
  { line: 17, text: '```' },
  { line: 19, text: '`send(to, text)` takes two arguments:' },
]

export const blocked: DemoRecording = {
  command: 'ak-docs index',
  exitCode: 1,
  output: `Publication blocked: 3 pending reference finding(s) since base 90525d40ad0d1c43117f9735a919761a6528fcc6.
  CHANGED_REFERENCE docs/guides/testing.md:8 → send
  CHANGED_REFERENCE docs/guides/sending-notifications.md:8 → send
  CHANGED_REFERENCE docs/guides/getting-started.md:9 → send
Fix the cited documentation, or publish anyway with ak-docs index --allow-pending-findings.
Nothing was written: the index and llms.txt stay as they were.`,
}

export const gateBlocked: DemoRecording = {
  command: 'ak-docs gate run reference-findings',
  exitCode: 1,
  output: blocked.output.split('\n').slice(0, 5).join('\n'),
}

export const fixed = {
  gate: { command: 'ak-docs gate run reference-findings', exitCode: 0, output: 'json: ok=true gate=0 pending' },
  index: { command: 'ak-docs index', exitCode: 0, output: 'json: ok=true knowledgeCount=3 contentHash=5d34049412ff' },
} satisfies { gate: DemoRecording; index: DemoRecording }

/**
 * Gate left off: the same drifted checkout with `gates.include` and `gates.referenceFindings` removed.
 * `ak-docs index` publishes the unchanged guides; `ak-docs diff` against the base still reports 3 findings.
 */
export const advisory = {
  index: { command: 'ak-docs index', exitCode: 0, output: 'json: ok=true knowledgeCount=3 contentHash=b47f8b84a195' },
  pendingFindings: 3,
}

export const guideBefore = `import { send } from "@demo/notify";\n\nawait send("ana@example.com", "Your order has shipped");`
export const guideAfter = `import { send } from "@demo/notify";\n\nawait send({\n  to: "ana@example.com",\n  text: "Your order has shipped",\n  channel: "email",\n});`
export const agentAnswerStale = {
  model: 'claude-haiku-5-5',
  code: 'await send("ana@example.com", "Your order has shipped");',
  note: '`send(to, text)` takes two arguments',
  citations: ['docs/guides/sending-notifications.md:8'],
}
export const agentAnswerFixed = {
  model: 'claude-haiku-5-5',
  code: guideAfter.split('\n').slice(2).join('\n'),
  note: '`channel`: one of "email", "sms", or "push"',
  citations: ['docs/guides/sending-notifications.md:8', 'docs/guides/sending-notifications.md:23'],
}
