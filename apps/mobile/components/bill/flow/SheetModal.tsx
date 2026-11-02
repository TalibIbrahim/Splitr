import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Sheet } from '../../ui';
import { useReducedMotion } from '../../../lib/useReducedMotion';
import { themeVars } from '../../../theme';
import { useTheme } from '../../../theme';

interface SheetModalProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** Modal presentation for the static <Sheet> surface: scrim, tap-outside to close, keyboard aware. */
export function SheetModal({ visible, onClose, children }: SheetModalProps) {
  const reduced = useReducedMotion();
  const { scheme } = useTheme();
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            className="absolute inset-0 bg-ink/40"
          />
          <View style={{ maxHeight: '88%' }}>
            <Sheet>
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
