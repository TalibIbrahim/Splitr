import { Text, View } from 'react-native';
import { MessageCircle, Share2 } from 'lucide-react-native';
import { Button } from '../../ui';
import { ModalSheet } from './ModalSheet';

interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  onWhatsApp: () => void;
  onMore: () => void;
}

export function ShareSheet({ visible, onClose, onWhatsApp, onMore }: ShareSheetProps) {
  return (
    <ModalSheet visible={visible} onClose={onClose} closeLabel="Close share options">
      <Text className="mb-3 font-brico-extrabold text-screen-title text-ink">Share the split</Text>
      <View className="gap-3">
        <Button
          label="WhatsApp"
          icon={MessageCircle}
          accessibilityLabel="Share to WhatsApp"
          onPress={onWhatsApp}
          size="lg"
          fullWidth
        />
        <Button
          label="More…"
          icon={Share2}
          variant="outline"
          accessibilityLabel="More ways to share"
          onPress={onMore}
          size="lg"
          fullWidth
        />
      </View>
    </ModalSheet>
  );
}
