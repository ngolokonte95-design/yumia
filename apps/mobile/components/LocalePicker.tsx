import { useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ScrollView, I18nManager } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useI18n } from '../lib/useI18n';
import { SUPPORTED_LOCALES as LOCALES } from '../lib/locales';

interface Props {
  visible: boolean;
  currentLocale: string;
  onSelect: (code: string) => Promise<void>;
  onClose: () => void;
}

export function LocalePicker({ visible, currentLocale, onSelect, onClose }: Props) {
  const { t } = useI18n();
  const [pending, setPending] = useState<string | null>(null);

  async function handleSelect(code: string) {
    if (code === currentLocale) { onClose(); return; }
    setPending(code);
    try {
      await onSelect(code);
      const isRtl = LOCALES.find((l) => l.code === code)?.rtl ?? false;
      if (I18nManager.isRTL !== isRtl) {
        I18nManager.forceRTL(isRtl);
      }
      onClose();
    } finally {
      setPending(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{t('lp_title')}</Text>
        <View style={styles.listWrap}>
          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator
            indicatorStyle="white"
            contentContainerStyle={styles.listContent}
          >
            {LOCALES.map((loc) => {
              const active = loc.code === currentLocale;
              const loading = pending === loc.code;
              return (
                <Pressable
                  key={loc.code}
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => void handleSelect(loc.code)}
                  disabled={!!pending}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>
                      {loc.nativeLabel}
                    </Text>
                    {loc.label !== loc.nativeLabel ? (
                      <Text style={styles.rowSub}>{loc.label}</Text>
                    ) : null}
                  </View>
                  {loading ? (
                    <Text style={styles.check}>…</Text>
                  ) : active ? (
                    <Text style={styles.check}>✓</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
          {/* Dégradé de bas de liste : indique qu'il y a plus de langues en
              dessous, plus fiable qu'une simple barre de défilement (fine et
              peu visible sur certains Android). `pointerEvents="none"` pour
              ne jamais intercepter les taps sur la dernière ligne visible. */}
          <LinearGradient
            colors={[`${colors.surface}00`, colors.surface]}
            style={styles.scrollHintBottom}
            pointerEvents="none"
          />
        </View>
        <Pressable style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelText}>{t('cancel')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  // maxHeight : avec 13 langues désormais listées, le sheet peut dépasser
  // la hauteur d'écran. On le plafonne et on laisse la liste défiler dans
  // l'espace restant (voir `list` ci-dessous) au lieu de déborder sans
  // pouvoir scroller. paddingBottom réduit (vs xxl) : ce padding rognait
  // sur la hauteur dispo pour la liste elle-même, la rendant trop petite.
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '90%',
  },
  listWrap: { flexShrink: 1 },
  list: { flexShrink: 1 },
  listContent: { paddingBottom: spacing.sm },
  scrollHintBottom: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 28,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowActive: { backgroundColor: `${colors.brand}10` },
  rowLabel: { ...typography.body, color: colors.textPrimary },
  rowLabelActive: { color: colors.brand, fontWeight: '700' },
  rowSub: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  check: { ...typography.heading, color: colors.brand },
  cancelBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelText: { ...typography.body, color: colors.danger },
});
