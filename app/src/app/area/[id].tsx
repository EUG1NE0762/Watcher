import Ionicons from '@expo/vector-icons/Ionicons';
import { getPrecautions, precautionText } from '@watcher/scoring';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, Text, View } from 'react-native';
import { IncidentItem } from '../../components/IncidentItem';
import { ListenButton } from '../../components/ListenButton';
import { NearbyHelp } from '../../components/NearbyHelp';
import { BandCards, RatingHero, resolveBand, type BandChoice } from '../../components/rating';
import {
  BarList,
  Body,
  Button,
  Card,
  Disclaimer,
  EmptyState,
  ErrorState,
  LastUpdated,
  Screen,
  SectionTitle,
  Skeleton,
  StatTile,
  styles,
} from '../../components/ui';
import { scoreFor } from '../../data/api';
import { useAreaDetail } from '../../data/queries';
import { SPACE, TYPE, usePalette, useRatingColor } from '../../lib/theme';
import { usePlaces } from '../../state/places';
import { useSettings } from '../../state/settings';

export default function AreaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = usePalette();
  const router = useRouter();
  const { role, language } = useSettings();
  const [choice, setChoice] = useState<BandChoice>('now');
  const band = resolveBand(choice);
  const q = useAreaDetail(id);
  const saved = usePlaces((s) => s.saved.some((p) => p.areaId === id));
  const toggleSaved = usePlaces((s) => s.toggleSaved);
  const addHistory = usePlaces((s) => s.addHistory);
  const detail = q.data;
  const score = detail ? scoreFor(detail, band) : null;
  const ratingColor = useRatingColor(score?.rating ?? 'insufficient_data');

  useEffect(() => {
    if (detail && score) addHistory({ kind: 'area', areaId: detail.area.id, band, rating: score.rating });
    // record once per area/band view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.area.id, band]);

  if (q.isLoading) {
    return (
      <Screen edges={[]}>
        <Skeleton height={200} />
        <Skeleton height={48} />
        <Skeleton height={52} />
        <Skeleton height={180} />
      </Screen>
    );
  }
  if (!detail || !score) {
    return (
      <Screen edges={[]}>
        <ErrorState message={q.error?.message === 'not_found' ? t('area.notFound') : undefined} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }

  const b = score.breakdown;
  const bandLabel = choice === 'now' ? t('bands.nowWith', { band: t(`bands.${band}`) }) : t(`bands.${band}`);
  const precautions = getPrecautions({ role, band, rating: score.rating, topCategories: b.topCategories.map((x) => x.key) });
  const trendIcon = b.trend === 'up' ? 'trending-up' : b.trend === 'down' ? 'trending-down' : 'remove';
  const latest =
    b.daysSinceLatest == null ? '–' : b.daysSinceLatest === 0 ? t('common.today') : t('common.daysAgo', { count: b.daysSinceLatest });

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: detail.area.name }} />

      <RatingHero
        score={score}
        bandLabel={bandLabel}
        header={
          <View style={[styles.row, { alignItems: 'flex-start' }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text accessibilityRole="header" style={[TYPE.title, { color: c.text }]}>
                {detail.area.name}
              </Text>
              <Text style={[TYPE.small, { color: c.muted }]}>
                {detail.area.city} · {detail.area.description}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={saved ? t('area.unsave') : t('area.save')}
              accessibilityState={{ selected: saved }}
              onPress={() => toggleSaved(detail.area.id, score.rating)}
              hitSlop={8}
              style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={22} color={c.primary} />
            </Pressable>
          </View>
        }
      />

      <BandCards value={choice} onChange={setChoice} scoreOf={(b) => scoreFor(detail, b)} />

      <View style={[styles.row, { alignItems: 'flex-start' }]}>
        <ListenButton detail={detail} band={band} role={role} language={language} />
        <View style={{ flex: 1 }}>
          <Button
            label={t('area.ask')}
            icon="chatbubble-ellipses"
            onPress={() => router.push({ pathname: '/ask/[id]', params: { id: detail.area.id, band } })}
          />
        </View>
      </View>

      <Card>
        <SectionTitle icon="analytics">{t('area.whyTitle')}</SectionTitle>
        {score.rating === 'insufficient_data' ? <Body muted>{t('area.whyInsufficient')}</Body> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
          <StatTile icon="document-text" label={t('area.statIncidents')} value={String(b.incidentCount)} />
          <StatTile
            icon={trendIcon}
            label={t('area.statTrend')}
            value={score.rating === 'insufficient_data' ? '–' : `${t(`trend.${b.trend}`)} (${b.recentCount}/${b.previousCount})`}
          />
          <StatTile icon="checkmark-done" label={t('area.statConfidence')} value={t(`confidence.${b.confidenceLevel}`).replace(/ confidence$/i, '')} />
          <StatTile icon="time" label={t('area.statLatest')} value={latest} />
        </View>
        {b.topCategories.length ? (
          <Body>
            {t('area.whyTop', { list: b.topCategories.map((x) => t(`categories.${x.key}`)).join(', ') })}
          </Body>
        ) : null}
        <Text style={[TYPE.small, { color: c.muted }]}>{t('area.whyBand')}</Text>
        <LastUpdated at={score.computed_at} />
      </Card>

      {b.topCategories.length || b.topSubstances.length ? (
        <Card>
          <SectionTitle icon="bar-chart">{t('area.topCrimes')}</SectionTitle>
          <BarList color={ratingColor} items={b.topCategories.map((x) => ({ label: t(`categories.${x.key}`), count: x.count, share: x.share }))} />
          <View style={{ height: 1, backgroundColor: c.border, marginVertical: SPACE.xs }} />
          <SectionTitle icon="flask-outline">{t('area.topSubstances')}</SectionTitle>
          {b.topSubstances.length ? (
            <BarList color={c.primary} items={b.topSubstances.map((x) => ({ label: t(`substances.${x.key}`), count: x.count, share: x.share }))} />
          ) : (
            <Body muted>{t('area.noSubstances')}</Body>
          )}
        </Card>
      ) : null}

      <Card>
        <SectionTitle icon="shield-checkmark">{t('area.precautions')}</SectionTitle>
        {precautions.map((p, i) => (
          <View key={p} style={[styles.row, { alignItems: 'flex-start', gap: SPACE.md }]}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              <Text style={{ color: c.primary, fontWeight: '800', fontSize: 12 }}>{i + 1}</Text>
            </View>
            <Body style={{ flex: 1 }}>{precautionText(p, language)}</Body>
          </View>
        ))}
      </Card>

      <Card style={{ gap: SPACE.sm }}>
        <SectionTitle icon="newspaper">{t('area.recentIncidents')}</SectionTitle>
        {detail.incidents.length ? (
          detail.incidents.slice(0, 10).map((i) => <IncidentItem key={i.id} incident={i} />)
        ) : (
          <EmptyState icon="checkmark-circle-outline" message={t('area.noIncidents')} />
        )}
        <LastUpdated at={q.dataUpdatedAt} />
      </Card>

      {detail.officialStats.length ? (
        <Card>
          <SectionTitle icon="stats-chart">{t('area.officialStats')}</SectionTitle>
          {detail.officialStats.map((s, i) => (
            <Pressable key={i} accessibilityRole="link" onPress={() => void Linking.openURL(s.source_url)}>
              <Body>
                {s.category}: {s.count} ({s.period_start} – {s.period_end}) · {s.source_name}
              </Body>
            </Pressable>
          ))}
        </Card>
      ) : null}

      <Card style={{ borderStyle: 'dashed', borderWidth: 1.5 }}>
        <SectionTitle icon="chatbubbles-outline">{t('area.communityTitle')}</SectionTitle>
        <Text style={[TYPE.small, { color: c.muted }]}>{t('area.communityExplain')}</Text>
        {detail.communityReports.length ? (
          detail.communityReports.map((r) => (
            <View key={r.id} style={{ paddingTop: SPACE.sm, borderTopWidth: 1, borderTopColor: c.border, gap: 2 }}>
              <Text style={{ color: c.text, fontWeight: '600' }}>
                {t(`report.types.${r.type}`)} · {new Date(r.created_at).toLocaleDateString()} ·{' '}
                {r.corroborated ? t('area.corroborated') : r.status === 'approved' ? t('area.approved') : t('area.pending')}
              </Text>
              <Body>{r.note}</Body>
            </View>
          ))
        ) : (
          <EmptyState icon="chatbubble-outline" message={t('area.communityEmpty')} />
        )}
        <Button
          label={t('area.reportSomething')}
          icon="add-circle-outline"
          variant="secondary"
          onPress={() => router.push({ pathname: '/report', params: { areaId: detail.area.id } })}
        />
      </Card>

      <Card>
        <SectionTitle icon="medkit">{t('area.nearbyHelp')}</SectionTitle>
        <NearbyHelp center={detail.area.centroid} />
      </Card>

      <Card tint={c.primarySoft}>
        <SectionTitle icon="heart">{t('area.supportTitle')}</SectionTitle>
        <Body>{t('area.supportBody')}</Body>
        <Button label={t('area.supportLink')} variant="ghost" icon="arrow-forward" onPress={() => router.push('/resources')} />
      </Card>

      <Disclaimer />
    </Screen>
  );
}
