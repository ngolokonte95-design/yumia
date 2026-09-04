/**
 * EMOJI PICKER — panneau inline (pas de modal plein écran) qui remplace le
 * clavier système, façon iMessage/WhatsApp. Catégories avec onglets emoji,
 * grille scrollable. Pas de lib externe : jeu d'emoji curé statique, léger.
 */
import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { colors, radius } from '../../theme/tokens';

interface Category { icon: string; emojis: string[] }

const CATEGORIES: Category[] = [
  {
    icon: '🙂',
    emojis: ['😀','😁','😂','🤣','😊','😍','😘','😜','🤩','🥳','😎','🤗','🤔','🙄','😴','🥱','😭','😢','😡','🤯','😱','🥺','😇','🤤','🤫','🤭','🙃','😉','😅','😆'],
  },
  {
    icon: '❤️',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💕','💞','💓','💗','💖','💘','💝','💔','❣️','💯','💢','🔥','✨','⭐','🎉','🎊','👏','🙌','🤝','👍','👎'],
  },
  {
    icon: '🐶',
    emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦋','🐝','🌸','🌺','🌻','🌴','🌍','🌈','☀️','⛅','🌙','⭐'],
  },
  {
    icon: '🍕',
    emojis: ['🍕','🍔','🍟','🌭','🍿','🥐','🥪','🌮','🍣','🍜','🍩','🍪','🎂','🍰','🍫','🍭','🍦','🍺','🍷','🍹','☕','🍎','🍌','🍇','🍉','🍓','🥑','🍒','🍍','🥥'],
  },
  {
    icon: '⚽',
    emojis: ['⚽','🏀','🏈','🎾','🎮','🎲','🎸','🎧','🎤','🎨','✈️','🚗','🚀','🏖️','🗺️','📸','🎬','🎁','🎈','🏆','💰','💡','⏰','📱','💻','🔑','🚪','🛌','🧳','🕺'],
  },
];

interface Props {
  onSelect: (emoji: string) => void;
}

export function EmojiPicker({ onSelect }: Props) {
  const [tab, setTab] = useState(0);

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.grid} keyboardShouldPersistTaps="handled">
        {CATEGORIES[tab].emojis.map((e, i) => (
          <Pressable key={`${e}-${i}`} style={styles.cell} onPress={() => onSelect(e)} hitSlop={4}>
            <Text style={styles.emoji}>{e}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.tabs}>
        {CATEGORIES.map((c, i) => (
          <Pressable key={c.icon} style={[styles.tab, tab === i && styles.tabActive]} onPress={() => setTab(i)}>
            <Text style={styles.tabIcon}>{c.icon}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 260, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  cell: { width: `${100 / 8}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 26 },
  tabs: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border,
    paddingVertical: 6, paddingHorizontal: 8, justifyContent: 'space-around',
  },
  tab: { paddingVertical: 4, paddingHorizontal: 14, borderRadius: radius.pill },
  tabActive: { backgroundColor: `${colors.brand}18` },
  tabIcon: { fontSize: 20 },
});
