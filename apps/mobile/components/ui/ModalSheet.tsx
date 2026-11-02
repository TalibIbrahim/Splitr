import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { Sheet } from './Sheet';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { themeVars, useTheme } from '../../theme';

interface ModalSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Optional heading (a header row with a 44pt close button is always shown). */
  title?: string;
  /** Accessibility label of the scrim and close button. */
  closeLabel?: string;
  /** Extra classes for the sheet surface (e.g. `gap-3`). */
  className?: string;
  children: ReactNode;
}

/**
 * The one modal bottom sheet: scrim (tap to close), Android back to close, keyboard avoidance,
 * scrollable body capped at `sizes.sheetMaxHeightPct`, reduced-motion aware slide.
 * Theme variables are re-applied inside the Modal because it renders outside the app tree.
 */
export function ModalSheet({ visible, onClose, title, closeLabel = 'Close', className, children }: ModalSheetProps) {
  const reduced = useReducedMotion();
  const { scheme, colors } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? 'none' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={themeVars[scheme]} className="flex-1">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
          {/* Scrim: tap-to-close for sighted users only; screen readers use the in-sheet Close button. */}
          <Pressable
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            onPress={onClose}
            className="absolute inset-0 bg-ink opacity-scrim"
          />
          <View accessibilityViewIsModal style={{ maxHeight: `${sizes.sheetMaxHeightPct}%` }}>
            <Sheet className={className}>
              <View className="mb-3 flex-row items-center justify-between gap-3">
                {title ? (
                  <Text accessibilityRole="header" className="flex-1 font-brico-extrabold text-screen-title text-ink">
                    {title}
                  </Text>
                ) : (
                  <View className="flex-1" />
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={closeLabel}
                  onPress={onClose}
                  style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
                  className="items-center justify-center active:opacity-pressed"
                >
                  <X size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
                </Pressable>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {children}
              </ScrollView>
            </Sheet>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
