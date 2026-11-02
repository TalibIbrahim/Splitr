import { View } from 'react-native';
import { Image as ImageIcon, MessageCircle, Share2 } from 'lucide-react-native';
import { Button, ModalSheet } from '../../ui';

interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  onImage: () => void;
  onWhatsApp: () => void;
  onMore: () => void;
}

export function ShareSheet({ visible, onClose, onImage, onWhatsApp, onMore }: ShareSheetProps) {
  return (
    <ModalSheet visible={visible} onClose={onClose} title="Share the split" closeLabel="Close share options">
      <View className="gap-3">
        <Button label="Image" icon={ImageIcon} accessibilityLabel="Share as an image card" onPress={onImage} size="lg" fullWidth />
        <Button
          label="WhatsApp text"
          icon={MessageCircle}
          variant="outline"
          accessibilityLabel="Share as text to WhatsApp"
          onPress={onWhatsApp}
          size="lg"
          fullWidth
        />
        <Button label="More…" icon={Share2} variant="outline" accessibilityLabel="More ways to share" onPress={onMore} size="lg" fullWidth />
      </View>
    </ModalSheet>
  );
}
