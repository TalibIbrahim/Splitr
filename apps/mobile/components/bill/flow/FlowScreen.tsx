import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface FlowScreenProps {
  children: ReactNode;
  /** Sticky bottom area (e.g. <StickyAction>); stays above the keyboard. */
  footer?: ReactNode;
}

export function FlowScreen({ children, footer }: FlowScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-bg">
      <View className="flex-1">{children}</View>
      {footer ? (
        <View className="border-t border-chip bg-bg" style={{ paddingBottom: insets.bottom }}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
