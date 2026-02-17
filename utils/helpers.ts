export function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'now';
  if (diff < hour) return `${Math.floor(diff / minute)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`;

  const date = new Date(timestamp);
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

export function formatSats(sats: number): string {
  if (sats >= 1000000) return `${(sats / 1000000).toFixed(2)}M`;
  if (sats >= 1000) return sats.toLocaleString();
  return sats.toString();
}

export function getSignalColor(strength: number): string {
  if (strength >= 70) return '#00D68F';
  if (strength >= 40) return '#F7931A';
  return '#FF4757';
}

export function getSignalLabel(strength: number): string {
  if (strength >= 70) return 'Strong';
  if (strength >= 40) return 'Medium';
  return 'Weak';
}

export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function getPairingColor(state: string): string {
  switch (state) {
    case 'paired': return '#00D68F';
    case 'pairing': return '#4DACFF';
    case 'discovered': return '#FBBF24';
    case 'failed': return '#FF4757';
    default: return '#556677';
  }
}

export function getPairingLabel(state: string): string {
  switch (state) {
    case 'paired': return 'Paired';
    case 'pairing': return 'Pairing...';
    case 'discovered': return 'New';
    case 'failed': return 'Failed';
    default: return 'Unknown';
  }
}

export function getDeviceTypeIcon(type: string): string {
  switch (type) {
    case 'relay': return 'R';
    case 'gateway': return 'G';
    case 'repeater': return 'P';
    case 'client': return 'C';
    default: return 'N';
  }
}

export function formatRssi(rssi: number): string {
  return `${rssi} dBm`;
}

export function formatSnr(snr: number): string {
  return `${snr > 0 ? '+' : ''}${snr.toFixed(1)} dB`;
}
