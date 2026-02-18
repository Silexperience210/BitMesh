import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import Colors from "@/constants/colors";
import { WalletSeedContext } from "@/providers/WalletSeedProvider";
import { AppSettingsContext } from "@/providers/AppSettingsProvider";
import { GatewayContext } from "@/providers/GatewayProvider";
import { MessagesContext } from "@/providers/MessagesProvider";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

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

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

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
