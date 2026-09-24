/**
 * Bandeau de l'onglet Activité : mes visites sont-elles visibles par mes
 * abonnés ? Modifiable d'un geste, ici même — même réglage que « Montrer mes
 * visites » dans le profil.
 *
 * Contrairement aux Rencontres, il ne conditionne pas l'onglet : on voit les
 * visites des autres quoi qu'il arrive ; il ne décide que des siennes.
 */
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/useI18n';
import { API_BASE_URL } from '../lib/config';

export function VisitsVisibilityBanner() {
  const { user, accessToken, reloadUser } = useAuth();
  const { t } = useI18n();
  // Affichage immédiat au toucher, remis d'aplomb si l'enregistrement échoue.
  const [on, setOn] = useState(user?.shareVisits === true);

  const toggle = async (value: boolean) => {
    if (!accessToken) return;
    setOn(value);
    try {
      const res = await fetch(`${API_BASE_URL}/social/profile/privacy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ shareVisits: value }),
      });
      if (!res.ok) throw new Error(String(res.status));
      await reloadUser();
    } catch {
      setOn(!value);
    }
  };

  return (
    <View style={styles.banner}>
      <Text style={styles.icon}>{on ? '👁' : '🔒'}</Text>
      <Text style={styles.txt}>{on ? t('act_visits_shared') : t('act_visits_private')}</Text>
      <Switch
        value={on}
        onValueChange={(v) => void toggle(v)}
        trackColor={{ false: colors.border, true: colors.brand }}
        thumbColor="#fff"
        accessibilityLabel={t('esp_visits_title')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.md, marginTop: spacing.sm, marginBottom: spacing.xs,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  icon: { fontSize: 16 },
  txt: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textPrimary },
});
