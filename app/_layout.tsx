// Polyfills pour React Native (doit être en premier)
import './polyfills';

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, View, Text } from "react-native";
import Colors from "@/constants/colors";
import { WalletSeedContext } from "@/providers/WalletSeedProvider";
import { BitcoinContext } from "@/providers/BitcoinProvider";
import { AppSettingsContext } from "@/providers/AppSettingsProvider";
import { GatewayContext } from "@/providers/GatewayProvider";
import { MessagesContext } from "@/providers/MessagesProvider";
import { BleProvider } from "@/providers/BleProvider";
import { useAppInitialization } from "@/hooks/useAppInitialization";

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
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

function AppContent() {
  const { isReady, isMigrating, error } = useAppInitialization();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkOnboarding() {
      try {
        const done = await AsyncStorage.getItem(ONBOARDING_KEY);
        setOnboardingDone(done === 'true');
      } catch (e) {
        console.warn('Error checking onboarding status:', e);
        setOnboardingDone(false);
      }
    }
    checkOnboarding();
  }, []);

  useEffect(() => {
    if (isReady && onboardingDone !== null) {
      SplashScreen.hideAsync();
    }
  }, [isReady, onboardingDone]);

  // Écran de chargement pendant l'initialisation
  if (!isReady || onboardingDone === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.tint} />
        {isMigrating && (
          <Text style={{ marginTop: 16, color: Colors.text }}>
            Migration des données...
          </Text>
        )}
        {error && (
          <Text style={{ marginTop: 16, color: 'red' }}>
            Erreur: {error}
          </Text>
        )}
      </View>
    );
  }

  return <RootLayoutNav />;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppSettingsContext>
        <WalletSeedContext>
          <BitcoinContext>
            <BleProvider>
              <GatewayContext>
                <MessagesContext>
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    <StatusBar style="light" />
                    <AppContent />
                  </GestureHandlerRootView>
                </MessagesContext>
              </GatewayContext>
            </BleProvider>
          </BitcoinContext>
        </WalletSeedContext>
      </AppSettingsContext>
    </QueryClientProvider>
  );
}
