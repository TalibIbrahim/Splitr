import { useMemo } from 'react';
import { href } from '../../lib/routes';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, Users } from 'lucide-react-native';
import { selectGroups, selectPeople, useSplitr } from '../../store';
import { AvatarStack, Button, Card } from '../../components/ui';
import { EmptyState } from '../../components/bill';

export default function Crews() {
  const router = useRouter();
  const groups = useSplitr(selectGroups());
  const people = useSplitr(selectPeople());
  const meId = useSplitr((s) => s.root.me?.personId);

  const rows = useMemo(
    () =>
      groups
        .map((g) => ({
          id: g.id,
          name: g.name,
          members: g.memberIds.flatMap((id) => {
            const p = people.find((x) => x.id === id);
            return p ? [{ id: p.id, name: p.displayName, isCurrentUser: p.id === meId }] : [];
          }),
        })),
    [groups, people, meId],
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="gap-4 px-4 pb-6 pt-2">
        <View className="flex-row items-center justify-between">
          <Text accessibilityRole="header" className="font-brico-extrabold text-screen-title text-ink">
            Crews
          </Text>
          {rows.length > 0 ? (
            <Button
              variant="outline"
              label="New crew"
              accessibilityLabel="Create a new crew"
              icon={Plus}
              onPress={() => router.push(href('/crew/new'))}
            />
          ) : null}
        </View>

        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No crews yet"
            body="A crew is the group you usually eat with. Save one and every bill starts ready."
            action={{
              label: 'Make a crew',
              accessibilityLabel: 'Make your first crew',
              onPress: () => router.push(href('/crew/new')),
            }}
          />
        ) : (
          rows.map((r) => (
            <Card
              key={r.id}
              tone="hero"
              onPress={() => router.push(href(`/crew/${r.id}`))}
              accessibilityLabel={`${r.name}, ${r.members.length} ${r.members.length === 1 ? 'member' : 'members'}. Edit crew`}
              className="gap-3"
            >
              <Text numberOfLines={1} className="font-brico-extrabold text-screen-title text-on-hero">
                {r.name}
              </Text>
              <View className="flex-row items-center justify-between">
                <AvatarStack people={r.members} size="sm" max={5} />
                <Text className="font-brico-semibold text-meta text-muted-on-hero">
                  {r.members.length} {r.members.length === 1 ? 'member' : 'members'}
                </Text>
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
