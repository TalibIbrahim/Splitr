import { View } from 'react-native';
import { MessageCircle, Share2 } from 'lucide-react-native';
import { Button, ModalSheet } from '../../ui';

interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  onWhatsApp: () => void;
  onMore: () => void;
}

export function ShareSheet({ visible, onClose, onWhatsApp, onMore }: ShareSheetProps) {
  return (
    <ModalSheet visible={visible} onClose={onClose} title="Share the split" closeLabel="Close share options">
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
