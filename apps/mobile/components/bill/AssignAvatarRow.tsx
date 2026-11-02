import { ScrollView } from 'react-native';
import type { Paisa } from '@splitr/calculation-engine';
import { Avatar } from '../ui';

export interface AssignPerson {
  id: string;
  name: string;
  isCurrentUser?: boolean;
  /** Running subtotal for this person. */
  subtotal: Paisa;
}

interface AssignAvatarRowProps {
  people: readonly AssignPerson[];
  selectedId?: string | null;
  onSelect: (personId: string) => void;
  /** Light haptic on select (policy: assign). */
  haptic?: boolean;
}

/** Horizontally scrollable avatars (lg) with a running subtotal under each. */
export function AssignAvatarRow({ people, selectedId, onSelect, haptic }: AssignAvatarRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel="Who is eating"
      contentContainerClassName="gap-3 px-1 py-1"
    >
      {people.map((p) => (
        <Avatar
          key={p.id}
          name={p.name}
          size="lg"
          isCurrentUser={p.isCurrentUser}
          selected={selectedId === p.id}
          subtitle={p.subtotal}
          haptic={haptic}
          role="radio"
          onPress={() => onSelect(p.id)}
        />
      ))}
    </ScrollView>
  );
}
