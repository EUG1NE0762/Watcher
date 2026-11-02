import { useQuery, useQueryClient } from '@tanstack/react-query';
import { currentBand, moderateText, REPORT_TYPES, type ReportType } from '@watcher/scoring';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, Text, TextInput, View } from 'react-native';
import { AreaSearch } from '../components/AreaSearch';
import { Banner, Body, Button, Card, Chip, EmptyState, Screen, SectionTitle, styles } from '../components/ui';
import { DATA_MODE } from '../data/api';
import { liveSource } from '../data/liveSource';
import { queryKeys, useAreas } from '../data/queries';
import type { MyReport } from '../data/types';
import { currentPoint } from '../lib/device';
import { ensureSession } from '../lib/supabase';
import { RADIUS, SPACE, TAP, usePalette } from '../lib/theme';
import { usePlaces } from '../state/places';
import { useSettings } from '../state/settings';

export default function Report() {
  const { areaId } = useLocalSearchParams<{ areaId?: string }>();
  const { t } = useTranslation();
  const c = usePalette();
  const queryClient = useQueryClient();
  const areas = useAreas();
  const allowLocation = useSettings((s) => s.shareLocationWithReports);
  const { localReports, addLocalReport } = usePlaces();
  const [selected, setSelected] = useState<string | undefined>(areaId);
  const [type, setType] = useState<ReportType>('theft');
  const [note, setNote] = useState('');
  const [attach, setAttach] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const area = useMemo(() => areas.data?.find((a) => a.area.id === selected)?.area, [areas.data, selected]);

  const mine = useQuery({
    queryKey: queryKeys.myReports,
    queryFn: async (): Promise<MyReport[]> => (DATA_MODE === 'live' ? liveSource.myReports() : []),
  });
  const myReports: MyReport[] = DATA_MODE === 'live' ? (mine.data ?? []) : localReports;
  const check = moderateText(note);

  const submit = async () => {
    setResult(null);
    if (!area) return setResult({ tone: 'danger', text: t('report.chooseArea') });
    if (!check.ok) return setResult({ tone: 'danger', text: check.reasons.map((r) => t(`report.blocked.${r}`)).join(' ') });
    setBusy(true);
    try {
      const point = attach && allowLocation ? await currentPoint() : null;
      if (DATA_MODE === 'live') {
        await ensureSession();
        await liveSource.submitReport({ area_id: area.id, type, note: note.trim(), lat: point?.lat ?? null, lng: point?.lng ?? null });
        await queryClient.invalidateQueries({ queryKey: queryKeys.myReports });
        await queryClient.invalidateQueries({ queryKey: queryKeys.area(area.id) });
        setResult({ tone: 'info', text: t('report.submitted') });
      } else {
        addLocalReport({ area_id: area.id, type, note: note.trim() });
        setResult({ tone: 'info', text: `${t('report.submitted')} ${t('report.demoLocal')}` });
      }
      setNote('');
    } catch (e) {
      setResult({ tone: 'danger', text: e instanceof Error ? e.message : t('common.error') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      <Banner tone="info" icon="information-circle">{t('area.communityExplain')}</Banner>
      <Card>
        <SectionTitle icon="location">{t('report.area')}</SectionTitle>
        {area ? (
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>{area.name}</Text>
            <Chip label={t('driver.clear')} onPress={() => setSelected(undefined)} />
          </View>
        ) : (
          <AreaSearch areas={areas.data ?? []} band={currentBand()} onSelect={(a) => setSelected(a.id)} />
        )}

        <SectionTitle icon="list">{t('report.type')}</SectionTitle>
        <View style={[styles.row, { flexWrap: 'wrap' }]}>
          {REPORT_TYPES.map((rt) => (
            <Chip key={rt} label={t(`report.types.${rt}`)} selected={type === rt} onPress={() => setType(rt)} />
          ))}
        </View>

        <SectionTitle icon="create">{t('report.note')}</SectionTitle>
        <Body muted>{t('report.rules')}</Body>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={280}
          placeholder={t('report.notePlaceholder')}
          placeholderTextColor={c.muted}
          accessibilityLabel={t('report.note')}
          style={{ minHeight: 100, borderWidth: 1, borderColor: c.border, borderRadius: RADIUS, padding: SPACE.md, color: c.text, fontSize: 16, textAlignVertical: 'top' }}
        />
        <Text style={{ color: c.muted, alignSelf: 'flex-end' }}>{note.length}/280</Text>
        {note && !check.ok ? <Banner tone="warn" icon="alert-circle">{check.reasons.map((r) => t(`report.blocked.${r}`)).join(' ')}</Banner> : null}

        {allowLocation ? (
          <View style={[styles.row, { minHeight: TAP, justifyContent: 'space-between' }]}>
            <Text style={{ color: c.text, flex: 1 }}>{t('report.attachLocation')}</Text>
            <Switch accessibilityLabel={t('report.attachLocation')} value={attach} onValueChange={setAttach} />
          </View>
        ) : null}

        <Button label={t('report.submit')} icon="send" loading={busy} disabled={note.trim().length < 5 || !area} onPress={() => void submit()} />
        {result ? <Banner tone={result.tone} icon={result.tone === 'info' ? 'checkmark-circle' : 'alert-circle'}>{result.text}</Banner> : null}
      </Card>

      <Card>
        <SectionTitle icon="document-text">{t('report.myReports')}</SectionTitle>
        {myReports.length === 0 ? <EmptyState icon="document-outline" message={t('report.noReports')} /> : null}
        {myReports.map((r) => (
          <View key={r.id} style={{ paddingVertical: SPACE.sm, borderTopWidth: 1, borderTopColor: c.border, gap: 2 }}>
            <Text style={{ color: c.text, fontWeight: '700' }}>
              {t(`report.types.${r.type}`)} · {areas.data?.find((a) => a.area.id === r.area_id)?.area.name ?? r.area_id}
            </Text>
            <Body>{r.note}</Body>
            <Text style={{ color: r.status === 'rejected' ? c.danger : c.muted }}>
              {t(`report.status.${r.status}`)} · {new Date(r.created_at).toLocaleDateString()}
            </Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
