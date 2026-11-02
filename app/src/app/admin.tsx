import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { currentBand } from '@watcher/scoring';
import { useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { AreaSearch } from '../components/AreaSearch';
import { Banner, Body, Button, Card, Chip, EmptyState, ErrorState, Screen, SectionTitle, Skeleton, styles } from '../components/ui';
import { DATA_MODE } from '../data/api';
import { liveSource } from '../data/liveSource';
import { useAreas } from '../data/queries';
import { RADIUS, SPACE, usePalette } from '../lib/theme';

interface PendingIncident {
  id: string;
  category: string;
  summary: string;
  source_id: string;
  source_url: string;
  published_at: string;
  location_text: string | null;
  area_id: string;
  confidence: string;
  review_note?: string | null;
}
interface PendingReport {
  id: string;
  area_id: string;
  type: string;
  note: string;
  created_at: string;
}

const SAMPLE_CSV = 'area,category,severity,substance,occurred_at,published_date,source,source_url,summary';

/**
 * Moderator tools (English only). Access is enforced server-side by the admin Edge Function;
 * this screen is only linked for profiles with is_moderator = true.
 */
export default function Admin() {
  const c = usePalette();
  const queryClient = useQueryClient();
  const areas = useAreas();
  const [areaFor, setAreaFor] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<'incidents' | 'stats'>('incidents');
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [data, setData] = useState(SAMPLE_CSV + '\n');
  const [importResult, setImportResult] = useState<string | null>(null);

  const pending = useQuery({
    queryKey: ['admin', 'pending'],
    enabled: DATA_MODE === 'live',
    queryFn: () => liveSource.admin<{ incidents: PendingIncident[]; reports: PendingReport[] }>({ action: 'list_pending' }),
  });
  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => liveSource.admin(body),
    onSuccess: () => void queryClient.invalidateQueries(),
  });

  if (DATA_MODE !== 'live') return <Screen edges={[]}><Banner tone="info" icon="information-circle">Moderator tools need the Watcher backend.</Banner></Screen>;
  if (pending.isLoading) return <Screen edges={[]}><Skeleton height={200} /></Screen>;
  if (pending.isError) return <Screen edges={[]}><ErrorState message={pending.error.message} onRetry={() => void pending.refetch()} /></Screen>;

  const name = (id: string) => areas.data?.find((a) => a.area.id === id)?.area.name ?? id;

  return (
    <Screen edges={[]}>
      {act.isError ? <Banner tone="danger" icon="alert-circle">{act.error.message}</Banner> : null}
      <Card>
        <SectionTitle icon="newspaper">{`Pending incidents (${pending.data?.incidents.length ?? 0})`}</SectionTitle>
        {!pending.data?.incidents.length ? <EmptyState icon="checkmark-done" message="Nothing to review." /> : null}
        {pending.data?.incidents.map((i) => (
          <View key={i.id} style={{ borderTopWidth: 1, borderTopColor: c.border, paddingVertical: SPACE.md, gap: SPACE.sm }}>
            <Text style={{ color: c.text, fontWeight: '700' }}>
              {i.category} · {i.confidence} · {new Date(i.published_at).toLocaleDateString()}
            </Text>
            <Body>{i.summary}</Body>
            {i.location_text ? <Body muted>Location text: {i.location_text}</Body> : null}
            {i.review_note ? <Body muted>Pipeline: {i.review_note}</Body> : null}
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(i.source_url)}>
              <Text style={{ color: c.primary, textDecorationLine: 'underline' }}>{i.source_url}</Text>
            </Pressable>
            <Body muted>Area: {areaFor[i.id] ? name(areaFor[i.id]!) : i.area_id ? name(i.area_id) : 'not mapped'}</Body>
            <AreaSearch areas={areas.data ?? []} band={currentBand()} placeholder="Set area" onSelect={(a) => setAreaFor((m) => ({ ...m, [i.id]: a.id }))} />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button label="Verify" icon="checkmark" loading={act.isPending} onPress={() => act.mutate({ action: 'review_incident', id: i.id, decision: 'verify', area_id: areaFor[i.id] })} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Reject" icon="close" variant="danger" onPress={() => act.mutate({ action: 'review_incident', id: i.id, decision: 'reject' })} />
              </View>
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <SectionTitle icon="chatbubbles">{`Pending community reports (${pending.data?.reports.length ?? 0})`}</SectionTitle>
        <Body muted>Approving shows a report as moderator-approved. It still never changes a rating.</Body>
        {pending.data?.reports.map((r) => (
          <View key={r.id} style={{ borderTopWidth: 1, borderTopColor: c.border, paddingVertical: SPACE.md, gap: SPACE.sm }}>
            <Text style={{ color: c.text, fontWeight: '700' }}>
              {r.type} · {name(r.area_id)} · {new Date(r.created_at).toLocaleString()}
            </Text>
            <Body>{r.note}</Body>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button label="Approve" icon="checkmark" onPress={() => act.mutate({ action: 'review_report', id: r.id, decision: 'approve' })} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Reject" icon="close" variant="danger" onPress={() => act.mutate({ action: 'review_report', id: r.id, decision: 'reject' })} />
              </View>
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <SectionTitle icon="cloud-upload">Verified import</SectionTitle>
        <Body muted>
          Official records only. Every row needs a registered source URL and a published date; untraceable rows are rejected. Incident CSV columns: {SAMPLE_CSV}. Stats columns: area,city,category,period_start,period_end,count,source_url,published_date,notes.
        </Body>
        <View style={[styles.row, { flexWrap: 'wrap' }]}>
          <Chip label="Incidents" selected={kind === 'incidents'} onPress={() => setKind('incidents')} />
          <Chip label="Statistics" selected={kind === 'stats'} onPress={() => setKind('stats')} />
          <Chip label="CSV" selected={format === 'csv'} onPress={() => setFormat('csv')} />
          <Chip label="JSON" selected={format === 'json'} onPress={() => setFormat('json')} />
        </View>
        <TextInput
          value={data}
          onChangeText={setData}
          multiline
          accessibilityLabel="Import data"
          style={{ minHeight: 140, borderWidth: 1, borderColor: c.border, borderRadius: RADIUS, padding: SPACE.md, color: c.text, fontFamily: 'monospace', textAlignVertical: 'top' }}
        />
        <Button
          label="Import"
          icon="cloud-upload"
          loading={act.isPending}
          onPress={() =>
            act.mutate(
              { action: 'import', kind, format, data },
              { onSuccess: (res) => setImportResult(JSON.stringify(res, null, 1)) },
            )
          }
        />
        {importResult ? <Text style={{ color: c.text, fontFamily: 'monospace', fontSize: 12 }}>{importResult}</Text> : null}
      </Card>
    </Screen>
  );
}
