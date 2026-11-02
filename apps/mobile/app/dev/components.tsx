import { useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Check, Info, ScanLine } from 'lucide-react-native';
import type { Paisa } from '@splitr/calculation-engine';
import { fontFamily, typeScale } from '@splitr/design-tokens';
import { ThemeProvider, useTheme, type Scheme } from '../../theme';
import {
  Avatar,
  AvatarStack,
  BottomBar,
  Button,
  Card,
  Money,
  Pill,
  Sheet,
  StickyAction,
  type TabKey,
} from '../../components/ui';

const p = (n: number) => n as Paisa;

const PEOPLE = [
  { id: 'a', name: 'Ahmar Mahhee', isCurrentUser: true },
  { id: 'b', name: 'Sara Khan' },
  { id: 'c', name: 'Bilal Raza' },
  { id: 'd', name: 'Hina Ali' },
  { id: 'e', name: 'Omar Sheikh' },
];

const tnumStyle = {
  fontFamily: fontFamily.extrabold,
  fontVariant: ['tabular-nums'],
  fontSize: typeScale.cardAmount.fontSize,
} as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="font-brico-extrabold text-screen-title text-ink">{title}</Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap items-center gap-3">{children}</View>;
}

function Gallery() {
  const [selected, setSelected] = useState<string>('b');
  const [tab, setTab] = useState<TabKey>('home');
  const noop = () => {};

  return (
    <View className="gap-8 bg-bg p-4">
      <Section title="Money">
        <View className="gap-1">
          <Text style={tnumStyle} className="text-ink">
            1111
          </Text>
          <Text style={tnumStyle} className="text-ink">
            8888
          </Text>
          <Text className="font-brico-medium text-meta text-muted">tnum check: both rows should be the same width</Text>
        </View>
        <Money amount={p(180625)} variant="hero" />
        <Money amount={p(180600)} variant="card" />
        <Money amount={p(263500)} variant="item" />
        <Money amount={p(0)} variant="body" />
        <Money amount={p(-42500)} variant="body" showSign />
        <Money amount={p(42500)} variant="meta" showSign />
        <View className="rounded-card bg-ink p-4">
          <Money amount={p(180600)} variant="card" onInk />
          <Money amount={p(180600)} variant="meta" onInk />
        </View>
      </Section>

      <Section title="Button">
        <Row>
          <Button label="See the split" accessibilityLabel="See the split" onPress={noop} />
          <Button label="Share card" accessibilityLabel="Share card" onPress={noop} variant="outline" />
        </Row>
        <Row>
          <Button
            label="See the split"
            accessibilityLabel="See the split, 1 item left"
            onPress={noop}
            badge="1 left"
            size="lg"
          />
          <Button label="Scan" accessibilityLabel="Scan a bill" onPress={noop} icon={ScanLine} />
        </Row>
        <Row>
          <Button label="Disabled" accessibilityLabel="Disabled button" onPress={noop} disabled />
          <Button label="Saving" accessibilityLabel="Saving" onPress={noop} loading />
        </Row>
        <Card tone="hero">
          <Button
            label="Scan tonight's bill"
            accessibilityLabel="Scan tonight's bill"
            onPress={noop}
            variant="onHero"
            icon={ScanLine}
          />
        </Card>
      </Section>

      <Section title="Avatar">
        <Row>
          <Avatar name="Ahmar Mahhee" size="sm" isCurrentUser />
          <Avatar name="Sara Khan" size="md" />
          <Avatar name="Bilal Raza" size="lg" />
        </Row>
        <Row>
          {PEOPLE.slice(0, 4).map((person, i) => (
            <Avatar
              key={person.id}
              name={person.name}
              size="md"
              isCurrentUser={person.isCurrentUser}
              selected={selected === person.id}
              subtitle={p(150000 + i * 31250)}
              onPress={() => setSelected(person.id)}
              haptic
            />
          ))}
        </Row>
        <Card tone="hero">
          <AvatarStack people={PEOPLE} size="sm" max={4} />
        </Card>
      </Section>

      <Section title="Pill">
        <Row>
          <Pill tone="chip" label="Sara" />
          <Pill tone="accent" label="You" />
          <Pill tone="status" icon={Check} label="Matches the receipt" />
          <Pill tone="status" icon={Info} label="Needs review" />
        </Row>
      </Section>

      <Section title="Card">
        <Card tone="surface2">
          <Text className="font-brico-bold text-item-name text-ink">Surface 2</Text>
          <Money amount={p(180600)} variant="card" />
        </Card>
        <Card tone="accent">
          <Text className="font-brico-bold text-item-name text-on-accent">You owe</Text>
          <Money amount={p(180600)} variant="card" onAccent />
        </Card>
        <Card tone="hero">
          <Text className="font-brico-bold text-item-name text-on-hero">Hero</Text>
          <Money amount={p(263500)} variant="card" onHero />
        </Card>
        <View className="rounded-card bg-surface p-4">
          <Card tone="item">
            <Text className="font-brico-bold text-item-name text-ink">Karahi</Text>
            <Money amount={p(263500)} variant="body" />
          </Card>
        </View>
        <Card dashed tone="item" onPress={noop} accessibilityLabel="Whose chai? Tap to claim">
          <Text className="font-brico-bold text-item-name text-ink">Chai</Text>
          <Text className="font-brico-medium text-body text-muted">Whose chai? Tap to claim</Text>
        </Card>
      </Section>

      <Section title="Sheet">
        <Sheet>
          <Text className="font-brico-extrabold text-screen-title text-ink">Sheet</Text>
          <Text className="font-brico-medium text-body text-muted">Static sheet surface with a grabber.</Text>
        </Sheet>
      </Section>

      <Section title="BottomBar">
        <View className="overflow-hidden rounded-card border border-chip">
          <BottomBar
            activeKey={tab}
            onChange={setTab}
            action={
              <StickyAction
                label="See the split"
                accessibilityLabel="See the split, 1 item left"
                badge="1 left"
                onPress={noop}
              />
            }
          />
        </View>
      </Section>
    </View>
  );
}

function SchemeBlock({ scheme }: { scheme: Scheme }) {
  return (
    <ThemeProvider forceScheme={scheme} className="mb-4 overflow-hidden rounded-hero border-2 border-chip">
      <Text className="bg-bg px-4 pt-4 font-brico-extrabold text-body-small uppercase text-muted">{scheme}</Text>
      <Gallery />
    </ThemeProvider>
  );
}

function Screen() {
  const { scheme, devOverride, setDevOverride } = useTheme();
  const next: Scheme = scheme === 'dark' ? 'light' : 'dark';
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="pt-12">
      <View className="flex-row items-center justify-between px-4 pb-4">
        <Text className="font-brico-extrabold text-screen-title text-ink">Components</Text>
        <Button
          label={`App: ${devOverride ?? 'system'}`}
          accessibilityLabel={`Switch app theme to ${next}`}
          onPress={() => setDevOverride(next)}
          variant="outline"
        />
      </View>
      <View className="px-4">
        <SchemeBlock scheme="light" />
        <SchemeBlock scheme="dark" />
      </View>
    </ScrollView>
  );
}

export default function ComponentsDevScreen() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Screen />;
}
