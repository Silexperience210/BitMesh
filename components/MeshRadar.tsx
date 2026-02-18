import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Colors from '@/constants/colors';
import { type RadarPeer, formatDistance } from '@/utils/radar';

const RADAR_SIZE = 260;
const CENTER = RADAR_SIZE / 2;
// Distance max affichée sur le radar (dernier anneau)
const MAX_DISPLAY_METERS = 8000;

interface MeshRadarProps {
  peers: RadarPeer[];
  isScanning: boolean;
  myNodeId?: string;
}

function RadarSweep({ isScanning }: { isScanning: boolean }) {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isScanning) {
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 3000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      rotateAnim.stopAnimation();
    }
  }, [isScanning, rotateAnim]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  if (!isScanning) return null;

  return (
    <Animated.View
      style={[
        styles.sweep,
        { transform: [{ rotate: rotation }] },
      ]}
    >
      <View style={styles.sweepLine} />
      <View style={styles.sweepGlow} />
    </Animated.View>
  );
}

function PeerBlip({ peer, index }: { peer: RadarPeer; index: number }) {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const appearAnim = useRef(new Animated.Value(0)).current;

  // Position basée sur le vrai bearing GPS
  // bearingRad: 0 = Nord = haut du radar → angle screen = -π/2
  const ratio = Math.min(peer.distanceMeters / MAX_DISPLAY_METERS, 0.92);
  const screenAngle = peer.bearingRad - Math.PI / 2;
  const radius = ratio * (CENTER - 20);
  const x = CENTER + Math.cos(screenAngle) * radius - 8;
  const y = CENTER + Math.sin(screenAngle) * radius - 8;

  // Couleur selon signal
  const color = peer.signalStrength > 70 ? Colors.green
    : peer.signalStrength > 40 ? Colors.accent
    : Colors.red;

  useEffect(() => {
    Animated.timing(appearAnim, {
      toValue: 1,
      duration: 600,
      delay: index * 100,
      useNativeDriver: true,
    }).start();

    if (peer.online) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [pulseAnim, appearAnim, index, peer.online]);

  const blipSize = 13;
  const label = peer.name.length > 9 ? peer.name.slice(0, 8) + '…' : peer.name;

  return (
    <Animated.View
      style={[
        styles.blipContainer,
        {
          left: x,
          top: y,
          opacity: appearAnim,
          transform: [{ scale: appearAnim }],
        },
      ]}
    >
      {peer.online && (
        <Animated.View
          style={[
            styles.blipPulse,
            {
              width: blipSize + 12,
              height: blipSize + 12,
              borderRadius: (blipSize + 12) / 2,
              borderColor: color,
              opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
              transform: [{
                scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }),
              }],
            },
          ]}
        />
      )}
      <View
        style={[
          styles.blip,
          {
            width: blipSize,
            height: blipSize,
            borderRadius: blipSize / 2,
            backgroundColor: peer.online ? color : Colors.textMuted,
          },
        ]}
      />
      <Text style={[styles.blipLabel, { color }]} numberOfLines={1}>{label}</Text>
      <Text style={styles.blipDist} numberOfLines={1}>{formatDistance(peer.distanceMeters)}</Text>
    </Animated.View>
  );
}

export default function MeshRadar({ peers, isScanning, myNodeId }: MeshRadarProps) {
  const rings = useMemo(() => [
    { ratio: 0.25, label: `${(MAX_DISPLAY_METERS * 0.25 / 1000).toFixed(1)} km` },
    { ratio: 0.5,  label: `${(MAX_DISPLAY_METERS * 0.5 / 1000).toFixed(1)} km` },
    { ratio: 0.75, label: `${(MAX_DISPLAY_METERS * 0.75 / 1000).toFixed(1)} km` },
    { ratio: 1,    label: `${(MAX_DISPLAY_METERS / 1000).toFixed(0)} km` },
  ], []);

  return (
    <View style={styles.radarContainer}>
      <View style={styles.radar}>
        {rings.map((r, i) => (
          <View
            key={i}
            style={[
              styles.ring,
              {
                width: RADAR_SIZE * r.ratio,
                height: RADAR_SIZE * r.ratio,
                borderRadius: (RADAR_SIZE * r.ratio) / 2,
              },
            ]}
          />
        ))}

        {/* Étiquettes des anneaux */}
        <Text style={[styles.ringLabel, { top: CENTER - RADAR_SIZE * 0.25 / 2 - 2, left: CENTER + 4 }]}>
          {rings[0].label}
        </Text>
        <Text style={[styles.ringLabel, { top: CENTER - RADAR_SIZE * 0.5 / 2 - 2, left: CENTER + 4 }]}>
          {rings[1].label}
        </Text>

        {/* Indicateurs cardinaux */}
        <Text style={styles.cardinalN}>N</Text>
        <Text style={styles.cardinalS}>S</Text>
        <Text style={styles.cardinalE}>E</Text>
        <Text style={styles.cardinalW}>O</Text>

        <View style={styles.crosshairH} />
        <View style={styles.crosshairV} />

        {/* Point central = nous */}
        <View style={styles.centerDot}>
          <View style={styles.centerDotInner} />
        </View>
        {myNodeId && (
          <Text style={styles.centerLabel}>{myNodeId.slice(5, 13)}</Text>
        )}

        <RadarSweep isScanning={isScanning} />

        {peers.map((peer, index) => (
          <PeerBlip key={peer.nodeId} peer={peer} index={index} />
        ))}

        {peers.length === 0 && !isScanning && (
          <Text style={styles.emptyLabel}>Aucun pair détecté</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  radarContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  radar: {
    width: RADAR_SIZE,
    height: RADAR_SIZE,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(42, 53, 69, 0.7)',
  },
  ringLabel: {
    position: 'absolute',
    color: Colors.textMuted,
    fontSize: 7,
    fontFamily: 'monospace',
    opacity: 0.6,
  },
  cardinalN: {
    position: 'absolute',
    top: 2,
    color: Colors.textMuted,
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  cardinalS: {
    position: 'absolute',
    bottom: 2,
    color: Colors.textMuted,
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  cardinalE: {
    position: 'absolute',
    right: 2,
    color: Colors.textMuted,
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  cardinalW: {
    position: 'absolute',
    left: 2,
    color: Colors.textMuted,
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  crosshairH: {
    position: 'absolute',
    width: RADAR_SIZE,
    height: 1,
    backgroundColor: 'rgba(42, 53, 69, 0.4)',
  },
  crosshairV: {
    position: 'absolute',
    width: 1,
    height: RADAR_SIZE,
    backgroundColor: 'rgba(42, 53, 69, 0.4)',
  },
  centerDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(247, 147, 26, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  centerDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  centerLabel: {
    position: 'absolute',
    top: CENTER + 12,
    color: Colors.accent,
    fontSize: 7,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  sweep: {
    position: 'absolute',
    width: RADAR_SIZE,
    height: RADAR_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  sweepLine: {
    position: 'absolute',
    top: CENTER - 1,
    left: CENTER,
    width: CENTER - 4,
    height: 2,
    backgroundColor: 'rgba(0, 214, 143, 0.6)',
  },
  sweepGlow: {
    position: 'absolute',
    top: CENTER - 22,
    left: CENTER,
    width: CENTER - 4,
    height: 44,
    backgroundColor: 'rgba(0, 214, 143, 0.07)',
    borderTopRightRadius: CENTER,
    borderBottomRightRadius: CENTER,
  },
  blipContainer: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 15,
  },
  blipPulse: {
    position: 'absolute',
    borderWidth: 1.5,
    top: -6,
    left: -6,
  },
  blip: {
    shadowColor: '#00D68F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 5,
  },
  blipLabel: {
    fontSize: 7,
    fontWeight: '700',
    marginTop: 2,
    maxWidth: 56,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  blipDist: {
    fontSize: 6,
    color: Colors.textMuted,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  emptyLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
});
