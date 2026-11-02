import Ionicons from '@expo/vector-icons/Ionicons';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DATA_MODE } from '../data/api';
import { PILL, RADIUS, RADIUS_SM, SPACE, TAP, TYPE, usePalette, useScheme } from '../lib/theme';
import { useSettings } from '../state/settings';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({
  children,
  scroll = true,
  edges,
  title,
  subtitle,
  right,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
  title?: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const c = usePalette();
  const header = title ? <PageHeader title={title} subtitle={subtitle} right={right} /> : null;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={edges ?? ['top']}>
      <StatusStrips />
      {scroll ? (
        <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screen, { flex: 1 }]}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const c = usePalette();
  return (
    <View style={[styles.row, { alignItems: 'flex-end', justifyContent: 'space-between', marginTop: SPACE.sm }]}>
      <View style={{ flex: 1, gap: 2 }}>
        {subtitle ? <Text style={[TYPE.overline, { color: c.primary }]}>{subtitle}</Text> : null}
        <Text accessibilityRole="header" style={[TYPE.title, { color: c.text }]}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

/** Small brand lock-up used on the home screen. */
export function Brand({ city }: { city?: string }) {
  const c = usePalette();
  return (
    <View style={[styles.row, { justifyContent: 'space-between' }]}>
      <View style={styles.row}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="eye" size={20} color={c.primaryText} />
        </View>
        <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 }}>Watcher</Text>
      </View>
      {city ? (
        <View style={[styles.pill, { backgroundColor: c.card, borderColor: c.border }]}>
          <Ionicons name="location" size={14} color={c.primary} />
          <Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>{city}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function Card({ children, style, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; tint?: string }) {
  const c = usePalette();
  return (
    <View style={[styles.card, { backgroundColor: tint ?? c.card, borderColor: tint ? 'transparent' : c.border, boxShadow: `0 1px 3px ${c.shadow}` }, style]}>
      {children}
    </View>
  );
}

export function H1({ children }: { children: ReactNode }) {
  const c = usePalette();
  return (
    <Text accessibilityRole="header" style={[TYPE.title, { color: c.text }]}>
      {children}
    </Text>
  );
}

export function IconBadge({ icon, color, bg, size = 30 }: { icon: IconName; color?: string; bg?: string; size?: number }) {
  const c = usePalette();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2.6, backgroundColor: bg ?? c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.55} color={color ?? c.primary} />
    </View>
  );
}

export function SectionTitle({ children, icon, right }: { children: ReactNode; icon?: IconName; right?: ReactNode }) {
  const c = usePalette();
  return (
    <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 2 }]}>
      <View style={[styles.row, { flex: 1 }]}>
        {icon ? <IconBadge icon={icon} size={28} /> : null}
        <Text accessibilityRole="header" style={[TYPE.heading, { color: c.text, flex: 1 }]}>
          {children}
        </Text>
      </View>
      {right}
    </View>
  );
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = usePalette();
  return <Text style={[TYPE.body, { color: muted ? c.muted : c.text }, style as object]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled,
  loading,
  a11yHint,
  compact,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  a11yHint?: string;
  compact?: boolean;
}) {
  const c = usePalette();
  const bg = { primary: c.primary, secondary: c.card, danger: c.dangerBg, ghost: 'transparent' }[variant];
  const fg = { primary: c.primaryText, secondary: c.text, danger: c.danger, ghost: c.primary }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={a11yHint}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: c.border,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
          minHeight: compact ? 40 : TAP + 4,
        },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={19} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? c.primary : c.primarySoft,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={active ? c.primaryText : c.primary} />
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress: () => void; icon?: IconName }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? c.primary : c.card, borderColor: selected ? c.primary : c.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={selected ? c.primaryText : c.muted} /> : null}
      <Text style={{ color: selected ? c.primaryText : c.text, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** Pill-track segmented control; scrolls horizontally on narrow screens. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  a11yLabel,
  stacked,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
  a11yLabel: string;
  /** Icon above label, equal-width columns: fits five options on a small phone without scrolling. */
  stacked?: boolean;
}) {
  const c = usePalette();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={a11yLabel}
      style={{ flexDirection: 'row', backgroundColor: c.track, borderRadius: stacked ? 18 : PILL, padding: 4, gap: 4 }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: stacked ? 52 : 40,
              paddingHorizontal: stacked ? 2 : 12,
              borderRadius: stacked ? 14 : PILL,
              flexDirection: stacked ? 'column' : 'row',
              gap: stacked ? 2 : 5,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? c.card : 'transparent',
              boxShadow: selected ? `0 1px 2px ${c.shadow}` : undefined,
            }}
          >
            {o.icon ? <Ionicons name={o.icon} size={stacked ? 17 : 14} color={selected ? c.text : c.muted} /> : null}
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{ color: selected ? c.text : c.muted, fontWeight: selected ? '800' : '600', fontSize: stacked ? 11.5 : 13 }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function StatTile({ label, value, icon, color }: { label: string; value: string; icon: IconName; color?: string }) {
  const c = usePalette();
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: c.raised, borderRadius: RADIUS_SM, padding: SPACE.md, gap: 6 }}>
      <View style={styles.row}>
        <Ionicons name={icon} size={16} color={color ?? c.muted} />
        <Text style={[TYPE.overline, { color: c.muted, flex: 1 }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={{ color: color ?? c.text, fontSize: 18, fontWeight: '800' }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function Banner({ tone, icon, children }: { tone: 'warn' | 'danger' | 'info'; icon: IconName; children: ReactNode }) {
  const c = usePalette();
  const bg = tone === 'warn' ? c.warnBg : tone === 'danger' ? c.dangerBg : c.infoBg;
  const fg = tone === 'warn' ? c.warnText : tone === 'danger' ? c.danger : c.text;
  return (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={20} color={fg} />
      <Text style={[TYPE.small, { color: fg, flex: 1, fontSize: 14, lineHeight: 20, fontWeight: tone === 'danger' ? '600' : '400' }]}>{children}</Text>
    </View>
  );
}

export function DemoBadge() {
  const { t } = useTranslation();
  const c = usePalette();
  return (
    <View accessibilityLabel={t('common.demoExplain')} style={[styles.badge, { backgroundColor: c.warnBg }]}>
      <Ionicons name="flask" size={12} color={c.warnText} />
      <Text style={{ color: c.warnText, fontWeight: '800', fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' }}>{t('common.demoBadge')}</Text>
    </View>
  );
}

export function Disclaimer() {
  const { t } = useTranslation();
  const c = usePalette();
  return (
    <View style={[styles.row, { paddingVertical: SPACE.sm, justifyContent: 'center' }]}>
      <Ionicons name="information-circle-outline" size={15} color={c.subtle} />
      <Text style={{ color: c.subtle, fontSize: 12, textAlign: 'center', flexShrink: 1 }}>{t('common.disclaimer')}</Text>
    </View>
  );
}

export function Skeleton({ height = 20, width = '100%' }: { height?: number; width?: number | `${number}%` }) {
  const c = usePalette();
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={{ height, width, borderRadius: RADIUS_SM, backgroundColor: c.track, opacity }} />;
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  const c = usePalette();
  return (
    <Card style={{ alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.xl }}>
      <IconBadge icon="cloud-offline-outline" size={48} color={c.muted} bg={c.chip} />
      <Body muted>{message ?? t('common.error')}</Body>
      {onRetry ? <Button label={t('common.retry')} icon="refresh" variant="secondary" onPress={onRetry} /> : null}
    </Card>
  );
}

export function EmptyState({ icon, message }: { icon: IconName; message: string }) {
  const c = usePalette();
  return (
    <View style={[styles.row, { paddingVertical: SPACE.md }]}>
      <IconBadge icon={icon} size={32} color={c.muted} bg={c.chip} />
      <Text style={[TYPE.small, { color: c.muted, flex: 1 }]}>{message}</Text>
    </View>
  );
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false)), []);
  return online;
}

/** Slim offline / demo-mode strips shown at the top of every screen. */
export function StatusStrips() {
  const { t } = useTranslation();
  const c = usePalette();
  const online = useOnline();
  if (online && DATA_MODE !== 'offline_demo') return null;
  return (
    <View style={{ gap: 1 }}>
      {!online ? (
        <View accessibilityRole="alert" style={[styles.strip, { backgroundColor: c.ink }]}>
          <Ionicons name="cloud-offline" size={13} color={c.bg} />
          <Text style={{ color: c.bg, fontSize: 12, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>
            {t('common.offline')}
          </Text>
        </View>
      ) : null}
      {DATA_MODE === 'offline_demo' ? (
        <View accessibilityLabel={t('common.offlineDemoMode')} style={[styles.strip, { backgroundColor: c.warnBg }]}>
          <Ionicons name="flask" size={13} color={c.warnText} />
          <Text style={{ color: c.warnText, fontSize: 12, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>
            {t('common.demoStrip')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function LastUpdated({ at }: { at: number | string | undefined }) {
  const { t } = useTranslation();
  const c = usePalette();
  if (!at) return null;
  const d = new Date(at);
  return (
    <Text style={{ color: c.subtle, fontSize: 12 }}>
      {t('common.lastUpdated', { time: `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` })}
    </Text>
  );
}

export function BarList({ items, color }: { items: { label: string; count: number; share: number }[]; color: string }) {
  const c = usePalette();
  return (
    <View style={{ gap: SPACE.md }}>
      {items.map((it) => (
        <View key={it.label} accessible accessibilityLabel={`${it.label}: ${it.count} (${Math.round(it.share * 100)}%)`} style={{ gap: 6 }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={{ color: c.text, fontWeight: '600', fontSize: 14 }}>{it.label}</Text>
            <Text style={{ color: c.muted, fontSize: 13, fontVariant: ['tabular-nums'] }}>
              {it.count} · {Math.round(it.share * 100)}%
            </Text>
          </View>
          <View style={{ height: 8, backgroundColor: c.track, borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ height: 8, width: `${Math.max(4, it.share * 100)}%`, backgroundColor: color, borderRadius: 4 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ListRow({ icon, title, subtitle, right, onPress }: { icon?: ReactNode; title: string; subtitle?: string; right?: ReactNode; onPress?: () => void }) {
  const c = usePalette();
  const content = (
    <>
      {icon}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{title}</Text>
        {subtitle ? <Text style={[TYPE.small, { color: c.muted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </>
  );
  if (!onPress) return <View style={styles.listRow}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.listRow, { opacity: pressed ? 0.7 : 1 }]}>
      {content}
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  screen: { padding: SPACE.lg, gap: SPACE.lg, paddingBottom: 56 },
  card: { borderRadius: RADIUS, borderWidth: StyleSheet.hairlineWidth, padding: SPACE.lg, gap: SPACE.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  button: {
    borderRadius: PILL,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
  },
  buttonText: { fontSize: 15, fontWeight: '700' },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: PILL,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  banner: { flexDirection: 'row', gap: SPACE.sm, padding: SPACE.md, borderRadius: RADIUS_SM, alignItems: 'flex-start' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  strip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: SPACE.lg },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: TAP + 8, paddingVertical: SPACE.sm },
});

/** Round floating button that flips between light and dark (an explicit choice overrides "System"). */
export function ThemeToggle() {
  const { t } = useTranslation();
  const c = usePalette();
  const scheme = useScheme();
  const set = useSettings((s) => s.set);
  const next = scheme === 'dark' ? 'light' : 'dark';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(next === 'dark' ? 'settings.switchDark' : 'settings.switchLight')}
      onPress={() => set({ theme: next })}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: c.card,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `0 2px 8px ${c.shadow}`,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name={scheme === 'dark' ? 'sunny' : 'moon'} size={20} color={c.text} />
    </Pressable>
  );
}
