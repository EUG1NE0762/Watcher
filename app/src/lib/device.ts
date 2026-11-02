import { areaAtPoint, haversineKm, type Area, type LatLng } from '@watcher/scoring';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';
import resources from '../config/resources.json';
import { supabase } from './supabase';

export type LocateResult = { status: 'ok'; area: Area; point: LatLng } | { status: 'denied' | 'outside' | 'error' };

/** Location stays on the phone: it is only used here to pick the containing area. */
export async function locateArea(areas: Area[]): Promise<LocateResult> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return { status: 'denied' };
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const area = areaAtPoint(point, areas);
    return area ? { status: 'ok', area, point } : { status: 'outside' };
  } catch {
    return { status: 'error' };
  }
}

export async function currentPoint(): Promise<LatLng | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

export interface Facility {
  name: string;
  kind: 'police' | 'hospital' | 'clinic';
  lat: number;
  lng: number;
  km: number;
  approximate: boolean;
}

/** Police posts, clinics and hospitals near an area centre from OpenStreetMap (Overpass), with a static fallback. */
export async function nearbyHelp(center: LatLng, radiusM = 3000): Promise<Facility[]> {
  const query = `[out:json][timeout:15];(node(around:${radiusM},${center.lat},${center.lng})[amenity~"^(police|hospital|clinic)$"];way(around:${radiusM},${center.lat},${center.lng})[amenity~"^(police|hospital|clinic)$"];);out center 40;`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`overpass ${res.status}`);
    const body = (await res.json()) as {
      elements: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[];
    };
    const found = body.elements
      .map((e) => {
        const lat = e.lat ?? e.center?.lat;
        const lng = e.lon ?? e.center?.lon;
        const kind = e.tags?.amenity as Facility['kind'];
        if (lat === undefined || lng === undefined || !kind) return null;
        return {
          name: e.tags?.name ?? (kind === 'police' ? 'Police post' : kind === 'hospital' ? 'Hospital' : 'Clinic'),
          kind,
          lat,
          lng,
          km: haversineKm(center, { lat, lng }),
          approximate: false,
        };
      })
      .filter((f): f is Facility => !!f)
      .sort((a, b) => a.km - b.km);
    if (found.length) return found.slice(0, 6);
  } catch {
    // fall through to the static list
  }
  return (resources.nearbyFallback as Omit<Facility, 'km' | 'approximate'>[])
    .map((f) => ({ ...f, km: haversineKm(center, f), approximate: true }))
    .sort((a, b) => a.km - b.km);
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/**
 * Registers this device for saved-place alerts. Needs a real device, a development/production build
 * (not Expo Go) with an EAS project id, and the backend. Returns null when any of those is missing.
 */
export async function registerForPush(prefs: { notifyRatingChanges: boolean; notifyIncidents: boolean }): Promise<string | null> {
  if (!supabase || Platform.OS === 'web' || !Device.isDevice) return null;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return null;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('alerts', { name: 'Saved place alerts', importance: AndroidImportance.DEFAULT });
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase
        .from('profiles')
        .update({ push_token: token, notify_rating_changes: prefs.notifyRatingChanges, notify_incidents: prefs.notifyIncidents })
        .eq('id', data.user.id);
    }
    return token;
  } catch {
    return null;
  }
}
