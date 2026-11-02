import type { ReactNode } from 'react';
import { View } from 'react-native';
import { sizes } from '@splitr/design-tokens';

/** Static bottom-sheet surface (no gestures): sheet radius on top corners, grabber, screen padding. */
export function Sheet({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <View className={`rounded-t-sheet bg-surface px-4 pb-6 pt-3 ${className ?? ''}`}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: sizes.grabber.width, height: sizes.grabber.height }}
        className="mb-4 self-center rounded-pill bg-muted"
      />
      {children}
    </View>
  );
}
