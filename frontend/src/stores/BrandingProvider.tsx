import { useEffect } from 'react';
import { useBusinessOptional } from './BusinessContext';

/** #RRGGBB → "r g b" for CSS custom properties. */
function toRgbTriplet(hex: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return null;
  const value = Number.parseInt(match[1], 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

function shift(hex: string, amount: number): string | null {
  const triplet = toRgbTriplet(hex);
  if (!triplet) return null;
  const channels = triplet.split(' ').map(Number) as [number, number, number];
  return channels
    .map((c) => Math.max(0, Math.min(255, Math.round(c + amount))))
    .join(' ');
}

function mixWithWhite(hex: string, weight: number): string | null {
  const triplet = toRgbTriplet(hex);
  if (!triplet) return null;
  const channels = triplet.split(' ').map(Number) as [number, number, number];
  return channels.map((c) => Math.round(c + (255 - c) * weight)).join(' ');
}

/** Relative luminance per WCAG, used to pick a readable label color. */
function luminance(rgb: string): number {
  const [r, g, b] = rgb.split(' ').map(Number) as [number, number, number];
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(rgbA: string, rgbB: string): number {
  const a = luminance(rgbA);
  const b = luminance(rgbB);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Applies the business's configured colours as CSS custom properties at runtime,
 * so branding is data rather than build configuration (docs/07 §2).
 *
 * If the chosen primary fails contrast against white, the button label flips to
 * near-black automatically rather than shipping unreadable text.
 */
export function BrandingProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const ctx = useBusinessOptional();
  const branding = ctx?.branding;
  const businessName = ctx?.business.name;

  useEffect(() => {
    if (!branding) return;
    const root = document.documentElement;

    const primary = toRgbTriplet(branding.primaryColor);
    if (primary) {
      root.style.setProperty('--color-primary', primary);
      const hover = shift(branding.primaryColor, -22);
      if (hover) root.style.setProperty('--color-primary-hover', hover);
      const subtle = mixWithWhite(branding.primaryColor, 0.92);
      if (subtle) root.style.setProperty('--color-primary-subtle', subtle);
      const white = '255 255 255';
      root.style.setProperty(
        '--color-primary-fg',
        contrastRatio(primary, white) >= 4.5 ? white : '15 23 42',
      );
    }

    const secondary = toRgbTriplet(branding.secondaryColor);
    if (secondary) root.style.setProperty('--color-secondary', secondary);
  }, [branding]);

  useEffect(() => {
    if (branding?.faviconUrl) {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link) link.href = branding.faviconUrl;
    }
  }, [branding?.faviconUrl]);

  useEffect(() => {
    document.title = businessName ? `${businessName} · Quotiva` : 'Quotiva';
  }, [businessName]);

  return <>{children}</>;
}
