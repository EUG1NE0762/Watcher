import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, Text, View } from 'react-native';
import { Banner, Body, Card, Screen, SectionTitle } from '../../components/ui';
import resources from '../../config/resources.json';
import { RADIUS, SPACE, TAP, usePalette } from '../../lib/theme';

interface LinkItem {
  id: string;
  label: string;
  url: string | null;
  note?: string;
  number?: string | null;
}

export default function Resources() {
  const { t } = useTranslation();
  const c = usePalette();
  return (
    <Screen title={t('resources.title')}>

      <Card>
        <SectionTitle icon="call">{t('resources.emergency')}</SectionTitle>
        {resources.emergency.map((e) => (
          <Pressable
            key={e.id}
            accessibilityRole="button"
            accessibilityLabel={`${e.label}. ${t('resources.call', { number: e.number })}`}
            onPress={() => void Linking.openURL(`tel:${e.number}`)}
            style={({ pressed }) => ({
              minHeight: TAP + 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.md,
              padding: SPACE.md,
              borderRadius: RADIUS,
              backgroundColor: pressed ? c.chip : c.bg,
            })}
          >
            <Ionicons name="call" size={22} color={c.danger} />
            <Text style={{ color: c.text, flex: 1, fontSize: 16 }}>{e.label}</Text>
            <Text style={{ color: c.danger, fontSize: 22, fontWeight: '900' }}>{e.number}</Text>
          </Pressable>
        ))}
        <Banner tone="info" icon="information-circle">{t('resources.verifyNote')}</Banner>
      </Card>

      <Card>
        <SectionTitle icon="heart">{t('resources.support')}</SectionTitle>
        <Body muted>{t('area.supportBody')}</Body>
        {(resources.support as LinkItem[]).map((s) => (
          <ResourceRow key={s.id} item={s} />
        ))}
      </Card>

      <Card>
        <SectionTitle icon="airplane">{t('resources.tourism')}</SectionTitle>
        {(resources.tourism as LinkItem[]).map((s) => (
          <ResourceRow key={s.id} item={s} />
        ))}
      </Card>
    </Screen>
  );
}

function ResourceRow({ item }: { item: LinkItem }) {
  const { t } = useTranslation();
  const c = usePalette();
  return (
    <View style={{ paddingVertical: SPACE.sm, gap: 4, borderTopWidth: 1, borderTopColor: c.border }}>
      <Text style={{ color: c.text, fontWeight: '700' }}>{item.label}</Text>
      {item.note ? <Body muted>{item.note}</Body> : null}
      {item.url ? (
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(item.url!)} style={{ minHeight: 40, justifyContent: 'center' }}>
          <Text style={{ color: c.primary, textDecorationLine: 'underline' }}>{t('resources.visit')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
