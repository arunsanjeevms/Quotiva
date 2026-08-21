/**
 * Server-side mirror of frontend/src/components/documents/templateThemes.ts —
 * the PDF must render the same design the on-screen preview shows, so the
 * theme table and colour helpers are kept in lockstep with that file.
 */

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
  header: 'band' | 'ruled' | 'panel' | 'plain' | 'compact' | 'stripe' | 'centered' | 'sidebar';
  tableHeader: 'band' | 'line' | 'panel' | 'plain' | 'compact' | 'underline';
  headingFont: 'serif' | 'sans';
  density: 'comfortable' | 'compact';
  accent: 'rule' | 'panel' | 'text' | 'none';
  zebra: boolean;
  wideTitle: boolean;
}

export const TEMPLATE_THEMES: Record<TemplateKey, TemplateTheme> = {
  classic: { key: 'classic', header: 'ruled', tableHeader: 'line', headingFont: 'serif', density: 'comfortable', accent: 'rule', zebra: false, wideTitle: true },
  modern: { key: 'modern', header: 'band', tableHeader: 'band', headingFont: 'sans', density: 'comfortable', accent: 'text', zebra: false, wideTitle: true },
  minimal: { key: 'minimal', header: 'plain', tableHeader: 'plain', headingFont: 'sans', density: 'comfortable', accent: 'none', zebra: false, wideTitle: false },
  professional: { key: 'professional', header: 'panel', tableHeader: 'panel', headingFont: 'sans', density: 'comfortable', accent: 'panel', zebra: true, wideTitle: false },
  compact: { key: 'compact', header: 'compact', tableHeader: 'compact', headingFont: 'sans', density: 'compact', accent: 'rule', zebra: true, wideTitle: false },
  bold: { key: 'bold', header: 'stripe', tableHeader: 'band', headingFont: 'sans', density: 'comfortable', accent: 'panel', zebra: false, wideTitle: true },
  elegant: { key: 'elegant', header: 'centered', tableHeader: 'underline', headingFont: 'serif', density: 'comfortable', accent: 'rule', zebra: false, wideTitle: true },
  sidebar: { key: 'sidebar', header: 'sidebar', tableHeader: 'underline', headingFont: 'sans', density: 'comfortable', accent: 'text', zebra: true, wideTitle: false },
  letterhead: { key: 'letterhead', header: 'stripe', tableHeader: 'line', headingFont: 'serif', density: 'comfortable', accent: 'rule', zebra: false, wideTitle: true },
};

export function resolveTemplateKey(key: string | null | undefined): TemplateKey {
  if (key && key in TEMPLATE_THEMES) return key as TemplateKey;
  return 'classic';
}

export function hexToRgbTriplet(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!match?.[1]) return '37, 99, 235';
  const value = Number.parseInt(match[1], 16);
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}

export function readableOn(hex: string): string {
  const [r, g, b] = hexToRgbTriplet(hex).split(', ').map(Number) as [number, number, number];
  const luminance = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * luminance(r) + 0.7152 * luminance(g) + 0.0722 * luminance(b);
  return l > 0.4 ? '#0f172a' : '#ffffff';
}

export function darken(hex: string, amount = 28): string {
  const [r, g, b] = hexToRgbTriplet(hex).split(', ').map(Number) as [number, number, number];
  const clamp = (c: number): number => Math.max(0, Math.min(255, c - amount));
  return `#${[clamp(r), clamp(g), clamp(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function resolveAccent(branding: { documentAccentColor?: string | null; primaryColor?: string | null }): string {
  return branding.documentAccentColor || branding.primaryColor || '#4F46E5';
}
