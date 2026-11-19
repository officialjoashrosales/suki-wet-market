import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppDataProvider, useAppData } from '@/state/app-data';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Root() {
  const { ready, error } = useAppData();

  useEffect(() => {
    if (ready || error) SplashScreen.hideAsync().catch(() => {});
  }, [ready, error]);

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center', gap: 8 }}>
        <StatusBar style="light" />
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Database could not start</Text>
        <Text style={{ color: colors.muted }}>{error}</Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="session/[id]" />
      <Stack.Screen name="item/[id]" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppDataProvider>
        <Root />
      </AppDataProvider>
    </SafeAreaProvider>
  );
}
