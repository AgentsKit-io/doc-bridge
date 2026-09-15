import type { EvalSuite } from '@agentskit/eval'

export const suite: EvalSuite = {
  name: 'content-fact-checker',
  cases: [
    { input: 'Complete input for Fact Checker: Facts unverified. Provide full structured output.', expected: (r: string) => r.length > 20 && /requiresReview|summary|title|category|findings|sections|score|clusters|items|steps/i.test(r) },
    { input: 'Minimal input.', expected: (r: string) => /gap|openQuestion/i.test(r) || r.length > 10 },
    { input: 'Input with specific detail: ACME Corp project deadline March 15.', expected: (r: string) => /ACME|March|15/i.test(r) || /gap/i.test(r) },
    { input: 'Empty context — only says "process this".', expected: (r: string) => r.length > 5 },
  ],
}
