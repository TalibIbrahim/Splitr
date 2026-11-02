import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock, House, Tag, Users, type LucideIcon } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../theme';
import { Button } from './Button';

export type TabKey = 'home' | 'crews' | 'deals' | 'history';

export interface TabItem {
  key: TabKey;
  label: string;
  icon: LucideIcon;
}

export const DEFAULT_TABS: readonly TabItem[] = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'crews', label: 'Crews', icon: Users },
  { key: 'deals', label: 'Deals', icon: Tag },
  { key: 'history', label: 'History', icon: Clock },
];

interface BottomBarProps {
  activeKey: TabKey;
  onChange: (key: TabKey) => void;
  tabs?: readonly TabItem[];
  /** Optional sticky action (see StickyAction) rendered above the tabs. */
  action?: ReactNode;
}

export function BottomBar({ activeKey, onChange, tabs = DEFAULT_TABS, action }: BottomBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View className="border-t border-chip bg-bg" style={{ paddingBottom: insets.bottom }}>
      {action}
      <View accessibilityRole="tablist" className="flex-row">
        {tabs.map((t) => {
          const active = t.key === activeKey;
          const TabIcon = t.icon;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: active }}
              onPress={() => onChange(t.key)}
              style={{ minHeight: sizes.minTouch }}
              className="flex-1 items-center justify-center gap-1 pb-2 active:opacity-pressed"
            >
              {/* Active indicator: a bar above the icon (shape + weight, not colour alone). */}
              <View
                style={{ width: sizes.tabIndicator.width, height: sizes.tabIndicator.height }}
                className={`rounded-pill ${active ? 'bg-ink' : 'bg-transparent'}`}
              />
              <TabIcon
                size={sizes.icon.lg}
                color={active ? colors.ink : colors.muted}
                strokeWidth={active ? sizes.icon.strokeWidth + 0.5 : sizes.icon.strokeWidth}
              />
              <Text
                className={`text-meta ${active ? 'font-brico-extrabold text-ink' : 'font-brico-medium text-muted'}`}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

interface StickyActionProps {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  badge?: string;
  disabled?: boolean;
  loading?: boolean;
}

/** Full-width ink button pinned above the tab bar / at the screen bottom. */
export function StickyAction(props: StickyActionProps) {
  return (
    <View className="px-4 pb-2 pt-3">
      <Button {...props} variant="primary" size="lg" fullWidth />
    </View>
  );
}
