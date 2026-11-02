import Ionicons from '@expo/vector-icons/Ionicons';
import { areaAtPoint, currentBand, type RatingResult } from '@watcher/scoring';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AreaSearch } from '../../components/AreaSearch';
import AreaMap from '../../components/map/AreaMap';
import type { MapEvent } from '../../components/map/mapHtml';
import { useMapData } from '../../components/map/useMapData';
import { RatingLegend, ScoreBadge } from '../../components/rating';
import { Banner, Chip, Disclaimer, ErrorState, LastUpdated, Skeleton, StatusStrips, styles, ThemeToggle } from '../../components/ui';
import { useAreas } from '../../data/queries';
import { locateArea } from '../../lib/device';
import { PILL, SPACE, TAP, TYPE, usePalette, useRatingColor, useRatingTint } from '../../lib/theme';
import { usePlaces } from '../../state/places';
import { useSettings } from '../../state/settings';
import type { AreaSummary } from '../../data/types';
import type { IconName } from '../../components/ui';

const MAP_HEIGHT = 360;
const SUMMARY: RatingResult[] = ['high', 'moderate', 'low'];

function SummaryTile({ rating, count }: { rating: RatingResult; count: number }) {
  const { t } = useTranslation();
  const { fg, bg } = useRatingTint(rating);
  return (
    <View accessible accessibilityLabel={`${count} ${t(`rating.${rating}`)}`} style={{ flex: 1, backgroundColor: bg, borderRadius: 18, paddingVertical: SPACE.md, alignItems: 'center', gap: 2 }}>
      <Text style={{ color: fg, fontSize: 26, fontWeight: '900' }}>{count}</Text>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
        {t(`rating.${rating}`)}
      </Text>
    </View>
  );
}

/** One-tap shortcut, like a ride app's saved/recent destinations. */
function QuickPlace({ summary, icon, band, onPress }: { summary: AreaSummary; icon: IconName; band: ReturnType<typeof currentBand>; onPress: () => void }) {
  const { t } = useTranslation();
  const c = usePalette();
  const rating = summary.scores[band]?.rating ?? 'insufficient_data';
  const dot = useRatingColor(rating);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${summary.area.name}, ${t(`rating.${rating}`)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { gap: 8, backgroundColor: c.raised, borderRadius: PILL, paddingVertical: 8, paddingLeft: 8, paddingRight: 14, minHeight: 44, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={15} color={c.text} />
      </View>
      <Text style={{ color: c.text, fontWeight: '700', fontSize: 14 }}>{summary.area.name}</Text>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
    </Pressable>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const areas = useAreas();
  const band = currentBand();
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const all = useMemo(() => areas.data ?? [], [areas.data]);
  const chosenCity = useSettings((s) => s.city);
  const setSettings = useSettings((s) => s.set);
  // Towns with the most mapped areas first, so the big cities lead the picker.
  const cities = useMemo(() => {
    const n = new Map<string, number>();
    for (const s of all) n.set(s.area.city, (n.get(s.area.city) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
  }, [all]);
  const city = cities.includes(chosenCity) ? chosenCity : 'all';
  const list = useMemo(() => (city === 'all' ? all : all.filter((s) => s.area.city === city)), [all, city]);
  const sorted = useMemo(
    () => [...list].sort((a, b) => (b.scores[band]?.score ?? -1) - (a.scores[band]?.score ?? -1) || a.area.name.localeCompare(b.area.name)),
    [list, band],
  );
  const counts = useMemo(() => {
    const out: Record<RatingResult, number> = { high: 0, moderate: 0, low: 0, insufficient_data: 0 };
    for (const s of list) out[s.scores[band]?.rating ?? 'insufficient_data']++;
    return out;
  }, [list, band]);
  const mapData = useMapData(list, band, { fitKey: city });
  const saved = usePlaces((p) => p.saved);
  const history = usePlaces((p) => p.history);
  // Saved first, then recently viewed, then the highest-rated areas so the row is never empty.
  const quick = useMemo(() => {
    const byId = new Map(all.map((s) => [s.area.id, s]));
    const out: { summary: AreaSummary; icon: IconName }[] = [];
    const add = (id: string | undefined, icon: IconName) => {
      const s = id ? byId.get(id) : undefined;
      if (s && !out.some((o) => o.summary.area.id === s.area.id)) out.push({ summary: s, icon });
    };
    saved.forEach((p) => add(p.areaId, 'bookmark'));
    [...history].reverse().forEach((h) => add(h.areaId, 'time'));
    sorted.forEach((s) => add(s.area.id, 'location'));
    return out.slice(0, 6);
  }, [all, saved, history, sorted]);

  const open = (id: string) => router.push({ pathname: '/area/[id]', params: { id } });

  const locateMe = async () => {
    setNotice(null);
    setLocating(true);
    const res = await locateArea(all.map((a) => a.area));
    setLocating(false);
    if (res.status === 'ok') {
      setSettings({ city: res.area.city });
      open(res.area.id);
    }
    else setNotice(res.status === 'denied' ? t('home.locationDenied') : t('home.noArea'));
  };

  const onMapEvent = (e: MapEvent) => {
    if (e.type === 'area') open(e.id);
    if (e.type === 'point') {
      const area = areaAtPoint({ lat: e.lat, lng: e.lng }, all.map((a) => a.area), 0.8);
      if (area) open(area.id);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.sheet }} edges={[]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>
        {/* Full-bleed map with floating controls */}
        <View style={{ height: MAP_HEIGHT + insets.top, backgroundColor: c.bg }}>
          {areas.isLoading ? (
            <Skeleton height={MAP_HEIGHT + insets.top} />
          ) : areas.isError && !list.length ? (
            <View style={{ padding: SPACE.lg, paddingTop: insets.top + 72 }}>
              <ErrorState onRetry={() => void areas.refetch()} />
            </View>
          ) : (
            <AreaMap data={mapData} onEvent={onMapEvent} height={MAP_HEIGHT + insets.top} rounded={false} accessibilityLabel={t('home.mapHint')} />
          )}
          <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + SPACE.sm, left: SPACE.lg, right: SPACE.lg, gap: SPACE.sm }}>
            <StatusStrips />
            <View pointerEvents="box-none" style={[styles.row, { justifyContent: 'space-between' }]}>
              <View style={[styles.row, { backgroundColor: c.card, borderRadius: PILL, paddingVertical: 6, paddingLeft: 6, paddingRight: 14, boxShadow: `0 2px 8px ${c.shadow}` }]}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="eye" size={18} color={c.primaryText} />
                </View>
                <Text style={{ color: c.text, fontSize: 17, fontWeight: '900', letterSpacing: -0.3 }}>Watcher</Text>
                <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600' }}>· {city === 'all' ? t('home.allZambia') : city}</Text>
              </View>
              <ThemeToggle />
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.useMyLocation')}
            onPress={() => void locateMe()}
            style={({ pressed }) => ({
              position: 'absolute',
              right: SPACE.lg,
              bottom: 28 + SPACE.md,
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: c.card,
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 2px 10px ${c.shadow}`,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            {locating ? <ActivityIndicator color={c.primary} /> : <Ionicons name="navigate" size={22} color={c.text} />}
          </Pressable>
        </View>

        {/* Bottom sheet */}
        <View
          style={{
            marginTop: -28,
            backgroundColor: c.sheet,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: SPACE.lg,
            paddingTop: SPACE.md,
            gap: SPACE.lg,
            boxShadow: `0 -4px 16px ${c.shadow}`,
          }}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.border }} />
          <Text accessibilityRole="header" style={[TYPE.display, { color: c.text }]}>
            {t('home.headline')}
          </Text>
          <AreaSearch areas={all} band={band} onSelect={(a) => open(a.id)} testID="area-search" />
          {quick.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={t('home.quickPlaces')} contentContainerStyle={{ gap: SPACE.sm }} style={{ marginHorizontal: -SPACE.lg }}>
              <View style={{ width: SPACE.lg - SPACE.sm }} />
              {quick.map((q) => (
                <QuickPlace key={q.summary.area.id} summary={q.summary} icon={q.icon} band={band} onPress={() => open(q.summary.area.id)} />
              ))}
              <View style={{ width: SPACE.lg - SPACE.sm }} />
            </ScrollView>
          ) : null}
          {notice ? <Banner tone="info" icon="location">{notice}</Banner> : null}

          {cities.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={t('home.cityPicker')} contentContainerStyle={{ gap: SPACE.sm }} style={{ marginHorizontal: -SPACE.lg }}>
              <View style={{ width: SPACE.lg - SPACE.sm }} />
              {['all', ...cities].map((name) => (
                <Chip key={name} label={name === 'all' ? t('home.allZambia') : name} icon={name === 'all' ? 'globe-outline' : undefined} selected={name === city} onPress={() => setSettings({ city: name })} />
              ))}
              <View style={{ width: SPACE.lg - SPACE.sm }} />
            </ScrollView>
          ) : null}

          {list.length ? (
            <>
              <View style={{ gap: SPACE.sm }}>
                <Text style={[TYPE.overline, { color: c.muted }]}>{t('home.rightNow', { band: t(`bands.${band}`) })}</Text>
                {counts.high + counts.moderate + counts.low ? (
                  <View style={[styles.row, { gap: SPACE.sm }]}>
                    {SUMMARY.map((r) => (
                      <SummaryTile key={r} rating={r} count={counts[r]} />
                    ))}
                  </View>
                ) : (
                  // Zeros would read as "no crime"; say plainly that there is nothing verified to rate yet.
                  <Banner tone="info" icon="help-circle">
                    {t('home.noRatingsYet', { place: city === 'all' ? t('home.allZambia') : city })}
                  </Banner>
                )}
                <RatingLegend />
                <Text style={[TYPE.small, { color: c.muted }]}>{t('home.mapHint')}</Text>
              </View>

              <View>
                <Text style={[TYPE.heading, { color: c.text, marginBottom: SPACE.xs }]}>{t('home.allAreas')}</Text>
                {sorted.map((s, i) => {
                  const score = s.scores[band];
                  const rating = score?.rating ?? 'insufficient_data';
                  const top = score?.breakdown.topCategories[0]?.key;
                  return (
                    <Pressable
                      key={s.area.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${s.area.name}, ${t(`rating.${rating}`)}`}
                      onPress={() => open(s.area.id)}
                      style={({ pressed }) => ({
                        minHeight: TAP + 16,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: SPACE.md,
                        paddingVertical: SPACE.sm,
                        borderTopWidth: i ? 1 : 0,
                        borderTopColor: c.border,
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="location" size={18} color={c.text} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{s.area.name}</Text>
                        <Text style={[TYPE.small, { color: c.muted }]} numberOfLines={1}>
                          {top ? t('home.mostlyCategory', { category: t(`categories.${top}`).toLowerCase() }) : t('rating.insufficient_data')}
                        </Text>
                      </View>
                      <ScoreBadge rating={rating} score={score?.score} />
                    </Pressable>
                  );
                })}
                <LastUpdated at={areas.dataUpdatedAt} />
              </View>
            </>
          ) : null}
          <Disclaimer />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
