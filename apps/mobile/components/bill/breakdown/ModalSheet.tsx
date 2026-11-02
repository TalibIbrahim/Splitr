import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { Sheet } from '../../ui';

interface ModalSheetProps {
  visible: boolean;
  onClose: () => void;
  closeLabel?: string;
  children: ReactNode;
}

/** The static Sheet surface presented in a Modal with a dimmed, tappable backdrop. */
export function ModalSheet({ visible, onClose, closeLabel = 'Close', children }: ModalSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          className="absolute inset-0 bg-ink"
          style={{ opacity: 0.4 }}
        />
        <View>
          <Sheet>{children}</Sheet>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
