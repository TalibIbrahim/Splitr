import { useMemo, useState } from 'react';
import { href } from '../../lib/routes';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, ChevronLeft, Pencil, Plus, ScanLine, Trash2 } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { selectGroups, selectPeople, splitrStore, useSplitr } from '../../store';
import { Avatar, Button, ModalSheet, TextField } from '../../components/ui';
import { useTheme } from '../../theme';
import { nameLines } from '../../lib/a11y';

export default function CrewEditor() {
  const router = useRouter();
  const { colors } = useTheme();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = rawId ?? 'new';
  const isNew = id === 'new';

  const groups = useSplitr(selectGroups());
  const people = useSplitr(selectPeople());
  const meId = useSplitr((s) => s.root.me?.personId);
  const group = useMemo(
    () => (isNew ? undefined : groups.find((g) => g.id === id)),
    [groups, id, isNew],
  );

  const [name, setName] = useState(group?.name ?? '');
  const [members, setMembers] = useState<string[]>(() => {
    const base = group?.memberIds ?? [];
    return meId && !base.includes(meId) ? [meId, ...base] : [...base];
  });
  const [newPerson, setNewPerson] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const trimmedName = name.trim();
  const toggle = (pid: string) => {
    if (pid === meId) return; // me is always a member
    setMembers((m) => (m.includes(pid) ? m.filter((x) => x !== pid) : [...m, pid]));
  };

  const addPerson = () => {
    const n = newPerson.trim();
    if (!n) return;
    const pid = splitrStore.getState().addPerson(n);
    setMembers((m) => [...m, pid]);
    setNewPerson('');
  };

  const commitRename = () => {
    if (renaming && renaming.value.trim()) splitrStore.getState().renamePerson(renaming.id, renaming.value.trim());
    setRenaming(null);
  };

  const save = () => {
    if (!trimmedName) return;
    splitrStore.getState().saveGroup({ id: group?.id, name: trimmedName, memberIds: members });
    router.back();
  };

  if (!isNew && !group) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-bg px-4">
        <Text className="text-center font-brico-bold text-item-name text-ink">This crew no longer exists.</Text>
        <Button label="Back" accessibilityLabel="Go back" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerClassName="gap-4 px-4 pb-6" keyboardShouldPersistTaps="handled">
          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
              className="items-center justify-center active:opacity-pressed"
            >
              <ChevronLeft size={sizes.icon.lg} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
            </Pressable>
            <Text accessibilityRole="header" className="font-brico-extrabold text-screen-title text-ink">
              {isNew ? 'New crew' : 'Edit crew'}
            </Text>
          </View>

          <View className="gap-2">
            <Text className="font-brico-semibold text-meta text-muted">Crew name</Text>
            <TextField
              value={name}
              onChangeText={setName}
              placeholder="Friday biryani gang"
              accessibilityLabel="Crew name"
              maxLength={40}
            />
            {trimmedName.length === 0 ? (
              <Text className="font-brico-semibold text-meta text-muted">Give your crew a name to save it.</Text>
            ) : null}
          </View>

          <View className="gap-1">
            <Text className="font-brico-semibold text-meta text-muted">Members</Text>
            {people.map((p) => {
              const isMe = p.id === meId;
              const on = members.includes(p.id);
              const editing = renaming?.id === p.id;
              return (
                <View key={p.id} className="flex-row items-center gap-2">
                  {editing ? (
                    <View className="flex-1 flex-row items-center gap-2 py-1">
                      <View className="flex-1">
                        <TextField
                          value={renaming.value}
                          onChangeText={(v) => setRenaming({ id: p.id, value: v })}
                          placeholder="Name"
                          accessibilityLabel={`New name for ${p.displayName}`}
                          autoFocus
                          returnKeyType="done"
                          onSubmitEditing={commitRename}
                        />
                      </View>
                      <Button
                        label="Save"
                        accessibilityLabel={`Save name for ${p.displayName}`}
                        onPress={commitRename}
                      />
                    </View>
                  ) : (
                    <>
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityLabel={`${p.displayName}${isMe ? ' (you), always in the crew' : ''}`}
                        accessibilityState={{ checked: on, disabled: isMe }}
                        onPress={() => toggle(p.id)}
                        style={{ minHeight: sizes.minTouch }}
                        className="flex-1 flex-row items-center gap-3 py-1 active:opacity-pressed"
                      >
                        <Avatar name={p.displayName} size="sm" isCurrentUser={isMe} />
                        <Text
                          numberOfLines={nameLines()}
                          className={`flex-1 text-item-name ${on ? 'font-brico-extrabold' : 'font-brico-medium'} text-ink`}
                        >
                          {p.displayName}
                          {isMe ? ' (you)' : ''}
                        </Text>
                        {/* Selected = check mark + heavier weight, not colour alone. */}
                        <View
                          className={`h-6 w-6 items-center justify-center rounded-pill border-2 border-ink ${on ? 'bg-ink' : 'bg-transparent'}`}
                        >
                          {on ? <Check size={sizes.icon.sm} color={colors.bg} strokeWidth={sizes.icon.strokeWidth} /> : null}
                        </View>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Rename ${p.displayName}`}
                        onPress={() => setRenaming({ id: p.id, value: p.displayName })}
                        style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
                        className="items-center justify-center active:opacity-pressed"
                      >
                        <Pencil size={sizes.icon.md} color={colors.muted} strokeWidth={sizes.icon.strokeWidth} />
                      </Pressable>
                    </>
                  )}
                </View>
              );
            })}
          </View>

          <View className="gap-2">
            <Text className="font-brico-semibold text-meta text-muted">Add person</Text>
            <View className="flex-row items-center gap-2">
              <View className="flex-1">
                <TextField
                  value={newPerson}
                  onChangeText={setNewPerson}
                  placeholder="Friend's name"
                  accessibilityLabel="New person's name"
                  returnKeyType="done"
                  onSubmitEditing={addPerson}
                  maxLength={40}
                />
              </View>
              <Button
                variant="outline"
                label="Add"
                icon={Plus}
                accessibilityLabel="Add person to the crew"
                disabled={newPerson.trim().length === 0}
                onPress={addPerson}
              />
            </View>
          </View>

          <Button
            size="lg"
            fullWidth
            label="Save crew"
            accessibilityLabel="Save crew"
            disabled={trimmedName.length === 0}
            onPress={save}
          />

          {group ? (
            <View className="gap-3">
              <Button
                variant="outline"
                size="lg"
                fullWidth
                label="Start a bill with this crew"
                accessibilityLabel={`Start a bill with ${group.name}`}
                icon={ScanLine}
                onPress={() => router.push(href(`/bill/new?groupId=${group.id}`))}
              />
              <Button
                variant="outline"
                fullWidth
                label="Delete crew"
                accessibilityLabel={`Delete crew ${group.name}`}
                icon={Trash2}
                onPress={() => setConfirmDelete(true)}
              />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {group ? (
        <ModalSheet
          visible={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title={`Delete ${group.name}?`}
          closeLabel="Close delete confirmation"
          className="gap-3"
        >
          <View className="gap-3">
            <Text className="font-brico-medium text-body text-muted">
              Past bills stay in History. The people stay saved.
            </Text>
            <Button
              variant="destructive"
              size="lg"
              fullWidth
              label="Delete crew"
              accessibilityLabel={`Confirm: delete crew ${group.name}`}
              icon={Trash2}
              onPress={() => {
                splitrStore.getState().deleteGroup(group.id);
                router.back();
              }}
            />
            <Button
              variant="outline"
              size="lg"
              fullWidth
              label="Keep crew"
              accessibilityLabel="Cancel, keep this crew"
              onPress={() => setConfirmDelete(false)}
            />
          </View>
        </ModalSheet>
      ) : null}
    </SafeAreaView>
  );
}
