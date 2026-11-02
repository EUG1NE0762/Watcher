import { useColorScheme } from 'react-native';
import type { RatingResult } from '@watcher/scoring';
import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';
import { useSettings } from '../state/settings';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Ride-hailing style: clean white/near-black surfaces, one vivid red brand colour for primary actions
 * and selection, black ink for text. "High" risk uses a deeper crimson plus its icon and letter, so it
 * never reads as the brand colour.
 */
const light = {
  bg: '#F4F4F5',
  card: '#FFFFFF',
  raised: '#F4F4F5',
  text: '#0A0A0A',
  muted: '#5F6368',
  subtle: '#9AA0A6',
  border: '#E8E8EA',
  primary: '#E3241B',
  primarySoft: '#FFECEA',
  primaryText: '#FFFFFF',
  accent: '#E3241B',
  ink: '#0A0A0A',
  danger: '#B3261E',
  dangerBg: '#FCEBE9',
  warnBg: '#FFF3D6',
  warnText: '#7A4A00',
  infoBg: '#F1F1F2',
  chip: '#F1F1F2',
  track: '#EDEDEF',
  sheet: '#FFFFFF',
  shadow: 'rgba(0, 0, 0, 0.08)',
};

const dark: typeof light = {
  bg: '#0A0A0B',
  card: '#18181B',
  raised: '#222226',
  text: '#F5F5F6',
  muted: '#A1A1AA',
  subtle: '#71717A',
  border: '#2A2A2F',
  primary: '#E5281F',
  primarySoft: '#3A1513',
  primaryText: '#FFFFFF',
  accent: '#FF6B61',
  ink: '#F5F5F6',
  danger: '#FF8A80',
  dangerBg: '#3A1715',
  warnBg: '#33260A',
  warnText: '#FFD58A',
  infoBg: '#26262B',
  chip: '#26262B',
  track: '#26262B',
  sheet: '#141417',
  shadow: 'rgba(0, 0, 0, 0.5)',
};

export type Palette = typeof light;
export type Scheme = 'light' | 'dark';

/** Resolved colour scheme: the user's choice in Settings, or the phone's setting when "System". */
export function useScheme(): Scheme {
  const pref = useSettings((s) => s.theme);
  const system = useColorScheme();
  if (pref === 'light' || pref === 'dark') return pref;
  return system === 'dark' ? 'dark' : 'light';
}

export function usePalette(): Palette {
  return useScheme() === 'dark' ? dark : light;
}

/**
 * Rating colours chosen to stay distinguishable with common colour-vision deficiencies when paired
 * with the icon, letter and label; colour is never the only signal.
 */
export const RATING_STYLE: Record<
  RatingResult,
  { color: string; darkColor: string; bg: string; darkBg: string; icon: IconName; letter: string }
> = {
  low: { color: '#17795A', darkColor: '#56CFA1', bg: '#E4F4EC', darkBg: '#10261E', icon: 'shield-checkmark', letter: 'L' },
  moderate: { color: '#A15C00', darkColor: '#F5B451', bg: '#FDF0DC', darkBg: '#2E2210', icon: 'alert-circle', letter: 'M' },
  high: { color: '#A3123A', darkColor: '#FF7A93', bg: '#FDE7EC', darkBg: '#36101A', icon: 'warning', letter: 'H' },
  insufficient_data: { color: '#5F6368', darkColor: '#A1A1AA', bg: '#EFEFF1', darkBg: '#222226', icon: 'help-circle', letter: '?' },
};

export function useRatingColor(rating: RatingResult): string {
  return useScheme() === 'dark' ? RATING_STYLE[rating].darkColor : RATING_STYLE[rating].color;
}

export function useRatingTint(rating: RatingResult): { fg: string; bg: string } {
  const dark = useScheme() === 'dark';
  const s = RATING_STYLE[rating];
  return { fg: dark ? s.darkColor : s.color, bg: dark ? s.darkBg : s.bg };
}

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const RADIUS = 20;
export const RADIUS_SM = 14;
export const PILL = 999;
/** Minimum touch target (Android guidance is 48dp). */
export const TAP = 48;

export const TYPE = {
  display: { fontSize: 30, fontWeight: '900' as const, letterSpacing: -0.8 },
  title: { fontSize: 26, fontWeight: '900' as const, letterSpacing: -0.6 },
  heading: { fontSize: 18, fontWeight: '800' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 18 },
  overline: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const },
};
