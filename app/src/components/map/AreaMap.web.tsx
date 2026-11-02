import { createElement, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { RADIUS } from '../../lib/theme';
import type { AreaMapProps } from './AreaMap';
import { MAP_HTML, type MapEvent } from './mapHtml';

/** Web build: same Leaflet page in a sandboxed iframe, talking over postMessage. */
export default function AreaMap({ data, onEvent, height = 300, accessibilityLabel, rounded = true }: AreaMapProps) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const listener = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const raw = (e.data as { watcherMap?: string } | null)?.watcherMap;
      if (!raw) return;
      try {
        const msg = JSON.parse(raw) as MapEvent;
        if (msg.type === 'ready') setReady(true);
        onEventRef.current(msg);
      } catch {
        // ignore
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  useEffect(() => {
    if (ready) frame.current?.contentWindow?.postMessage({ watcherData: data }, '*');
  }, [data, ready]);

  return (
    <View style={{ height, borderRadius: rounded ? RADIUS : 0, overflow: 'hidden' }} accessibilityLabel={accessibilityLabel}>
      {createElement('iframe', {
        ref: frame,
        srcDoc: MAP_HTML,
        title: accessibilityLabel,
        sandbox: 'allow-scripts',
        style: { border: 0, width: '100%', height: '100%' },
      })}
    </View>
  );
}
