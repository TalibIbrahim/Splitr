import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme, View, type StyleProp, type ViewStyle } from 'react-native';
import { palettes, themeVars, type Scheme } from './palettes';
import type { Palette } from '@splitr/design-tokens';

interface ThemeContextValue {
  scheme: Scheme;
  /** Raw hex palette, for the rare non-className needs (lucide `color`, StatusBar). */
  colors: Palette;
  /** Dev-only override of the root scheme (null = follow the system). */
  devOverride: Scheme | null;
  setDevOverride: (s: Scheme | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  /** Force a scheme for this subtree (used for side-by-side previews). */
  forceScheme?: Scheme;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export function ThemeProvider({ children, forceScheme, className, style }: ThemeProviderProps) {
  const parent = useContext(ThemeContext);
  const system = useColorScheme();
  const [ownOverride, setOwnOverride] = useState<Scheme | null>(null);

  const devOverride = parent ? parent.devOverride : ownOverride;
  const setDevOverride = parent ? parent.setDevOverride : setOwnOverride;
  const scheme: Scheme = forceScheme ?? devOverride ?? (system === 'dark' ? 'dark' : 'light');

  const value = useMemo<ThemeContextValue>(
    () => ({ scheme, colors: palettes[scheme], devOverride, setDevOverride }),
    [scheme, devOverride, setDevOverride],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View className={className} style={[themeVars[scheme], style]}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
