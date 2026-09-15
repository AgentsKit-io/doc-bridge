/**
 * Token budgets, in the shape `@agentskit/core` gives them.
 *
 * `compileBudget` and `approximateCounter` below mirror the functions of the same name in
 * `@agentskit/core`, restricted to what a deterministic payload needs: the `drop-oldest`
 * strategy over plain role/content messages, with no system prompt, tools or summariser. The
 * core package is an optional peer and every query surface must answer with no peer installed,
 * so the algorithm lives here and a test runs the real `compileBudget` over the same messages
 * and asserts the two agree on every token count, every dropped message and `fits`.
 *
 * The mirror is synchronous where the original is a promise: nothing here can await, and the
 * MCP handlers that call it answer in one turn.
 */

export type BudgetMessage = {
  readonly role: string
  readonly content: string
}

export type BudgetTokenCounter = {
  readonly name: string
  readonly count: (messages: readonly BudgetMessage[]) => number
}

/**
 * Four characters per token, plus two per message, over role and content — the rule of thumb
 * `@agentskit/core` uses. Good enough for budget planning, and reported as such.
 */
export const approximateCounter: BudgetTokenCounter = {
  name: 'approximate',
  count: (messages) => messages.reduce((total, message) => total + Math.ceil((message.role.length + message.content.length) / 4) + 2, 0),
}

export const TOKEN_METHOD = 'approximate' as const

export type CompileBudgetInput = {
  /** Hard upper bound on the tokens of what is kept. */
  readonly budget: number
  /** Oldest first: the front of the list is dropped first. */
  readonly messages: readonly BudgetMessage[]
  readonly counter?: BudgetTokenCounter
  /** Never drop below this many messages, counted from the end. Default 1. */
  readonly keepRecent?: number
  readonly reserveForOutput?: number
}

export type CompileBudgetResult = {
  readonly messages: readonly BudgetMessage[]
  readonly tokens: {
    readonly system: number
    readonly messages: number
    readonly tools: number
    readonly total: number
    readonly budget: number
  }
  readonly dropped: readonly BudgetMessage[]
  readonly fits: boolean
  readonly strategy: 'drop-oldest'
}

/**
 * Drop the oldest messages until the rest fits the budget, keeping at least `keepRecent`.
 *
 * The last message is never dropped by default, which is what makes the strategy usable for a
 * payload: the section that must survive is placed last, and the sections that may go are placed
 * first, in the order they may go. `fits` is false only when what could not be dropped still
 * exceeds the budget — an honest answer rather than a truncated one.
 */
export const compileBudget = (input: CompileBudgetInput): CompileBudgetResult => {
  const counter = input.counter ?? approximateCounter
  const keepRecent = Math.max(1, input.keepRecent ?? 1)
  const reserve = input.reserveForOutput ?? 0
  const budget = input.budget - reserve
  if (budget <= 0) throw new Error(`Budget must exceed reserveForOutput (${input.budget} ≤ ${reserve})`)

  const messages = [...input.messages]
  const dropped: BudgetMessage[] = []
  let total = counter.count(messages)
  while (messages.length > keepRecent && total > budget) {
    dropped.push(messages.shift() as BudgetMessage)
    total = counter.count(messages)
  }

  return {
    messages,
    tokens: { system: 0, messages: total, tools: 0, total, budget },
    dropped,
    fits: total <= budget,
    strategy: 'drop-oldest',
  }
}
