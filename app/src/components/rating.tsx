import Ionicons from '@expo/vector-icons/Ionicons';
import { currentBand, TIME_BANDS, type RatingResult, type ScoreResult, type TimeBand } from '@watcher/scoring';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { RATING_STYLE, SPACE, TYPE, usePalette, useRatingColor, useRatingTint } from '../lib/theme';
import { DemoBadge, Segmented, styles, type IconName } from './ui';

export type BandChoice = TimeBand | 'now';

export function resolveBand(choice: BandChoice): TimeBand {
  return choice === 'now' ? currentBand() : choice;
}

/** Compact rating pill: icon + word (+ score), so it never relies on colour alone. */
export function RatingPill({ rating, score }: { rating: RatingResult; score?: number | null }) {
  const { t } = useTranslation();
  const { fg, bg } = useRatingTint(rating);
  return (
    <View accessible accessibilityLabel={`${t(`rating.${rating}`)}${score != null ? `, ${score} / 100` : ''}`} style={[styles.badge, { backgroundColor: bg, paddingVertical: 4 }]}>
      <Ionicons name={RATING_STYLE[rating].icon} size={13} color={fg} />
      <Text style={{ color: fg, fontWeight: '800', fontSize: 12 }}>
        {t(`rating.${rating}`)}
        {score != null ? ` · ${score}` : ''}
      </Text>
    </View>
  );
}

/** Circular 0–100 gauge with the score (or "?") in the middle. */
export function ScoreRing({ score, rating, size = 108 }: { score: number | null; rating: RatingResult; size?: number }) {
  const c = usePalette();
  const color = useRatingColor(rating);
  const stroke = Math.round(size * 0.09);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = score == null ? 0 : Math.max(0.02, score / 100);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * progress} ${circumference}`}
        />
      </Svg>
      {score == null ? (
        <Ionicons name="help" size={size * 0.36} color={color} />
      ) : (
        <>
          <Text style={{ color: c.text, fontSize: size * 0.3, fontWeight: '900', letterSpacing: -1 }}>{score}</Text>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: '600', marginTop: -2 }}>/ 100</Text>
        </>
      )}
    </View>
  );
}

/** The large rating block at the top of an area: tinted by rating, gauge + label + facts. */
export function RatingHero({ score, bandLabel, header }: { score: ScoreResult; bandLabel: string; header?: ReactNode }) {
  const { t } = useTranslation();
  const c = usePalette();
  const { fg, bg } = useRatingTint(score.rating);
  const b = score.breakdown;
  const trendIcon: IconName = b.trend === 'up' ? 'trending-up' : b.trend === 'down' ? 'trending-down' : 'remove';
  const a11y =
    score.rating === 'insufficient_data'
      ? t('rating.a11yNoData', { band: bandLabel })
      : t('rating.a11y', { rating: t(`rating.${score.rating}`), score: score.score, band: bandLabel });
  return (
    <View style={{ backgroundColor: bg, borderRadius: 22, padding: SPACE.lg, gap: SPACE.lg }}>
      {header}
      <View accessible accessibilityRole="summary" accessibilityLabel={a11y} style={[styles.row, { gap: SPACE.lg }]}>
        <ScoreRing score={score.score} rating={score.rating} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.row}>
            <Ionicons name={RATING_STYLE[score.rating].icon} size={18} color={fg} />
            <Text style={[TYPE.overline, { color: fg }]}>{bandLabel}</Text>
          </View>
          <Text style={{ color: fg, fontSize: 28, fontWeight: '900', letterSpacing: -0.5, lineHeight: 32 }}>
            {score.rating === 'insufficient_data' ? t('rating.insufficient_data') : t('rating.riskLabel', { rating: t(`rating.${score.rating}`) })}
          </Text>
          <View style={[styles.row, { flexWrap: 'wrap', gap: 6 }]}>
            {score.rating !== 'insufficient_data' ? (
              <Fact icon={trendIcon} text={t(`trend.${b.trend}`)} />
            ) : null}
            <Fact icon="checkmark-done" text={t(`confidence.${b.confidenceLevel}`)} />
          </View>
        </View>
      </View>
      {b.usesDemoData ? (
        <View style={[styles.row, { gap: 6 }]}>
          <DemoBadge />
          <Text style={{ color: c.muted, fontSize: 12, flex: 1 }}>{t('common.demoExplain')}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Fact({ icon, text }: { icon: IconName; text: string }) {
  const c = usePalette();
  return (
    <View style={[styles.badge, { backgroundColor: c.card, paddingVertical: 4 }]}>
      <Ionicons name={icon} size={13} color={c.text} />
      <Text style={{ color: c.text, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function TimeBandSelector({ value, onChange }: { value: BandChoice; onChange: (b: BandChoice) => void }) {
  const { t } = useTranslation();
  const icons: Record<BandChoice, IconName> = { now: 'time', morning: 'partly-sunny', afternoon: 'sunny', evening: 'cloudy-night', night: 'moon' };
  return (
    <Segmented<BandChoice>
      stacked
      a11yLabel={t('bands.label')}
      value={value}
      onChange={onChange}
      options={(['now', ...TIME_BANDS] as BandChoice[]).map((b) => ({ value: b, label: t(`bands.${b}`), icon: icons[b] }))}
    />
  );
}

/**
 * Horizontal row of fare-style cards, one per time band, each showing that band's rating, so the
 * whole day can be compared at a glance. Same radio semantics as TimeBandSelector.
 */
export function BandCards({ value, onChange, scoreOf }: { value: BandChoice; onChange: (b: BandChoice) => void; scoreOf: (b: TimeBand) => ScoreResult | null }) {
  const { t } = useTranslation();
  const icons: Record<BandChoice, IconName> = { now: 'time', morning: 'partly-sunny', afternoon: 'sunny', evening: 'cloudy-night', night: 'moon' };
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('bands.label')}
      contentContainerStyle={{ gap: SPACE.sm, paddingVertical: 2, paddingHorizontal: 2 }}
    >
      {(['now', ...TIME_BANDS] as BandChoice[]).map((b) => (
        <BandCard key={b} choice={b} icon={icons[b]} selected={b === value} onPress={() => onChange(b)} score={scoreOf(resolveBand(b))} />
      ))}
    </ScrollView>
  );
}

function BandCard({ choice, icon, selected, onPress, score }: { choice: BandChoice; icon: IconName; selected: boolean; onPress: () => void; score: ScoreResult | null }) {
  const { t } = useTranslation();
  const c = usePalette();
  const rating = score?.rating ?? 'insufficient_data';
  const { fg, bg } = useRatingTint(rating);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={t(`bands.${choice}`)}
      accessibilityHint={t(`rating.${rating}`)}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 96,
        padding: SPACE.sm + 2,
        gap: 6,
        borderRadius: 18,
        backgroundColor: c.card,
        borderWidth: 2,
        borderColor: selected ? c.primary : c.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Ionicons name={icon} size={20} color={selected ? c.primary : c.text} />
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: fg, fontSize: 10, fontWeight: '900' }}>{RATING_STYLE[rating].letter}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>
        {t(`bands.${choice}`)}
      </Text>
      <Text style={{ color: fg, fontSize: 20, fontWeight: '900', letterSpacing: -0.4 }}>{score?.score ?? '–'}</Text>
    </Pressable>
  );
}

export function RatingLegend() {
  const { t } = useTranslation();
  const c = usePalette();
  return (
    <View style={[styles.row, { flexWrap: 'wrap', gap: SPACE.md }]} accessibilityLabel={t('home.legend')}>
      {(['low', 'moderate', 'high', 'insufficient_data'] as const).map((r) => (
        <LegendItem key={r} rating={r} label={t(`rating.${r}`)} textColor={c.muted} />
      ))}
    </View>
  );
}

function LegendItem({ rating, label, textColor }: { rating: RatingResult; label: string; textColor: string }) {
  const color = useRatingColor(rating);
  return (
    <View style={[styles.row, { gap: 5 }]}>
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>{RATING_STYLE[rating].letter}</Text>
      </View>
      <Text style={{ color: textColor, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

/** Square score badge used in lists: letter-free number on the rating tint. */
export function ScoreBadge({ rating, score }: { rating: RatingResult; score?: number | null }) {
  const { t } = useTranslation();
  const { fg, bg } = useRatingTint(rating);
  return (
    <View accessible accessibilityLabel={`${t(`rating.${rating}`)}${score != null ? `, ${score}` : ''}`} style={{ alignItems: 'flex-end', gap: 3 }}>
      <View style={{ minWidth: 44, height: 36, paddingHorizontal: 8, borderRadius: 10, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 3 }}>
        <Ionicons name={RATING_STYLE[rating].icon} size={13} color={fg} />
        <Text style={{ color: fg, fontWeight: '900', fontSize: 15 }}>{score ?? '–'}</Text>
      </View>
      <Text style={{ color: fg, fontSize: 11, fontWeight: '700' }}>{t(`rating.${rating}`)}</Text>
    </View>
  );
}
