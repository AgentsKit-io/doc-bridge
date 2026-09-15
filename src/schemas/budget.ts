import { z } from 'zod'

/**
 * The sections a budgeted payload may shed, in the order it sheds them.
 *
 * Excerpts go first: they are the longest text and the easiest to fetch again. Then the related
 * areas, then the neighbourhood, then the summaries. What is never on this list — the entity,
 * the evidence paths and hashes, the handoff fields an agent acts on, the open diagnostics —
 * is never dropped: a payload that no longer fits reports `fits: false` rather than losing them.
 */
export const BUDGET_SECTION_ORDER = ['evidenceExcerpts', 'related', 'neighbours', 'summaries'] as const

export const BudgetSectionSchema = z.enum(BUDGET_SECTION_ORDER)
export type BudgetSection = z.infer<typeof BudgetSectionSchema>

export const BudgetReportSchema = z
  .object({
    budgetTokens: z.number().int().positive(),
    tokens: z
      .object({
        total: z.number().int().nonnegative(),
        budget: z.number().int().positive(),
        /** What the payload costs with every droppable section removed. */
        core: z.number().int().nonnegative(),
        sections: z.partialRecord(BudgetSectionSchema, z.number().int().nonnegative()),
      })
      .strict(),
    fits: z.boolean(),
    /** The declared order, so a reader can check that what was dropped is a prefix of it. */
    order: z.array(BudgetSectionSchema).max(8),
    kept: z.array(BudgetSectionSchema).max(8),
    dropped: z.array(BudgetSectionSchema).max(8),
    tokenMethod: z.literal('approximate'),
  })
  .strict()

export type BudgetReport = z.infer<typeof BudgetReportSchema>
