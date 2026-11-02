import { useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sizes } from '@splitr/design-tokens';
import { useReducedMotion } from '../../../lib/useReducedMotion';
import { themeVars, useTheme } from '../../../theme';

interface ReceiptViewerProps {
  /** All photos of this receipt, first scan first. */
  uris: readonly string[];
  visible: boolean;
  onClose: () => void;
}

const MAX_ZOOM = 4;

/**
 * Full-screen receipt photo. iOS: native pinch zoom via ScrollView. Android/web: zoom steps with +/- buttons
 * (the image is resized inside a two-way scroll area).
 */
export function ReceiptViewer({ uris, visible, onClose }: ReceiptViewerProps) {
  const [index, setIndex] = useState(0);
  const last = Math.max(0, uris.length - 1);
  const at = Math.min(index, last);
  const uri = uris[at] ?? null;
  const { scheme, colors } = useTheme();
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [zoom, setZoom] = useState(1);
  const native = Platform.OS === 'ios';
  const btn = 'items-center justify-center rounded-pill bg-surface-2 active:opacity-pressed';

  const close = () => {
    setZoom(1);
    setIndex(0);
    onClose();
  };

  return (
    <Modal visible={visible && uri !== null} animationType={reduced ? 'none' : 'fade'} onRequestClose={close} statusBarTranslucent>
      <View accessibilityViewIsModal style={themeVars[scheme]} className="flex-1 bg-bg">
        <View style={{ paddingTop: insets.top }} className="flex-row items-center justify-between gap-2 px-4">
          <Text accessibilityRole="header" className="flex-1 font-brico-extrabold text-screen-title text-ink">
            {uris.length > 1 ? `Photo ${at + 1} of ${uris.length}` : 'Receipt photo'}
          </Text>
          {uris.length > 1 ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous photo"
                disabled={at <= 0}
                onPress={() => {
                  setZoom(1);
                  setIndex(at - 1);
                }}
                style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
                className={`${btn} ${at <= 0 ? 'opacity-disabled' : ''}`}
              >
                <ChevronLeft size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next photo"
                disabled={at >= last}
                onPress={() => {
                  setZoom(1);
                  setIndex(at + 1);
                }}
                style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
                className={`${btn} ${at >= last ? 'opacity-disabled' : ''}`}
              >
                <ChevronRight size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
              </Pressable>
            </>
          ) : null}
          {!native ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Zoom out"
                disabled={zoom <= 1}
                onPress={() => setZoom((z) => Math.max(1, z - 1))}
                style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
                className={`${btn} ${zoom <= 1 ? 'opacity-disabled' : ''}`}
              >
                <Minus size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Zoom in"
                disabled={zoom >= MAX_ZOOM}
                onPress={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}
                style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
                className={`${btn} ${zoom >= MAX_ZOOM ? 'opacity-disabled' : ''}`}
              >
                <Plus size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
              </Pressable>
            </>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close receipt photo"
            onPress={close}
            style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
            className={btn}
          >
            <X size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
          </Pressable>
        </View>
        {uri ? (
          native ? (
            <ScrollView
              maximumZoomScale={MAX_ZOOM}
              minimumZoomScale={1}
              centerContent
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              className="flex-1"
            >
              <Image
                accessibilityLabel="Receipt photo, pinch to zoom"
                source={{ uri }}
                style={{ width, height: height * 0.8 }}
                resizeMode="contain"
              />
            </ScrollView>
          ) : (
            <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
              <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                <Image
                  accessibilityLabel={`Receipt photo, zoom ${zoom} times`}
                  source={{ uri }}
                  style={{ width: width * zoom, height: height * 0.8 * zoom }}
                  resizeMode="contain"
                />
              </ScrollView>
            </ScrollView>
          )
        ) : null}
      </View>
    </Modal>
  );
}
