import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { WalletSeedContext } from "@/providers/WalletSeedProvider";
import { AppSettingsContext } from "@/providers/AppSettingsProvider";
import { GatewayContext } from "@/providers/GatewayProvider";
import { MessagesContext } from "@/providers/MessagesProvider";

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

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        const onboardingDone = await AsyncStorage.getItem(ONBOARDING_KEY);
        // Si l'onboarding n'a jamais été fait, on affiche l'onboarding
        // Sinon on va directement aux tabs
        await SplashScreen.hideAsync();
        setIsReady(true);
      } catch (e) {
        console.warn('Error checking onboarding status:', e);
        await SplashScreen.hideAsync();
        setIsReady(true);
      }
    }
    prepare();
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppSettingsContext>
        <WalletSeedContext>
          <GatewayContext>
            <MessagesContext>
              <GestureHandlerRootView>
                <StatusBar style="light" />
                <RootLayoutNav />
              </GestureHandlerRootView>
            </MessagesContext>
          </GatewayContext>
        </WalletSeedContext>
      </AppSettingsContext>
    </QueryClientProvider>
  );
}
