import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../theme';
import { Button } from '../ui';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: { label: string; accessibilityLabel?: string; onPress: () => void };
}

export function EmptyState({ icon: Icon, title, body, action }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View className="items-center gap-3 px-6 py-8">
      <View
        style={{ width: sizes.iconDisc, height: sizes.iconDisc }}
        className="items-center justify-center rounded-pill bg-chip"
      >
        <Icon size={sizes.icon.lg} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
      </View>
      <Text accessibilityRole="header" className="text-center font-brico-extrabold text-screen-title text-ink">{title}</Text>
      <Text className="text-center font-brico-medium text-body text-muted">{body}</Text>
      {action ? (
        <Button
          label={action.label}
          accessibilityLabel={action.accessibilityLabel ?? action.label}
          onPress={action.onPress}
        />
      ) : null}
    </View>
  );
}
