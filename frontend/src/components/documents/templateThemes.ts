export type TemplateKey = 'classic' | 'modern' | 'minimal' | 'professional' | 'compact';

export interface TemplateTheme {
  key: TemplateKey;
  name: string;
  description: string;
  /** Header treatment: a solid accent band, a ruled line, a tinted panel, or plain. */
  header: 'band' | 'ruled' | 'panel' | 'plain' | 'compact';
  /** Item table header treatment. */
  tableHeader: 'band' | 'line' | 'panel' | 'plain' | 'compact';
  /** Serif headings read as more formal/traditional. */
  headingFont: 'serif' | 'sans';
  /** Row and section spacing. */
  density: 'comfortable' | 'compact';
  /** How Notes/Terms headings and the grand total are set off. */
  accent: 'rule' | 'panel' | 'text' | 'none';
}

/**
 * One entry per document template (docs/07-frontend-design-system.md §8). Every
 * template shares the same block order and data — only presentation differs —
 * and every template draws its accent color from the business's own branding
 * (Settings → Branding), so five templates × any brand color is the real
 * combinatorial space, not five fixed color schemes.
 */
export const TEMPLATE_THEMES: Record<TemplateKey, TemplateTheme> = {
  classic: {
    key: 'classic',
    name: 'Classic',
    description: 'Serif headings, ruled table, formal.',
    header: 'ruled',
    tableHeader: 'line',
    headingFont: 'serif',
    density: 'comfortable',
    accent: 'rule',
  },
  modern: {
    key: 'modern',
    name: 'Modern',
    description: 'Brand-colored header band, airy spacing.',
    header: 'band',
    tableHeader: 'band',
    headingFont: 'sans',
    density: 'comfortable',
    accent: 'text',
  },
  minimal: {
    key: 'minimal',
    name: 'Minimal',
    description: 'No rules, whitespace-led.',
    header: 'plain',
    tableHeader: 'plain',
    headingFont: 'sans',
    density: 'comfortable',
    accent: 'none',
  },
  professional: {
    key: 'professional',
    name: 'Professional',
    description: 'Tinted panels, strong hierarchy, densest information.',
    header: 'panel',
    tableHeader: 'panel',
    headingFont: 'sans',
    density: 'comfortable',
    accent: 'panel',
  },
  compact: {
    key: 'compact',
    name: 'Compact',
    description: 'Smaller type and tighter rows for long item lists.',
    header: 'compact',
    tableHeader: 'compact',
    headingFont: 'sans',
    density: 'compact',
    accent: 'rule',
  },
};

export const TEMPLATE_ORDER: TemplateKey[] = [
  'classic',
  'modern',
  'minimal',
  'professional',
  'compact',
];

export function resolveTemplateKey(key: string | null | undefined): TemplateKey {
  if (key && key in TEMPLATE_THEMES) return key as TemplateKey;
  return 'classic';
}

/** #RRGGBB -> "r, g, b" for use in rgba() tints. */
export function hexToRgbTriplet(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return '37, 99, 235';
  const value = Number.parseInt(match[1], 16);
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}

/** White vs near-black label color for a given accent, by WCAG contrast. */
export function readableOn(hex: string): string {
  const [r, g, b] = hexToRgbTriplet(hex).split(', ').map(Number) as [number, number, number];
  const luminance = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * luminance(r) + 0.7152 * luminance(g) + 0.0722 * luminance(b);
  return l > 0.4 ? '#0f172a' : '#ffffff';
}
