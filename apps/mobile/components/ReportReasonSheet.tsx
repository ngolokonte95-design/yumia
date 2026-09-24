/**
 * Feuille de choix du motif de signalement (Android).
 *
 * Montée une seule fois à la racine de l'app : `promptReport` (lib/report-content)
 * lui envoie les textes déjà traduits. Remplace `Alert.alert`, qui sur Android
 * ne montre que trois boutons et masquait donc la moitié des motifs.
 * Sur iOS, `promptReport` utilise la feuille native et ce composant reste inerte.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { subscribeReportPicker, type ReportPickerRequest } from '../lib/report-content';
import { colors, radius, spacing } from '../theme/tokens';

export function ReportReasonSheet() {
  const insets = useSafeAreaInsets();
  const [request, setRequest] = useState<ReportPickerRequest | null>(null);

  useEffect(() => subscribeReportPicker(setRequest), []);

  const close = () => setRequest(null);
  const pick = (index: number) => {
    const current = request;
    setRequest(null);
    current?.onPick(index);
  };

  return (
    <Modal
      visible={request !== null}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}
    >
      <Pressable style={styles.backdrop} onPress={close} accessibilityRole="button" accessibilityLabel={request?.cancelLabel}>
        {/* Le panneau absorbe les touches : seul le fond ferme la feuille. */}
        <Pressable style={[styles.sheet, { paddingBottom: spacing.md + insets.bottom }]} onPress={() => undefined}>
          {request && (
            <>
              <Text style={styles.title}>{request.title}</Text>
              <Text style={styles.message}>{request.message}</Text>
              <View style={styles.list}>
                {request.reasons.map((reason, i) => (
                  <Pressable
                    key={reason}
                    onPress={() => pick(i)}
                    style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.optionText}>{reason}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={close}
                style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={styles.cancelText}>{request.cancelLabel}</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  message: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: spacing.xs },
  list: { marginTop: spacing.md },
  option: {
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  optionText: { color: colors.textPrimary, fontSize: 16, textAlign: 'center' },
  cancel: {
    marginTop: spacing.sm,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  cancelText: { color: colors.danger, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  pressed: { opacity: 0.6 },
});
