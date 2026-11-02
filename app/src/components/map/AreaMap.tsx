import { useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { RADIUS } from '../../lib/theme';
import { MAP_HTML, type MapData, type MapEvent } from './mapHtml';

// react-native-webview declares `WebView<P = undefined>`, which collapses its props to `never` under React 19 types.
type WebViewHandle = WebView<object>;
const NativeWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

export interface AreaMapProps {
  data: MapData;
  onEvent: (e: MapEvent) => void;
  height?: number;
  accessibilityLabel: string;
  /** Rounded corners; false for full-bleed maps. */
  rounded?: boolean;
}

export default function AreaMap({ data, onEvent, height = 300, accessibilityLabel, rounded = true }: AreaMapProps) {
  const ref = useRef<WebViewHandle>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) ref.current?.injectJavaScript(`window.watcherUpdate && window.watcherUpdate(${JSON.stringify(data)}); true;`);
  }, [data, ready]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as MapEvent;
      if (msg.type === 'ready') setReady(true);
      onEvent(msg);
    } catch {
      // ignore malformed messages
    }
  };

  return (
    <View style={{ height, borderRadius: rounded ? RADIUS : 0, overflow: 'hidden' }} accessibilityLabel={accessibilityLabel}>
      <NativeWebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html: MAP_HTML, baseUrl: 'https://watcher.local/' }}
        onMessage={onMessage}
        javaScriptEnabled
        setSupportMultipleWindows={false}
        nestedScrollEnabled
      />
    </View>
  );
}
