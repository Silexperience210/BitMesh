// Calculs GPS pour le radar MeshCore — Haversine + bearing

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Distance Haversine entre deux points GPS (en mètres)
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

// Bearing (cap) en radians depuis Nord, sens horaire
export function gpsBearing(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return Math.atan2(y, x);
}

// Formater la distance en texte lisible
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// Signal simulé depuis la distance (Internet mode — pas de vrai RSSI)
export function distanceToSignal(meters: number): number {
  if (meters < 500) return 90;
  if (meters < 2000) return 70;
  if (meters < 5000) return 50;
  if (meters < 10000) return 30;
  return 15;
}

// Pair visible sur le radar
export interface RadarPeer {
  nodeId: string;        // ex: "MESH-A7F2"
  name: string;
  distanceMeters: number;
  bearingRad: number;    // angle depuis Nord, radians (pour radar: 0 = haut)
  online: boolean;
  pubkeyHex?: string;
  lat?: number;
  lng?: number;
  lastSeen: number;
  signalStrength: number; // 0-100
}

// Convertir bearing GPS en coordonnées radar (x, y normalisés 0..1)
// Nord = haut du radar (angle 0 = -π/2 en coordonnées écran)
export function bearingToRadar(bearingRad: number, distanceRatio: number): { x: number; y: number } {
  // bearingRad: 0 = Nord, π/2 = Est, etc.
  // Sur l'écran: Nord = haut = angle -π/2 en trigonométrie standard
  const screenAngle = bearingRad - Math.PI / 2;
  return {
    x: 0.5 + Math.cos(screenAngle) * distanceRatio * 0.45,
    y: 0.5 + Math.sin(screenAngle) * distanceRatio * 0.45,
  };
}
