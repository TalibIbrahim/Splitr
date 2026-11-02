export const sizes = {
  avatar: { sm: 44, md: 58, lg: 68 },
  minTouch: 44,
  /** Selected avatar: 3pt gap (bg colour) then a 3pt ink ring. */
  selectedRing: { gap: 3, width: 3 },
  /** lucide-react-native */
  icon: { sm: 16, md: 20, lg: 24, strokeWidth: 2 },
  buttonHeight: { md: 48, lg: 56 },
  /** Bottom-sheet grabber bar. */
  grabber: { width: 40, height: 4 },
  /** Active-tab indicator bar. */
  tabIndicator: { width: 24, height: 4 },
} as const;
