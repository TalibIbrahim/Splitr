import { Text, View } from 'react-native';
import { Plus, ScanLine } from 'lucide-react-native';
import { AvatarStack, Button, Card, type AvatarPerson } from '../ui';

type CrewHeroCardProps =
  | {
      variant?: 'crew';
      crewName: string;
      people: readonly AvatarPerson[];
      onStartBill: () => void;
    }
  | { variant: 'empty'; onMakeCrew: () => void };

export function CrewHeroCard(props: CrewHeroCardProps) {
  if (props.variant === 'empty') {
    return (
      <Card tone="hero" className="gap-4">
        <Text className="font-brico-extrabold text-screen-title text-on-hero">Make your first crew</Text>
        <Text className="font-brico-medium text-body text-muted-on-hero">
          Save the people you eat with so every bill starts ready.
        </Text>
        <Button
          variant="onHero"
          label="Make a crew"
          accessibilityLabel="Make your first crew"
          icon={Plus}
          onPress={props.onMakeCrew}
        />
      </Card>
    );
  }
  return (
    <Card tone="hero" className="gap-4">
      <View className="gap-3">
        <Text numberOfLines={1} className="font-brico-extrabold text-screen-title text-on-hero">
          {props.crewName}
        </Text>
        <AvatarStack people={[...props.people]} size="sm" max={5} />
      </View>
      <Button
        variant="onHero"
        label="Start tonight's bill"
        accessibilityLabel={`Start tonight's bill with ${props.crewName}`}
        icon={ScanLine}
        onPress={props.onStartBill}
      />
    </Card>
  );
}
