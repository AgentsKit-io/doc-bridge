import { Inter, Space_Grotesk } from 'next/font/google'

/**
 * Inter (body) and Space Grotesk (headings) are self-hosted site-wide through next/font, so the
 * shared shell is told not to fetch them from Google Fonts (`data-ak-fonts="self"`).
 */
export const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
export const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk', display: 'swap' })
