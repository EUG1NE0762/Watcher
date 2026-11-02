import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import type { LatLng } from '@watcher/scoring';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, Text, View } from 'react-native';
import { nearbyHelp } from '../lib/device';
import { SPACE, usePalette } from '../lib/theme';
import { Body, Skeleton, styles } from './ui';

export function NearbyHelp({ center }: { center: LatLng }) {
  const { t } = useTranslation();
  const c = usePalette();
  const q = useQuery({
    queryKey: ['nearby', center.lat.toFixed(3), center.lng.toFixed(3)],
    queryFn: () => nearbyHelp(center),
    staleTime: 24 * 60 * 60 * 1000,
  });
  if (q.isLoading) return <Skeleton height={60} />;
  const list = q.data ?? [];
  if (!list.length) return <Body muted>{t('area.nearbyNone')}</Body>;
  return (
    <View style={{ gap: SPACE.xs }}>
      {list.map((f) => (
        <Pressable
          key={`${f.name}-${f.lat}`}
          accessibilityRole="link"
          accessibilityLabel={`${f.name}, ${f.km.toFixed(1)} km`}
          onPress={() => void Linking.openURL(`https://www.openstreetmap.org/?mlat=${f.lat}&mlon=${f.lng}#map=17/${f.lat}/${f.lng}`)}
          style={[styles.row, { minHeight: 44 }]}
        >
          <Ionicons name={f.kind === 'police' ? 'shield' : 'medkit'} size={18} color={c.text} />
          <Text style={{ color: c.text, flex: 1 }}>{f.name}</Text>
          <Text style={{ color: c.muted }}>{f.km.toFixed(1)} km</Text>
        </Pressable>
      ))}
      {list.some((f) => f.approximate) ? <Body muted>{t('area.nearbyApprox')}</Body> : null}
    </View>
  );
}
