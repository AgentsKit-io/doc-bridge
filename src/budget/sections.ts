import { BUDGET_SECTION_ORDER, type BudgetReport, type BudgetSection } from '../schemas/budget.js'
import { compileBudget, TOKEN_METHOD, type BudgetMessage } from './compile.js'

/**
 * One droppable section of a payload: what it contributes, and the payload without it.
 *
 * `content` is what the section costs — the strings a reader would lose — and `strip` removes
 * exactly that from the payload, so the payload with the section stripped and the section's
 * content together are the whole payload. A section whose content is empty is absent from the
 * report rather than reported kept: nothing was there to keep.
 */
export type BudgetedSection<T> = {
  readonly name: BudgetSection
  readonly content: unknown
  readonly strip: (payload: T) => T
}

/** Every message wears the same role, so the role's length never favours one section over another. */
const ROLE = 'user'

const isEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === 'object' && Object.keys(value as object).length === 0) ||
  (typeof value === 'string' && value.length === 0)

/**
 * Trim a payload to a token budget, section by section, in the declared order.
 *
 * Each present section becomes one message, oldest first in the order they may be dropped, and
 * the payload with every section stripped becomes the last message — the one `compileBudget`
 * never drops. The result is the payload with the dropped sections stripped and a report of what
 * it cost, what was dropped and whether it fits. Two calls over the same payload and budget give
 * the same report: the counter is arithmetic over the serialised sections.
 */
export const applyBudget = <T>(payload: T, sections: readonly BudgetedSection<T>[], budgetTokens: number): { readonly payload: T; readonly budget: BudgetReport } => {
  const present = BUDGET_SECTION_ORDER.map((name) => sections.find((section) => section.name === name)).filter(
    (section): section is BudgetedSection<T> => section !== undefined && !isEmpty(section.content),
  )
  const core = present.reduce((value, section) => section.strip(value), payload)
  const messages: BudgetMessage[] = [
    ...present.map((section) => ({ role: ROLE, content: JSON.stringify(section.content) })),
    { role: ROLE, content: JSON.stringify(core) },
  ]
  const compiled = compileBudget({ budget: budgetTokens, messages, keepRecent: 1 })

  const droppedNames = present.slice(0, compiled.dropped.length).map((section) => section.name)
  const keptSections = present.slice(compiled.dropped.length)
  const tokensOf = (message: BudgetMessage): number => compileBudget({ budget: budgetTokens, messages: [message] }).tokens.total
  const sectionTokens = Object.fromEntries(present.map((section, position) => [section.name, tokensOf(messages[position] as BudgetMessage)])) as Record<BudgetSection, number>

  return {
    payload: present.slice(0, compiled.dropped.length).reduce((value, section) => section.strip(value), payload),
    budget: {
      budgetTokens,
      tokens: {
        total: compiled.tokens.total,
        budget: compiled.tokens.budget,
        core: tokensOf(messages[messages.length - 1] as BudgetMessage),
        sections: sectionTokens,
      },
      fits: compiled.fits,
      order: [...BUDGET_SECTION_ORDER],
      kept: keptSections.map((section) => section.name),
      dropped: droppedNames,
      tokenMethod: TOKEN_METHOD,
    },
  }
}
