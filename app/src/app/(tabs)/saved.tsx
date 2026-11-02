import Ionicons from '@expo/vector-icons/Ionicons';
import { currentBand, headlineRating, type ScoreResult } from '@watcher/scoring';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { RatingPill } from '../../components/rating';
import { Card, EmptyState, Screen, SectionTitle } from '../../components/ui';
import { useAreas } from '../../data/queries';
import { SPACE, TAP, usePalette } from '../../lib/theme';
import { usePlaces } from '../../state/places';

export default function Saved() {
  const { t } = useTranslation();
  const c = usePalette();
  const router = useRouter();
  const areas = useAreas();
  const { saved, history } = usePlaces();
  const byId = useMemo(() => new Map((areas.data ?? []).map((s) => [s.area.id, s])), [areas.data]);
  const band = currentBand();
  const name = (id?: string) => (id ? (byId.get(id)?.area.name ?? id) : '–');
  const open = (id: string) => router.push({ pathname: '/area/[id]', params: { id } });

  return (
    <Screen title={t('saved.title')}>
      <Card>
        {saved.length === 0 ? <EmptyState icon="bookmark-outline" message={t('saved.empty')} /> : null}
        {saved.map((p) => {
          const summary = byId.get(p.areaId);
          const now = summary?.scores[band];
          const headline = summary ? headlineRating(Object.values(summary.scores).filter((s): s is ScoreResult => !!s)) : null;
          const changed = p.lastRating && headline && p.lastRating !== headline;
          return (
            <Pressable
              key={p.areaId}
              accessibilityRole="button"
              onPress={() => open(p.areaId)}
              style={{ minHeight: TAP, paddingVertical: SPACE.sm, gap: 4, borderBottomWidth: 1, borderBottomColor: c.border }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>{name(p.areaId)}</Text>
                <RatingPill rating={now?.rating ?? 'insufficient_data'} score={now?.score} />
              </View>
              {changed ? (
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Ionicons name="notifications" size={14} color={c.warnText} />
                  <Text style={{ color: c.warnText }}>{t('saved.changed', { was: t(`rating.${p.lastRating}`) })}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </Card>

      <Card>
        <SectionTitle icon="time">{t('saved.history')}</SectionTitle>
        {history.length === 0 ? <EmptyState icon="time-outline" message={t('saved.emptyHistory')} /> : null}
        {history.slice(0, 20).map((h) => (
          <Pressable
            key={h.id}
            accessibilityRole="button"
            onPress={() => open((h.kind === 'trip' ? h.dropoffId : h.areaId)!)}
            style={{ minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderBottomWidth: 1, borderBottomColor: c.border }}
          >
            <Ionicons name={h.kind === 'trip' ? 'car' : 'location'} size={18} color={c.muted} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: '600' }}>
                {h.kind === 'trip' ? t('saved.trip', { from: name(h.pickupId), to: name(h.dropoffId) }) : name(h.areaId)}
              </Text>
              <Text style={{ color: c.muted, fontSize: 12 }}>
                {t(`bands.${h.band}`)} · {new Date(h.at).toLocaleString()}
              </Text>
            </View>
            <RatingPill rating={h.rating} />
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}
