import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ColorValue } from 'react-native';
import { usePalette } from '../../lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color, size, fallback }: { name: IconName; color: ColorValue; size: number; fallback: string }) {
  return <Ionicons name={name} color={typeof color === 'string' ? color : fallback} size={size} />;
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const c = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border, minHeight: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.check'), tabBarIcon: (p) => <TabIcon name="search" color={p.color} size={p.size} fallback={c.muted} /> }} />
      <Tabs.Screen name="driver" options={{ title: t('tabs.driver'), tabBarIcon: (p) => <TabIcon name="car" color={p.color} size={p.size} fallback={c.muted} /> }} />
      <Tabs.Screen name="saved" options={{ title: t('tabs.saved'), tabBarIcon: (p) => <TabIcon name="bookmark" color={p.color} size={p.size} fallback={c.muted} /> }} />
      <Tabs.Screen name="resources" options={{ title: t('tabs.help'), tabBarIcon: (p) => <TabIcon name="call" color={p.color} size={p.size} fallback={c.muted} /> }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings'), tabBarIcon: (p) => <TabIcon name="settings" color={p.color} size={p.size} fallback={c.muted} /> }} />
    </Tabs>
  );
}
