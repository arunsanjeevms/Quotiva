export type TemplateKey =
  | 'classic'
  | 'modern'
  | 'minimal'
  | 'professional'
  | 'compact'
  | 'bold'
  | 'elegant'
  | 'sidebar'
  | 'letterhead';

export interface TemplateTheme {
  key: TemplateKey;
  name: string;
  description: string;
  /** Header treatment — the block whose markup differs most between designs. */
  header: 'band' | 'ruled' | 'panel' | 'plain' | 'compact' | 'stripe' | 'centered' | 'sidebar';
  /** Item table header treatment. */
  tableHeader: 'band' | 'line' | 'panel' | 'plain' | 'compact' | 'underline';
  /** Serif headings read as more formal/traditional. */
  headingFont: 'serif' | 'sans';
  /** Row and section spacing. */
  density: 'comfortable' | 'compact';
  /** How Notes/Terms headings and the grand total are set off. */
  accent: 'rule' | 'panel' | 'text' | 'none';
  /** Alternating row tint — helps on long item lists. */
  zebra: boolean;
  /** Extra letter-spacing on the document-type label. */
  wideTitle: boolean;
}

/**
 * One entry per document design (docs/07-frontend-design-system.md §8).
 *
 * Every design shares the same block order and data — only presentation
 * differs. Colour is deliberately NOT part of a design: the accent comes from
 * the separately chosen colour scheme, so designs × schemes is the real
 * combinatorial space rather than a fixed set of coloured templates.
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
    zebra: false,
    wideTitle: true,
  },
  modern: {
    key: 'modern',
    name: 'Modern',
    description: 'Full-width colour header band, airy spacing.',
    header: 'band',
    tableHeader: 'band',
    headingFont: 'sans',
    density: 'comfortable',
    accent: 'text',
    zebra: false,
    wideTitle: true,
  },
  minimal: {
    key: 'minimal',
    name: 'Minimal',
    description: 'No rules, whitespace-led, quiet typography.',
    header: 'plain',
    tableHeader: 'plain',
    headingFont: 'sans',
    density: 'comfortable',
    accent: 'none',
    zebra: false,
    wideTitle: false,
  },
  professional: {
    key: 'professional',
    name: 'Professional',
    description: 'Tinted panels, strong hierarchy, dense information.',
    header: 'panel',
    tableHeader: 'panel',
    headingFont: 'sans',
    density: 'comfortable',
    accent: 'panel',
    zebra: true,
    wideTitle: false,
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
    zebra: true,
    wideTitle: false,
  },
  bold: {
    key: 'bold',
    name: 'Bold',
    description: 'Oversized document title, heavy accent, high contrast.',
    header: 'stripe',
    tableHeader: 'band',
    headingFont: 'sans',
    density: 'comfortable',
    accent: 'panel',
    zebra: false,
    wideTitle: true,
  },
  elegant: {
    key: 'elegant',
    name: 'Elegant',
    description: 'Centred serif masthead with hairline rules.',
    header: 'centered',
    tableHeader: 'underline',
    headingFont: 'serif',
    density: 'comfortable',
    accent: 'rule',
    zebra: false,
    wideTitle: true,
  },
  sidebar: {
    key: 'sidebar',
    name: 'Sidebar',
    description: 'Vertical accent column carrying business details.',
    header: 'sidebar',
    tableHeader: 'underline',
    headingFont: 'sans',
    density: 'comfortable',
    accent: 'text',
    zebra: true,
    wideTitle: false,
  },
  letterhead: {
    key: 'letterhead',
    name: 'Letterhead',
    description: 'Slim top stripe, centred identity, corporate feel.',
    header: 'stripe',
    tableHeader: 'line',
    headingFont: 'serif',
    density: 'comfortable',
    accent: 'rule',
    zebra: false,
    wideTitle: true,
  },
};

export const TEMPLATE_ORDER: TemplateKey[] = [
  'classic',
  'modern',
  'minimal',
  'professional',
  'compact',
  'bold',
  'elegant',
  'sidebar',
  'letterhead',
];

export function resolveTemplateKey(key: string | null | undefined): TemplateKey {
  if (key && key in TEMPLATE_THEMES) return key as TemplateKey;
  return 'classic';
}

/* ------------------------------ Colour schemes ---------------------------- */

export interface ColorScheme {
  key: string;
  name: string;
  color: string;
}

/**
 * Preset document accent colours. These are *suggestions* an admin can pick
 * from — the accent is stored as a plain hex on the business's branding, so a
 * fully custom colour is equally valid and nothing here is baked into a design.
 */
export const COLOR_SCHEMES: ColorScheme[] = [
  { key: 'indigo', name: 'Indigo', color: '#4F46E5' },
  { key: 'blue', name: 'Blue', color: '#2563EB' },
  { key: 'sky', name: 'Sky', color: '#0284C7' },
  { key: 'teal', name: 'Teal', color: '#0D9488' },
  { key: 'emerald', name: 'Emerald', color: '#059669' },
  { key: 'lime', name: 'Olive', color: '#4D7C0F' },
  { key: 'amber', name: 'Amber', color: '#B45309' },
  { key: 'orange', name: 'Orange', color: '#EA580C' },
  { key: 'rose', name: 'Rose', color: '#E11D48' },
  { key: 'crimson', name: 'Crimson', color: '#BE123C' },
  { key: 'violet', name: 'Violet', color: '#7C3AED' },
  { key: 'plum', name: 'Plum', color: '#A21CAF' },
  { key: 'slate', name: 'Slate', color: '#475569' },
  { key: 'graphite', name: 'Graphite', color: '#1F2937' },
];

/** #RRGGBB -> "r, g, b" for use in rgba() tints. */
export function hexToRgbTriplet(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return '37, 99, 235';
  const value = Number.parseInt(match[1], 16);
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}

/** White vs near-black label colour for a given accent, by WCAG luminance. */
export function readableOn(hex: string): string {
  const [r, g, b] = hexToRgbTriplet(hex).split(', ').map(Number) as [number, number, number];
  const luminance = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * luminance(r) + 0.7152 * luminance(g) + 0.0722 * luminance(b);
  return l > 0.4 ? '#0f172a' : '#ffffff';
}

/** Darken a hex by a fixed amount, for gradients and secondary accents. */
export function darken(hex: string, amount = 28): string {
  const [r, g, b] = hexToRgbTriplet(hex).split(', ').map(Number) as [number, number, number];
  const clamp = (c: number): number => Math.max(0, Math.min(255, c - amount));
  return `#${[clamp(r), clamp(g), clamp(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The accent a document actually renders with: the explicit document accent if
 * the admin picked one, otherwise the business's primary brand colour.
 */
export function resolveAccent(branding: {
  documentAccentColor?: string | null;
  primaryColor: string;
}): string {
  return branding.documentAccentColor || branding.primaryColor;
}
