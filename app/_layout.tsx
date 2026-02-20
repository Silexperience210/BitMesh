// Polyfills pour React Native (doit être en premier)
import './polyfills';

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, View, Text, TouchableOpacity, Alert } from "react-native";
import Colors from "@/constants/colors";
import { WalletSeedContext } from "@/providers/WalletSeedProvider";
import { BitcoinContext } from "@/providers/BitcoinProvider";
import { AppSettingsContext } from "@/providers/AppSettingsProvider";
import { GatewayContext } from "@/providers/GatewayProvider";
import { MessagesContext } from "@/providers/MessagesProvider";
import { BleProvider } from "@/providers/BleProvider";
import { UsbSerialProvider } from "@/providers/UsbSerialProvider";
import { useAppInitialization } from "@/hooks/useAppInitialization";
import { WelcomeModal } from "@/components/WelcomeModal";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
const ONBOARDING_KEY = 'BITMESH_ONBOARDING_DONE';

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

function AppContent() {
  const { isReady, isMigrating, error } = useAppInitialization();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    async function checkOnboarding() {
      try {
        const done = await AsyncStorage.getItem(ONBOARDING_KEY);
        const isDone = done === 'true';
        setOnboardingDone(isDone);
        if (!isDone) {
          setShowOnboarding(true);
        }
      } catch (e) {
        console.warn('Error checking onboarding status:', e);
        setOnboardingDone(false);
        setShowOnboarding(true);
      }
    }
    checkOnboarding();
  }, []);

  useEffect(() => {
    if (isReady && onboardingDone !== null) {
      SplashScreen.hideAsync();
    }
  }, [isReady, onboardingDone]);

  const handleOnboardingClose = async () => {
    setShowOnboarding(false);
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    setOnboardingDone(true);
  };

  // Écran de chargement pendant l'initialisation
  if (!isReady || onboardingDone === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, padding: 20 }}>
        {!error && <ActivityIndicator size="large" color={Colors.tint} />}
        {isMigrating && (
          <Text style={{ marginTop: 16, color: Colors.text }}>
            Migration des données...
          </Text>
        )}
        {error && (
          <>
            <Text style={{ marginTop: 16, color: 'red', textAlign: 'center' }}>
              Erreur: {error}
            </Text>
            <Text style={{ marginTop: 8, color: Colors.textMuted, fontSize: 12, textAlign: 'center' }}>
              La base de données semble corrompue. Vider le cache peut résoudre le problème.
            </Text>
            <TouchableOpacity
              style={{ marginTop: 20, backgroundColor: Colors.purple, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 }}
              onPress={() => {
                Alert.alert(
                  'Vider le cache',
                  'Cela supprimera toutes les données locales. Continuer?',
                  [
                    { text: 'Annuler', style: 'cancel' },
                    { 
                      text: 'Vider', 
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await AsyncStorage.clear();
                          // Reload app
                          if (typeof window !== 'undefined' && window.location) {
                            window.location.reload();
                          }
                        } catch (e) {
                          console.error('Erreur vidage cache:', e);
                        }
                      }
                    },
                  ]
                );
              }}
            >
              <Text style={{ color: 'white', fontWeight: '600' }}>Vider le cache</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  return (
    <>
      <RootLayoutNav />
      <WelcomeModal visible={showOnboarding} onClose={handleOnboardingClose} />
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppSettingsContext>
        <WalletSeedContext>
          <BitcoinContext>
            <BleProvider>
              <UsbSerialProvider>
                <GatewayContext>
                  <MessagesContext>
                    <GestureHandlerRootView style={{ flex: 1 }}>
                      <StatusBar style="light" />
                      <AppContent />
                    </GestureHandlerRootView>
                  </MessagesContext>
                </GatewayContext>
              </UsbSerialProvider>
            </BleProvider>
          </BitcoinContext>
        </WalletSeedContext>
      </AppSettingsContext>
    </QueryClientProvider>
  );
}
