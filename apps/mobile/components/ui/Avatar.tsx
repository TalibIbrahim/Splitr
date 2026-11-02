import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Paisa } from '@splitr/calculation-engine';
import { sizes } from '@splitr/design-tokens';
import { moneyA11yLabel } from '../../lib/format-money';
import { Money } from './Money';

export type AvatarSize = keyof typeof sizes.avatar;

export interface AvatarPerson {
  id: string;
  name: string;
  isCurrentUser?: boolean;
}

interface AvatarProps {
  name: string;
  size?: AvatarSize;
  isCurrentUser?: boolean;
  selected?: boolean;
  /** Running subtotal shown under the avatar (Money meta). */
  subtitle?: Paisa;
  onPress?: () => void;
  /** Light haptic on press (policy: only on assign). */
  haptic?: boolean;
  accessibilityLabel?: string;
  /** 'radio' when the avatar is an option inside a radiogroup (checked = selected). */
  role?: 'button' | 'radio';
}

const INITIAL_TEXT: Record<AvatarSize, string> = {
  sm: 'text-body-small',
  md: 'text-item-name',
  lg: 'text-screen-title',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + second).toUpperCase();
}

function Circle({ name, size, isCurrentUser }: { name: string; size: AvatarSize; isCurrentUser?: boolean }) {
  const d = sizes.avatar[size];
  return (
    <View
      style={{ width: d, height: d }}
      className={`items-center justify-center rounded-pill ${isCurrentUser ? 'bg-accent' : 'bg-surface-2'}`}
    >
      <Text
        className={`font-brico-extrabold ${INITIAL_TEXT[size]} ${isCurrentUser ? 'text-on-accent' : 'text-ink'}`}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

export function Avatar({
  name,
  size = 'md',
  isCurrentUser,
  selected,
  subtitle,
  onPress,
  haptic,
  accessibilityLabel,
  role = 'button',
}: AvatarProps) {
  const { gap, width } = sizes.selectedRing;
  const base = `${name}${isCurrentUser ? ' (you)' : ''}`;
  const label = accessibilityLabel ?? (subtitle !== undefined ? `${base}, ${moneyA11yLabel(subtitle)}` : base);

  // Ring box is always rendered (transparent when not selected) so selection never shifts layout.
  const body = (
    <View
      style={{ borderWidth: width, padding: gap }}
      className={`rounded-pill bg-bg ${selected ? 'border-ink' : 'border-transparent'}`}
    >
      <Circle name={name} size={size} isCurrentUser={isCurrentUser} />
    </View>
  );

  const content = (
    <View className="items-center gap-1">
      {body}
      {subtitle !== undefined ? <Money amount={subtitle} variant="meta" /> : null}
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={label}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === 'radio' ? { checked: !!selected } : { selected: !!selected }}
      style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
      className="items-center justify-center active:opacity-pressed"
      onPress={() => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
    >
      {content}
    </Pressable>
  );
}

interface AvatarStackProps {
  people: AvatarPerson[];
  size?: AvatarSize;
  /** Show at most this many avatars, then a "+N" circle. */
  max?: number;
}

/** Overlapping avatars for the hero card. Each avatar gets a hero-coloured gap ring. */
export function AvatarStack({ people, size = 'sm', max = 4 }: AvatarStackProps) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const d = sizes.avatar[size];
  const overlap = -Math.round(d / 4);
  const ringStyle = { borderWidth: sizes.selectedRing.gap } as const;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${people.length} people: ${people.map((p) => p.name).join(', ')}`}
      className="flex-row items-center"
    >
      {shown.map((p, i) => (
        <View
          key={p.id}
          style={[ringStyle, i > 0 ? { marginLeft: overlap } : null]}
          className="rounded-pill border-hero"
        >
          <Circle name={p.name} size={size} isCurrentUser={p.isCurrentUser} />
        </View>
      ))}
      {extra > 0 ? (
        <View style={[ringStyle, { marginLeft: overlap }]} className="rounded-pill border-hero">
          <View style={{ width: d, height: d }} className="items-center justify-center rounded-pill bg-chip">
            <Text className="font-brico-extrabold text-body-small text-ink">+{extra}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
