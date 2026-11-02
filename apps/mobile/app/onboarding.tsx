import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { splitrStore } from '../store';
import { Button, TextField } from '../components/ui';

export default function Onboarding() {
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const submit = () => {
    if (trimmed.length > 0) splitrStore.getState().onboard(trimmed);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-1 justify-center gap-6 px-4">
          <View accessible accessibilityLabel="splitr" className="flex-row items-baseline">
            <Text className="font-brico-extrabold text-hero-amount text-ink">splitr</Text>
            <Text className="font-brico-extrabold text-hero-amount text-accent">.</Text>
          </View>
          <Text accessibilityRole="header" className="font-brico-extrabold text-screen-title text-ink">
            What should your friends call you?
          </Text>
          <TextField
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            accessibilityLabel="Your name"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            maxLength={40}
          />
          <Button
            size="lg"
            fullWidth
            label="Continue"
            accessibilityLabel="Continue"
            disabled={trimmed.length === 0}
            onPress={submit}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
