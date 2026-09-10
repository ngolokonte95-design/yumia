/**
 * Journée complète d'un itinéraire — panneau flottant.
 *
 * En mode semaine, une étape couvre un jour entier et sa description mentionne
 * plusieurs endroits dont un seul était cliquable. Ce panneau déroule la
 * journée moment par moment : chacun a sa photo, son texte et son lieu.
 */
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, motion, radius, spacing, typography } from '../theme/tokens';
import { Reveal } from './ui/Reveal';

export interface DayMoment {
  time: string;
  type: string;
  name: string;
  description: string;
  emoji: string;
  tips?: string;
  placeId?: string;
  placeRating?: number;
  placePhoto?: string;
  placeLat?: number;
  placeLng?: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** L'étape-journée : son intitulé, son résumé, et ses moments. */
  day: { time: string; name: string; description: string; emoji: string; moments?: DayMoment[] } | null;
  /** Couleur du mode en cours (Date, Voyage…), pour rester cohérent avec l'écran. */
  accent: string;
  onOpenPlace: (moment: DayMoment) => void;
  seePlaceLabel: string;
  closeLabel: string;
}

export function DayDetailModal({ visible, onClose, day, accent, onOpenPlace, seePlaceLabel, closeLabel }: Props) {
  const insets = useSafeAreaInsets();
  const moments = day?.moments ?? [];

  return (
    <Modal
      visible={visible && !!day}
      transparent
      // `none` : l'animation vient de Reanimated juste en dessous. Superposer
      // la transition native et la nôtre donnerait un double mouvement.
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View entering={FadeIn.duration(motion.duration.fast)} style={styles.backdrop}>
        {/* Fermeture au tap hors du panneau — attendu sur ce type de feuille. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View
          entering={FadeInDown.duration(motion.duration.normal)}
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.headerEmoji}>{day?.emoji}</Text>
            <View style={styles.headerText}>
              <Text style={[styles.headerDay, { color: accent }]}>{day?.time}</Text>
              <Text style={styles.headerTitle} numberOfLines={2}>{day?.name}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
              <Text style={styles.closeTxt}>✕</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {day?.description ? (
              <View style={[styles.summary, { borderLeftColor: accent }]}>
                <Text style={styles.summaryTxt}>{day.description}</Text>
              </View>
            ) : null}

            {moments.map((m, i) => (
              <Reveal key={`${m.time}-${i}`} index={i} style={styles.moment}>
                {m.placePhoto ? (
                  <Image source={{ uri: m.placePhoto }} style={styles.photo} contentFit="cover" transition={180} />
                ) : null}

                <View style={styles.momentBody}>
                  <View style={styles.momentTop}>
                    <Text style={styles.momentEmoji}>{m.emoji}</Text>
                    <View style={[styles.timeChip, { borderColor: accent }]}>
                      <Text style={[styles.timeTxt, { color: accent }]}>{m.time}</Text>
                    </View>
                  </View>

                  <Text style={styles.momentName}>{m.name}</Text>
                  <Text style={styles.momentDesc}>{m.description}</Text>

                  {m.placeRating ? (
                    <Text style={styles.rating}>⭐ {m.placeRating.toFixed(1)}</Text>
                  ) : null}

                  {m.tips ? (
                    <View style={[styles.tip, { borderLeftColor: accent }]}>
                      <Text style={styles.tipTxt}>💡 {m.tips}</Text>
                    </View>
                  ) : null}

                  {m.placeId ? (
                    <Pressable style={[styles.placeBtn, { borderColor: accent }]} onPress={() => onOpenPlace(m)}>
                      <Text style={[styles.placeBtnTxt, { color: accent }]}>{seePlaceLabel}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Reveal>
            ))}
          </ScrollView>

          <Pressable style={[styles.doneBtn, { backgroundColor: accent }]} onPress={onClose}>
            <Text style={styles.doneTxt}>{closeLabel}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.sm,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.sm,
  },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  headerEmoji: { fontSize: 26 },
  headerText: { flex: 1 },
  headerDay: { ...typography.label, fontSize: 12 },
  headerTitle: { ...typography.h3, color: colors.textPrimary },
  close: { padding: 4 },
  closeTxt: { fontSize: 18, color: colors.textMuted },

  scroll: { padding: spacing.md, gap: spacing.md },
  summary: {
    borderLeftWidth: 3, paddingLeft: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.sm, paddingVertical: spacing.sm,
  },
  summaryTxt: { ...typography.body, color: colors.textSecondary, fontStyle: 'italic' },

  moment: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  photo: { width: '100%', height: 150, backgroundColor: colors.surfaceElevated },
  momentBody: { padding: spacing.md, gap: 6 },
  momentTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  momentEmoji: { fontSize: 20 },
  timeChip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  timeTxt: { ...typography.label, fontSize: 11 },
  momentName: { ...typography.h3, fontSize: 16, color: colors.textPrimary },
  momentDesc: { ...typography.body, color: colors.textSecondary },
  rating: { fontSize: 13, color: colors.textMuted },
  tip: {
    borderLeftWidth: 3, paddingLeft: spacing.sm, paddingVertical: 6,
    backgroundColor: colors.surfaceElevated, borderRadius: radius.sm, marginTop: 2,
  },
  tipTxt: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic' },
  placeBtn: {
    borderWidth: 1, borderRadius: radius.pill,
    paddingVertical: 9, alignItems: 'center', marginTop: 4,
  },
  placeBtnTxt: { ...typography.label, fontSize: 13 },

  doneBtn: {
    marginHorizontal: spacing.md, marginTop: spacing.sm,
    borderRadius: radius.pill, paddingVertical: 13, alignItems: 'center',
  },
  doneTxt: { ...typography.label, color: '#fff', fontSize: 14 },
});
