import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useSplitr } from '../store';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import {
  BricolageGrotesque_400Regular,
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/bricolage-grotesque';
import { ThemeProvider, useTheme } from '../theme';

void SplashScreen.preventAutoHideAsync();

function Shell() {
  const { scheme } = useTheme();
  const hydrated = useSplitr((s) => s.hydrated);
  const recovery = useSplitr((s) => s.recovery);
  const hasMe = useSplitr((s) => s.root.me !== null);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {hydrated ? (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
          <Stack.Protected guard={recovery !== null}>
            <Stack.Screen name="recovery" />
          </Stack.Protected>
          <Stack.Protected guard={recovery === null && !hasMe}>
            <Stack.Screen name="onboarding" />
          </Stack.Protected>
          <Stack.Protected guard={recovery === null && hasMe}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="crew/[id]" />
            <Stack.Screen name="bill/new" />
            <Stack.Screen name="balances" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="bill/[id]" />
            <Stack.Screen name="dev/components" />
          </Stack.Protected>
        </Stack>
      ) : null}
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    BricolageGrotesque_400Regular,
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });
  const ready = loaded || !!error; // never trap the user on the splash if a font fails

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider className="flex-1 bg-bg">
      <Shell />
    </ThemeProvider>
  );
}
