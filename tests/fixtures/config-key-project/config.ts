import { z } from 'zod'
const OutputSchema = z.object({ format: z.enum(['json', 'text']).default('json') })
export const ConfigSchema = z.object({ output: OutputSchema, retry: z.number().default(3), enabled: z.boolean().optional() })
