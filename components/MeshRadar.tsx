import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Colors from '@/constants/colors';
import { MeshNode } from '@/mocks/data';
import { getPairingColor } from '@/utils/helpers';

const RADAR_SIZE = 260;
const CENTER = RADAR_SIZE / 2;
const MAX_DISTANCE = 6000;

interface MeshRadarProps {
  nodes: MeshNode[];
  isScanning: boolean;
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

function NodeBlip({ node, index }: { node: MeshNode; index: number }) {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const appearAnim = useRef(new Animated.Value(0)).current;

  const ratio = Math.min(node.distanceMeters / MAX_DISTANCE, 0.9);
  const angle = (index * 137.5 * Math.PI) / 180;
  const radius = ratio * (CENTER - 24);
  const x = CENTER + Math.cos(angle) * radius - 8;
  const y = CENTER + Math.sin(angle) * radius - 8;

  const color = getPairingColor(node.pairingState);

  useEffect(() => {
    Animated.timing(appearAnim, {
      toValue: 1,
      duration: 600,
      delay: index * 120,
      useNativeDriver: true,
    }).start();

    if (node.isOnline && node.pairingState !== 'failed') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [pulseAnim, appearAnim, index, node.isOnline, node.pairingState]);

  const blipSize = node.isRelay ? 16 : node.pairingState === 'discovered' ? 14 : 12;

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
      {node.isOnline && (
        <Animated.View
          style={[
            styles.blipPulse,
            {
              width: blipSize + 12,
              height: blipSize + 12,
              borderRadius: (blipSize + 12) / 2,
              borderColor: color,
              opacity: pulseAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.5, 0],
              }),
              transform: [{
                scale: pulseAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 2],
                }),
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
            backgroundColor: node.isOnline ? color : Colors.textMuted,
            borderWidth: node.pairingState === 'discovered' ? 2 : 0,
            borderColor: node.pairingState === 'discovered' ? Colors.yellow : 'transparent',
          },
        ]}
      />
      <Text style={[styles.blipLabel, { color }]} numberOfLines={1}>
        {node.name.length > 8 ? node.name.substring(0, 7) + '…' : node.name}
      </Text>
    </Animated.View>
  );
}

export default function MeshRadar({ nodes, isScanning }: MeshRadarProps) {
  const rings = useMemo(() => [0.25, 0.5, 0.75, 1], []);

  return (
    <View style={styles.radarContainer}>
      <View style={styles.radar}>
        {rings.map((r, i) => (
          <View
            key={i}
            style={[
              styles.ring,
              {
                width: RADAR_SIZE * r,
                height: RADAR_SIZE * r,
                borderRadius: (RADAR_SIZE * r) / 2,
              },
            ]}
          />
        ))}

        <View style={styles.crosshairH} />
        <View style={styles.crosshairV} />

        <View style={styles.centerDot}>
          <View style={styles.centerDotInner} />
        </View>

        <RadarSweep isScanning={isScanning} />

        {nodes.map((node, index) => (
          <NodeBlip key={node.id} node={node} index={index} />
        ))}

        <Text style={[styles.rangeLabel, styles.rangeLabelTop]}>2 km</Text>
        <Text style={[styles.rangeLabel, styles.rangeLabelRight]}>4 km</Text>
        <Text style={[styles.rangeLabel, styles.rangeLabelBottom]}>6 km</Text>
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
    borderColor: 'rgba(42, 53, 69, 0.6)',
  },
  crosshairH: {
    position: 'absolute',
    width: RADAR_SIZE,
    height: 1,
    backgroundColor: 'rgba(42, 53, 69, 0.4)',
    top: CENTER,
  },
  crosshairV: {
    position: 'absolute',
    width: 1,
    height: RADAR_SIZE,
    backgroundColor: 'rgba(42, 53, 69, 0.4)',
    left: CENTER,
  },
  centerDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(247, 147, 26, 0.2)',
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
    backgroundColor: 'rgba(0, 214, 143, 0.5)',
  },
  sweepGlow: {
    position: 'absolute',
    top: CENTER - 20,
    left: CENTER,
    width: CENTER - 4,
    height: 40,
    backgroundColor: 'rgba(0, 214, 143, 0.06)',
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
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  blipLabel: {
    fontSize: 8,
    fontWeight: '600' as const,
    marginTop: 2,
    maxWidth: 60,
    textAlign: 'center' as const,
  },
  rangeLabel: {
    position: 'absolute',
    color: Colors.textMuted,
    fontSize: 8,
    fontFamily: 'monospace',
  },
  rangeLabelTop: {
    top: RADAR_SIZE * 0.25 / 2 - 10,
    right: CENTER + 4,
  },
  rangeLabelRight: {
    top: CENTER - 12,
    right: RADAR_SIZE * 0.25 / 2 - 16,
  },
  rangeLabelBottom: {
    bottom: 2,
    left: CENTER + 4,
  },
});
