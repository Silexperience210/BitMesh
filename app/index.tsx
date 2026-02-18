import { useEffect } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = 'BITMESH_ONBOARDING_DONE';

export default function Index() {
  useEffect(() => {
    async function checkOnboarding() {
      try {
        const onboardingDone = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (onboardingDone === 'true') {
          router.replace('/(tabs)');
        } else {
          router.replace('/onboarding');
        }
      } catch (e) {
        console.warn('Error checking onboarding:', e);
        router.replace('/onboarding');
      }
    }
    checkOnboarding();
  }, []);

  return null;
}
