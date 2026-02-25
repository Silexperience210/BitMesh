/**
 * useShakeGesture - Détecte le shake pour ouvrir le debugger
 * 
 * Usage:
 *   const { shakeCount } = useShakeGesture(() => {
 *     setShowDebugger(true);
 *   });
 * 
 * En production: 3 secousses rapides nécessaires
 * En dev: 1 secousse suffit
 */

import { useEffect, useRef, useCallback } from 'react';
import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { DEBUG_MODE, DEBUG_GESTURE } from '@/utils/debugConfig';

interface ShakeData {
  x: number;
  y: number;
  z: number;
}

export function useShakeGesture(onShake: () => void) {
  const shakeCount = useRef(0);
  const lastShakeTime = useRef(0);
  const subscription = useRef<any>(null);
  
  // Threshold plus bas en dev, plus haut en prod (secret)
  const requiredShakes = DEBUG_MODE ? 1 : DEBUG_GESTURE.SHAKE_COUNT;
  const timeout = DEBUG_GESTURE.SHAKE_TIMEOUT;
  const threshold = DEBUG_GESTURE.SHAKE_THRESHOLD;

  const detectShake = useCallback((data: ShakeData) => {
    const acceleration = Math.sqrt(
      data.x * data.x + data.y * data.y + data.z * data.z
    );
    
    const now = Date.now();
    
    // Vérifier si c'est un shake (au-dessus du threshold)
    if (acceleration > threshold) {
      // Réinitialiser si trop de temps depuis le dernier shake
      if (now - lastShakeTime.current > timeout) {
        shakeCount.current = 0;
      }
      
      // Incrémenter et mettre à jour le timestamp
      shakeCount.current++;
      lastShakeTime.current = now;
      
      // Déclencher si nombre de shakes atteint
      if (shakeCount.current >= requiredShakes) {
        shakeCount.current = 0;
        onShake();
      }
    }
  }, [onShake, requiredShakes, timeout, threshold]);

  useEffect(() => {
    // Configurer l'accéléromètre
    Accelerometer.setUpdateInterval(100); // 100ms
    
    subscription.current = Accelerometer.addListener(detectShake);
    
    return () => {
      subscription.current?.remove();
    };
  }, [detectShake]);

  return {
    shakeCount: shakeCount.current,
    requiredShakes,
  };
}

export default useShakeGesture;
