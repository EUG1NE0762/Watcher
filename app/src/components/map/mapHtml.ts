import type { LngLat } from '@watcher/scoring';

export interface MapArea {
  id: string;
  name: string;
  polygon: LngLat[];
  color: string;
  letter: string;
  label: string;
}

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  color: string;
}

export interface MapData {
  areas: MapArea[];
  markers: MapMarker[];
  line: [number, number][] | null;
  selectedId: string | null;
  dark: boolean;
  /** The map re-fits its view whenever this changes (e.g. a different city or trip). */
  fitKey: string;
}

export type MapEvent = { type: 'area'; id: string } | { type: 'point'; lat: number; lng: number } | { type: 'ready' } | { type: 'error' };

/**
 * Raster basemaps, tried in order (an explicit fallback if one keeps failing).
 * Not used, on purpose: tile.openstreetmap.org (its policy blocks apps/WebViews without a website
 * Referer: "Access blocked") and CARTO (now serves "API key required" watermark tiles without a key).
 * Esri's basemaps work without a key with attribution; for production, register a free ArcGIS
 * developer account (or another provider) and review its terms for your traffic.
 */
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const ESRI_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';
export const TILE_PROVIDERS = [
  {
    light: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
    dark: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    darkLabels: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_ATTRIBUTION,
  },
  {
    light: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
    dark: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    darkLabels: '',
    attribution: ESRI_ATTRIBUTION,
  },
];

/**
 * Leaflet map: no API key, runs in a WebView (Android/iOS) and an iframe (web).
 * Areas carry a letter label (L/M/H/?) as well as a colour so the map is readable without colour vision.
 */
export const MAP_HTML = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" onerror="this.href='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'">
<style>
html,body,#map{height:100%;margin:0;background:#e8ecf1}
body.dark,body.dark #map{background:#1b2027}
.zl .nm{display:none}
.lbl{font:800 13px system-ui,sans-serif;color:#fff;border-radius:10px;padding:1px 6px;border:2px solid #fff;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.leaflet-control-attribution{font-size:9px}
#err{display:none;position:absolute;inset:0;align-items:center;justify-content:center;font:15px system-ui;color:#555;text-align:center;padding:16px}
</style></head><body><div id="map"></div><div id="err">Map unavailable right now. Use search or the list below.</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script>window.L||document.write('<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"><\\/script>')</script>
<script>
(function(){
  var PROVIDERS=${JSON.stringify(TILE_PROVIDERS)};
  function send(m){var s=JSON.stringify(m);if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(s)}else if(window.parent!==window){window.parent.postMessage({watcherMap:s},'*')}}
  if(!window.L){document.getElementById('err').style.display='flex';send({type:'error'});return;}
  var map=L.map('map',{zoomControl:false,attributionControl:true}).setView([-15.415,28.29],12);
  var provider=0, dark=false, tiles=null, labels=null, loaded=0, failed=0;
  // Swap to the next provider if the current one keeps failing (blocked, rate-limited or down).
  function setTiles(){
    if(tiles){map.removeLayer(tiles)}
    if(labels){map.removeLayer(labels);labels=null}
    var p=PROVIDERS[provider];
    loaded=0;failed=0;
    tiles=L.tileLayer(dark?p.dark:p.light,{maxZoom:19,attribution:p.attribution}).addTo(map);
    if(dark&&p.darkLabels){labels=L.tileLayer(p.darkLabels,{maxZoom:19,pane:'overlayPane',opacity:0.9}).addTo(map)}
    tiles.on('tileload',function(){loaded++});
    tiles.on('tileerror',function(){failed++;if(loaded===0&&failed>=4&&provider<PROVIDERS.length-1){provider++;setTiles()}else if(loaded===0&&failed>=12){document.getElementById('err').style.display='flex'}});
  }
  setTiles();
  var layer=L.layerGroup().addTo(map), fitted=null;
  // Names only once zoomed in; zoomed out, the L/M/H/? letter alone keeps the map legible.
  function zoomClass(){var el=map.getContainer();if(map.getZoom()<14){el.classList.add('zl')}else{el.classList.remove('zl')}}
  map.on('zoomend',zoomClass);
  map.on('click',function(e){send({type:'point',lat:e.latlng.lat,lng:e.latlng.lng})});
  window.watcherUpdate=function(d){
    document.body.className=d.dark?'dark':'';
    if(!!d.dark!==dark){dark=!!d.dark;setTiles()}
    layer.clearLayers();
    var bounds=[];
    d.areas.forEach(function(a){
      var ll=a.polygon.map(function(p){return [p[1],p[0]]});
      var sel=a.id===d.selectedId;
      var poly=L.polygon(ll,{color:a.color,weight:sel?4:2,fillOpacity:sel?0.45:0.25,dashArray:a.letter==='?'?'6 6':null}).addTo(layer);
      poly.on('click',function(ev){L.DomEvent.stopPropagation(ev);send({type:'area',id:a.id})});
      var c=poly.getBounds().getCenter();
      L.marker(c,{interactive:true,keyboard:false,icon:L.divIcon({className:'',html:'<span class="lbl" style="background:'+a.color+'">'+a.letter+'<span class="nm"> '+a.name+'</span></span>',iconSize:null})})
        .on('click',function(){send({type:'area',id:a.id})}).addTo(layer);
      ll.forEach(function(p){bounds.push(p)});
    });
    d.markers.forEach(function(m){
      L.circleMarker([m.lat,m.lng],{radius:9,color:'#fff',weight:3,fillColor:m.color,fillOpacity:1}).bindTooltip(m.label,{permanent:true,direction:'top'}).addTo(layer);
      bounds.push([m.lat,m.lng]);
    });
    if(d.line){L.polyline(d.line,{color:'#1456A0',weight:4,dashArray:'8 6'}).addTo(layer);}
    if(fitted!==d.fitKey&&bounds.length){map.fitBounds(bounds,{padding:[24,24],maxZoom:15});fitted=d.fitKey;}
    zoomClass();
  };
  window.addEventListener('message',function(e){try{var d=typeof e.data==='string'?JSON.parse(e.data):e.data;if(d&&d.watcherData)window.watcherUpdate(d.watcherData)}catch(_){}} );
  document.addEventListener('message',function(e){try{var d=JSON.parse(e.data);if(d&&d.watcherData)window.watcherUpdate(d.watcherData)}catch(_){}} );
  send({type:'ready'});
})();
</script></body></html>`;
