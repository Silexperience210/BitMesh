/**
 * Audio utils — enregistrement et lecture de messages vocaux
 * Utilise expo-av pour le recording/playback et expo-file-system pour base64
 * Transport: MQTT uniquement (trop volumineux pour LoRa)
 */
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

export const AUDIO_MAX_DURATION_MS = 30000; // 30 secondes max

// Qualité optimisée pour messages vocaux (faible taille, bonne intelligibilité)
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 16000, // 16 kbps — 30s ≈ 60 KB
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.LOW,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 16000,
  },
};

export async function requestAudioPermissions(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
}

export async function startRecording(): Promise<Audio.Recording> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });
  const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
  return recording;
}

export async function stopRecording(
  recording: Audio.Recording
): Promise<{ uri: string; durationMs: number }> {
  await recording.stopAndUnloadAsync();
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  const status = await recording.getStatusAsync();
  const uri = recording.getURI() ?? '';
  const durationMs = status.durationMillis ?? 0;
  return { uri, durationMs };
}

export async function audioUriToBase64(uri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64;
}

export async function playAudioBase64(
  base64: string,
  onFinish?: () => void
): Promise<Audio.Sound> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
  });

  // Écrire le fichier temporaire pour la lecture
  const tmpUri = FileSystem.cacheDirectory + `voice_${Date.now()}.m4a`;
  await FileSystem.writeAsStringAsync(tmpUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { sound } = await Audio.Sound.createAsync(
    { uri: tmpUri },
    { shouldPlay: true },
    (status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
        onFinish?.();
      }
    }
  );
  return sound;
}

export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
