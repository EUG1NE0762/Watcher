import Ionicons from '@expo/vector-icons/Ionicons';
import { areaAtPoint, corridorAreas, getPrecautions, precautionText, type Area, type RatingResult } from '@watcher/scoring';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { AreaSearch } from '../../components/AreaSearch';
import AreaMap from '../../components/map/AreaMap';
import type { MapEvent, MapMarker } from '../../components/map/mapHtml';
import { useMapData } from '../../components/map/useMapData';
import { RatingPill, resolveBand, ScoreBadge, TimeBandSelector, type BandChoice } from '../../components/rating';
import { Banner, Body, Card, Chip, DemoBadge, Disclaimer, Screen, SectionTitle, Skeleton, styles } from '../../components/ui';
import { scoreFor } from '../../data/api';
import { useAreas } from '../../data/queries';
import { locateArea } from '../../lib/device';
import { RATING_STYLE, SPACE, TYPE, usePalette, useRatingTint } from '../../lib/theme';
import { usePlaces } from '../../state/places';
import { useSettings } from '../../state/settings';

type Slot = 'pickup' | 'dropoff';
type Stop = { area: Area; point: { lat: number; lng: number } };
const ORDER: RatingResult[] = ['insufficient_data', 'low', 'moderate', 'high'];
const worst = (rs: RatingResult[]) => rs.reduce<RatingResult>((w, r) => (ORDER.indexOf(r) > ORDER.indexOf(w) ? r : w), 'insufficient_data');

function BigRating({ label, area, rating, score }: { label: string; area: Area | null; rating: RatingResult; score?: number | null }) {
  const { t } = useTranslation();
  const c = usePalette();
  const { fg, bg } = useRatingTint(rating);
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${area?.name ?? '–'}, ${t(`rating.${rating}`)}`}
      style={{ flex: 1, borderRadius: 16, backgroundColor: bg, padding: SPACE.md, alignItems: 'center', gap: 4 }}
    >
      <Text style={[TYPE.overline, { color: c.muted }]}>{label}</Text>
      <Ionicons name={RATING_STYLE[rating].icon} size={34} color={fg} />
      <Text style={{ color: fg, fontSize: 22, fontWeight: '900' }}>{t(`rating.${rating}`)}</Text>
      <Text style={{ color: c.text, fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>
        {area?.name ?? '–'}
        {score != null ? ` · ${score}` : ''}
      </Text>
    </View>
  );
}

/** One leg of the route card: a timeline marker plus either the chosen area or a search field. */
function Leg({
  slot,
  value,
  children,
  onClear,
  onOpen,
  last,
  rating,
  score,
}: {
  slot: Slot;
  value: Stop | null;
  children: React.ReactNode;
  onClear: () => void;
  onOpen: () => void;
  last?: boolean;
  rating: RatingResult;
  score?: number | null;
}) {
  const { t } = useTranslation();
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', gap: SPACE.md }}>
      <View style={{ alignItems: 'center', width: 18, paddingTop: 16 }}>
        <View
          style={{
            width: 14,
            height: 14,
            borderRadius: slot === 'pickup' ? 7 : 3,
            backgroundColor: slot === 'pickup' ? c.primary : c.ink,
          }}
        />
        {!last ? <View style={{ flex: 1, width: 2, backgroundColor: c.border, marginTop: 4 }} /> : null}
      </View>
      <View style={{ flex: 1, gap: SPACE.sm, paddingBottom: last ? 0 : SPACE.md }}>
        <Text style={[TYPE.overline, { color: c.muted, marginTop: 12 }]}>{t(`driver.${slot}`)}</Text>
        {value ? (
          <View style={[styles.row, { minHeight: 44 }]}>
            <Pressable accessibilityRole="button" onPress={onOpen} style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 18, fontWeight: '800' }}>{value.area.name}</Text>
            </Pressable>
            <ScoreBadge rating={rating} score={score} />
            <Pressable accessibilityRole="button" accessibilityLabel={`${t('driver.clear')} ${t(`driver.${slot}`)}`} onPress={onClear} hitSlop={10}>
              <Ionicons name="close-circle" size={22} color={c.subtle} />
            </Pressable>
          </View>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

export default function Driver() {
  const { t } = useTranslation();
  const c = usePalette();
  const router = useRouter();
  const areasQ = useAreas();
  const language = useSettings((s) => s.language);
  const addHistory = usePlaces((s) => s.addHistory);
  const [choice, setChoice] = useState<BandChoice>('now');
  const band = resolveBand(choice);
  const [pickup, setPickup] = useState<Stop | null>(null);
  const [dropoff, setDropoff] = useState<Stop | null>(null);
  const [mapTarget, setMapTarget] = useState<Slot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const summaries = useMemo(() => areasQ.data ?? [], [areasQ.data]);
  const byId = useMemo(() => new Map(summaries.map((s) => [s.area.id, s])), [summaries]);
  const areas = useMemo(() => summaries.map((s) => s.area), [summaries]);

  const scoreOf = (a: Area | undefined | null) => (a && byId.get(a.id) ? scoreFor(byId.get(a.id)!, band) : null);
  const pickupScore = scoreOf(pickup?.area);
  const dropoffScore = scoreOf(dropoff?.area);
  const corridor = useMemo(
    () => (pickup && dropoff ? corridorAreas(pickup.point, dropoff.point, areas).filter((a) => a.id !== pickup.area.id && a.id !== dropoff.area.id) : []),
    [pickup, dropoff, areas],
  );
  const corridorRatings = corridor.map((a) => scoreOf(a)?.rating ?? 'insufficient_data');
  const routeRating = worst(corridorRatings);
  const ready = !!(pickup && dropoff && pickupScore && dropoffScore);

  const markers = useMemo<MapMarker[]>(
    () => [
      ...(pickup ? [{ ...pickup.point, label: t('driver.pickup'), color: '#1456A0' }] : []),
      ...(dropoff ? [{ ...dropoff.point, label: t('driver.dropoff'), color: '#0B1F33' }] : []),
    ],
    [pickup, dropoff, t],
  );
  const line = useMemo<[number, number][] | null>(
    () => (pickup && dropoff ? [[pickup.point.lat, pickup.point.lng], [dropoff.point.lat, dropoff.point.lng]] : null),
    [pickup, dropoff],
  );
  // Show the towns the trip touches (or the home town before any stop is picked), not the whole country.
  const homeCity = useSettings((st) => st.city);
  const mapAreas = useMemo(() => {
    const towns = new Set([pickup?.area.city, dropoff?.area.city].filter((x): x is string => !!x));
    if (!towns.size && homeCity !== 'all') towns.add(homeCity);
    const subset = summaries.filter((s) => towns.has(s.area.city));
    return subset.length ? subset : summaries;
  }, [summaries, pickup?.area.city, dropoff?.area.city, homeCity]);
  const mapData = useMapData(mapAreas, band, { markers, line, fitKey: `${pickup?.area.id ?? ''}|${dropoff?.area.id ?? ''}|${homeCity}` });

  useEffect(() => {
    if (ready) {
      addHistory({ kind: 'trip', pickupId: pickup!.area.id, dropoffId: dropoff!.area.id, band, rating: worst([pickupScore!.rating, dropoffScore!.rating, routeRating]) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pickup?.area.id, dropoff?.area.id, band]);

  const set = (slot: Slot, area: Area, point = area.centroid) => (slot === 'pickup' ? setPickup({ area, point }) : setDropoff({ area, point }));

  const onMapEvent = (e: MapEvent) => {
    if (!mapTarget) return;
    if (e.type === 'area') {
      const a = areas.find((x) => x.id === e.id);
      if (a) set(mapTarget, a);
    } else if (e.type === 'point') {
      const a = areaAtPoint({ lat: e.lat, lng: e.lng }, areas, 1.5);
      if (a) set(mapTarget, a, { lat: e.lat, lng: e.lng });
    } else return;
    setMapTarget(mapTarget === 'pickup' && !dropoff ? 'dropoff' : null);
  };

  const fromLocation = async () => {
    setNotice(null);
    const res = await locateArea(areas);
    if (res.status === 'ok') set('pickup', res.area, res.point);
    else setNotice(res.status === 'denied' ? t('home.locationDenied') : t('home.noArea'));
  };

  const highAt = ready
    ? [
        pickupScore!.rating === 'high' ? pickup!.area.name : null,
        dropoffScore!.rating === 'high' ? dropoff!.area.name : null,
        ...corridor.filter((_, i) => corridorRatings[i] === 'high').map((a) => a.name),
      ].filter((x): x is string => !!x)
    : [];
  const usesDemo = ready && (pickupScore!.breakdown.usesDemoData || dropoffScore!.breakdown.usesDemoData);
  const advice = ready
    ? [
        ...getPrecautions({ role: 'driver', band, rating: pickupScore!.rating, topCategories: pickupScore!.breakdown.topCategories.map((x) => x.key), isDropoff: false }),
        ...getPrecautions({ role: 'driver', band, rating: worst([dropoffScore!.rating, routeRating]), topCategories: dropoffScore!.breakdown.topCategories.map((x) => x.key), isDropoff: true }),
      ]
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, 7)
    : [];

  return (
    <Screen title={t('driver.title')} subtitle={t('driver.subtitle')}>
      <Card style={{ gap: 0 }}>
        {(['pickup', 'dropoff'] as Slot[]).map((slot) => {
          const value = slot === 'pickup' ? pickup : dropoff;
          const s = scoreOf(value?.area);
          return (
            <Leg
              key={slot}
              slot={slot}
              value={value}
              last={slot === 'dropoff'}
              rating={s?.rating ?? 'insufficient_data'}
              score={s?.score}
              onClear={() => (slot === 'pickup' ? setPickup(null) : setDropoff(null))}
              onOpen={() => value && router.push({ pathname: '/area/[id]', params: { id: value.area.id } })}
            >
              <AreaSearch
                areas={summaries}
                band={band}
                placeholder={t('driver.choose')}
                onSelect={(a) => set(slot, a)}
                onLocate={slot === 'pickup' ? () => void fromLocation() : undefined}
              />
            </Leg>
          );
        })}
        <View style={[styles.row, { flexWrap: 'wrap', marginTop: SPACE.md }]}>
          <Chip label={t('driver.pickOnMap')} icon="map" selected={!!mapTarget} onPress={() => setMapTarget(mapTarget ? null : pickup ? 'dropoff' : 'pickup')} />
        </View>
      </Card>
      {notice ? <Banner tone="info" icon="location">{notice}</Banner> : null}

      <TimeBandSelector value={choice} onChange={setChoice} />

      {highAt.length ? (
        <Banner tone="danger" icon="warning">
          {t('driver.highBanner', { where: highAt.join(', ') })}
        </Banner>
      ) : null}

      {ready ? (
        <Card style={{ gap: SPACE.md }}>
          <SectionTitle icon="speedometer" right={usesDemo ? <DemoBadge /> : null}>
            {`${t('driver.quickCard')} · ${t(`bands.${band}`)}`}
          </SectionTitle>
          <View style={[styles.row, { alignItems: 'stretch' }]}>
            <BigRating label={t('driver.pickup')} area={pickup!.area} rating={pickupScore!.rating} score={pickupScore!.score} />
            <BigRating label={t('driver.dropoff')} area={dropoff!.area} rating={dropoffScore!.rating} score={dropoffScore!.score} />
          </View>
          <View style={[styles.row, { flexWrap: 'wrap', backgroundColor: c.raised, borderRadius: 12, padding: SPACE.md }]}>
            <Ionicons name="git-commit" size={18} color={c.muted} />
            <Text style={{ color: c.text, fontWeight: '700' }}>{t('driver.route')}</Text>
            {corridor.length ? <RatingPill rating={routeRating} /> : null}
            <Text style={[TYPE.small, { color: c.muted, flexBasis: '100%' }]}>
              {corridor.length ? t('driver.routeAreas', { list: corridor.map((a) => a.name).join(', ') }) : t('driver.routeNone')}
            </Text>
          </View>
          {advice.slice(0, 3).map((p) => (
            <View key={p} style={[styles.row, { alignItems: 'flex-start' }]}>
              <Ionicons name="alert-circle" size={20} color={c.text} />
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', flex: 1, lineHeight: 22 }}>{precautionText(p, language)}</Text>
            </View>
          ))}
        </Card>
      ) : (
        <Banner tone="info" icon="information-circle">{t('driver.selectBoth')}</Banner>
      )}

      {mapTarget ? <Banner tone="info" icon="hand-left">{t(mapTarget === 'pickup' ? 'driver.tapToSetPickup' : 'driver.tapToSetDropoff')}</Banner> : null}
      {areasQ.isLoading ? (
        <Skeleton height={260} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <AreaMap data={mapData} onEvent={onMapEvent} height={260} accessibilityLabel={t('driver.pickOnMap')} />
        </Card>
      )}

      {ready ? (
        <Card>
          <SectionTitle icon="car">{t('driver.advice')}</SectionTitle>
          {advice.map((p) => (
            <View key={p} style={[styles.row, { alignItems: 'flex-start' }]}>
              <Ionicons name="checkmark-circle" size={20} color={c.primary} />
              <Body style={{ flex: 1 }}>{precautionText(p, language)}</Body>
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <SectionTitle icon="close-circle">{t('driver.declineTitle')}</SectionTitle>
        {(['decline1', 'decline2', 'decline3', 'decline4'] as const).map((k, i) => (
          <View key={k} style={[styles.row, { alignItems: 'flex-start', gap: SPACE.md }]}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: c.text, fontWeight: '800', fontSize: 12 }}>{i + 1}</Text>
            </View>
            <Body style={{ flex: 1 }}>{t(`driver.${k}`)}</Body>
          </View>
        ))}
      </Card>
      <Disclaimer />
    </Screen>
  );
}
