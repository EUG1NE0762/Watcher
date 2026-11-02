import Ionicons from '@expo/vector-icons/Ionicons';
import type { Category, Confidence } from '@watcher/scoring';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, Text, View } from 'react-native';
import type { IncidentView } from '../data/types';
import { RADIUS_SM, SPACE, TYPE, usePalette } from '../lib/theme';
import { DemoBadge, IconBadge, styles, type IconName } from './ui';

const CATEGORY_ICON: Record<Category, IconName> = {
  theft: 'bag-handle',
  robbery: 'hand-left',
  assault: 'alert',
  burglary: 'home',
  vehicle_crime: 'car',
  sexual_offence: 'shield',
  drug_offence: 'flask',
  other: 'ellipsis-horizontal',
};

export function ConfidenceBadge({ level }: { level: Confidence }) {
  const { t } = useTranslation();
  const c = usePalette();
  const icon: IconName = level === 'high' ? 'checkmark-done-circle' : level === 'medium' ? 'checkmark-circle-outline' : 'ellipse-outline';
  return (
    <View style={[styles.badge, { backgroundColor: c.chip }]}>
      <Ionicons name={icon} size={12} color={c.text} />
      <Text style={{ color: c.text, fontSize: 11, fontWeight: '700' }}>{t(`confidence.${level}`)}</Text>
    </View>
  );
}

export function IncidentItem({ incident }: { incident: IncidentView }) {
  const { t } = useTranslation();
  const c = usePalette();
  const date = new Date(incident.occurred_at).toLocaleDateString();
  return (
    <View style={{ flexDirection: 'row', gap: SPACE.md, padding: SPACE.md, backgroundColor: c.raised, borderRadius: RADIUS_SM }}>
      <IconBadge icon={CATEGORY_ICON[incident.category]} size={34} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={[styles.row, { flexWrap: 'wrap', gap: 6 }]}>
          <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>{t(`categories.${incident.category}`)}</Text>
          {incident.substance ? <Text style={[TYPE.small, { color: c.muted }]}>· {t(`substances.${incident.substance}`)}</Text> : null}
          <Text style={[TYPE.small, { color: c.subtle }]}>· {date}</Text>
        </View>
        <Text style={[TYPE.small, { color: c.text, fontSize: 14, lineHeight: 20 }]}>{incident.summary}</Text>
        <View style={[styles.row, { flexWrap: 'wrap', gap: 6 }]}>
          <ConfidenceBadge level={incident.confidence} />
          {incident.is_demo ? <DemoBadge /> : null}
        </View>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${t('common.openSource')}: ${incident.source_name}, ${new Date(incident.published_at).toLocaleDateString()}`}
          onPress={() => void Linking.openURL(incident.source_url)}
          style={[styles.row, { minHeight: 36, gap: 6 }]}
        >
          <Ionicons name="open-outline" size={14} color={c.primary} />
          <Text style={{ color: c.primary, flex: 1, fontSize: 13, fontWeight: '600' }} numberOfLines={2}>
            {t('area.sourceLine', { source: incident.source_name, date: new Date(incident.published_at).toLocaleDateString() })}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
