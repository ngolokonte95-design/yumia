/**
 * MEETUPS — sorties proposées par la communauté.
 *
 * Mise en scène (17/11/2026) : chaque sortie est une carte avec la DATE EN
 * GRAND (jour au dégradé de marque), l'hôte, la jauge de participants et un
 * bouton « Rejoindre » au dégradé. Les sorties n'ont pas de photo ni de liste
 * de participants côté API : on montre l'hôte et le nombre réel, rien
 * d'inventé.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, gradients, radius, spacing } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import { useI18n } from '../lib/useI18n';
import { useKeyboardReveal } from '../lib/useKeyboardReveal';
import { usePlanLimits } from '../lib/usePlanLimits';
import { PremiumUpsellModal } from '../components/PremiumUpsellModal';
import { FeatureTip } from '../components/FeatureTip';
import { promptReport } from '../lib/report-content';
import { GradientText, Reveal } from '../components/ui';
import { haptics } from '../lib/useHaptics';
import {
  BrandButton, GlassIconButton, OutlineButton, SocialEmpty, SocialHeader,
} from '../components/social/SocialChrome';

const API = API_BASE_URL;

interface Meetup {
  id: string;
  title: string;
  description?: string;
  city: string;
  date: string;
  maxAttendees?: number;
  attendeesCount: number;
  myStatus?: string | null;
  host: { id: string; displayName: string; photoUrl?: string } | null;
}

/** Morceaux de date pour le bloc « calendrier » de la carte. */
function dateParts(iso: string, locale: string) {
  const d = new Date(iso);
  const loc = locale || 'fr';
  try {
    return {
      day: String(d.getDate()),
      month: d.toLocaleDateString(loc, { month: 'short' }).replace('.', ''),
      weekday: d.toLocaleDateString(loc, { weekday: 'long' }),
      time: d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }),
    };
  } catch {
    return {
      day: String(d.getDate()),
      month: String(d.getMonth() + 1).padStart(2, '0'),
      weekday: '',
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    };
  }
}

export default function MeetupScreen() {
  const { accessToken, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Formulaire de création : les derniers champs (lieu, date, participants)
  // passaient sous le clavier.
  const createScrollRef = useRef<ScrollViewInstance>(null);
  const kb = useKeyboardReveal(createScrollRef);
  const { t, locale } = useI18n();
  const [meetups, setMeetups] = useState<Meetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [upsell, setUpsell] = useState<string | null>(null);
  const { checkLimit, recordUsage, quotaMessage } = usePlanLimits();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', city: '', date: '', maxAttendees: '' });

  const load = useCallback(async (cityFilter?: string) => {
    if (!accessToken) return;
    setLoading(true);
    const url = cityFilter ? `${API}/meetups?city=${encodeURIComponent(cityFilter)}` : `${API}/meetups`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) setMeetups(await res.json());
    setLoading(false);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const rsvp = async (meetupId: string, currentStatus: string | null | undefined) => {
    const status = currentStatus === 'going' ? 'cancel' : 'going';
    if (status === 'going') haptics.success(); else haptics.select();
    await fetch(`${API}/meetups/${meetupId}/rsvp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ status }),
    });
    setMeetups((prev) => prev.map((m) => m.id === meetupId ? { ...m, myStatus: status === 'cancel' ? null : status, attendeesCount: m.attendeesCount + (status === 'cancel' ? -1 : 1) } : m));
  };

  const createMeetup = async () => {
    if (!form.title.trim() || !form.city.trim() || !form.date.trim()) {
      Alert.alert(t('mu_fill_required'));
      return;
    }
    // Vérifié avant l'envoi, décompté après la création : un échec réseau ne
    // doit pas consommer l'un des deux événements du jour.
    const { allowed } = await checkLimit('eventsPerDay');
    if (!allowed) { setShowCreate(false); setUpsell(quotaMessage('eventsPerDay', t('mu_title'))); return; }

    setCreating(true);
    const res = await fetch(`${API}/meetups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        city: form.city.trim(),
        date: new Date(form.date).toISOString(),
        maxAttendees: form.maxAttendees ? +form.maxAttendees : undefined,
      }),
    });
    setCreating(false);
    if (res.ok) {
      await recordUsage('eventsPerDay');
      setShowCreate(false);
      setForm({ title: '', description: '', city: '', date: '', maxAttendees: '' });
      void load();
    } else {
      Alert.alert(t('mu_error'), t('mu_create_error'));
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <PremiumUpsellModal visible={upsell !== null} message={upsell ?? ''} onClose={() => setUpsell(null)} />
      <SocialHeader
        title={t('mu_title')}
        onBack={() => router.back()}
        right={<BrandButton compact label={t('mu_create')} onPress={() => setShowCreate(true)} />}
      />

      {/* Filtre par ville */}
      <View style={styles.search}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder={t('mu_filter_city_placeholder')}
          placeholderTextColor={colors.textMuted}
          value={city}
          onChangeText={setCity}
          onSubmitEditing={() => void load(city)}
          returnKeyType="search"
        />
        {city ? (
          <Pressable onPress={() => { setCity(''); void load(); }} hitSlop={8} style={styles.clearBtn}>
            <Text style={styles.clearText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={meetups}
          keyExtractor={(m) => m.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: insets.bottom + 80, gap: spacing.md }}
          renderItem={({ item, index }) => (
            <Reveal index={Math.min(index, 6)}>
              <MeetupCard
                item={item}
                locale={locale}
                isMine={!item.host || item.host.id === user?.id}
                onRsvp={() => void rsvp(item.id, item.myStatus)}
                onReport={() => promptReport({
                  accessToken,
                  targetType: 'meetup',
                  targetId: item.id,
                  t,
                  titleKey: 'report_meetup_title',
                })}
              />
            </Reveal>
          )}
          ListEmptyComponent={
            <SocialEmpty
              emoji="🌃"
              title={t('mu_empty_title')}
              text={t('mu_empty_text')}
              action={<BrandButton label={t('mu_create')} onPress={() => setShowCreate(true)} />}
            />
          }
        />
      )}

      {/* Création d'une sortie */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { paddingTop: insets.top || 24 }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowCreate(false)} hitSlop={8}>
              <Text style={styles.cancel}>{t('mu_cancel')}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{t('mu_new_meetup')}</Text>
            <BrandButton
              compact
              label={t('mu_create').replace('+ ', '')}
              onPress={() => void createMeetup()}
              loading={creating}
            />
          </View>
          <ScrollView
            ref={createScrollRef}
            keyboardShouldPersistTaps="handled"
            onScroll={kb.onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ padding: spacing.md, gap: 12, paddingBottom: spacing.md + kb.bottomInset }}
          >
            <GradientText style={styles.modalHero}>{t('mu_new_meetup')}</GradientText>
            <TextInput style={styles.input} placeholder={t('mu_title_field_placeholder')} placeholderTextColor={colors.textMuted} value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} />
            <TextInput style={[styles.input, { minHeight: 96, textAlignVertical: 'top' }]} placeholder={t('mu_description_placeholder')} placeholderTextColor={colors.textMuted} value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} multiline />
            <TextInput style={styles.input} placeholder={t('mu_city_field_placeholder')} placeholderTextColor={colors.textMuted} value={form.city} onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} />
            <TextInput
              style={styles.input}
              placeholder={t('mu_date_placeholder')}
              placeholderTextColor={colors.textMuted}
              value={form.date}
              onChangeText={(v) => setForm((f) => ({ ...f, date: v }))}
            />
            <TextInput style={styles.input} placeholder={t('mu_max_attendees_placeholder')} placeholderTextColor={colors.textMuted} value={form.maxAttendees} onChangeText={(v) => setForm((f) => ({ ...f, maxAttendees: v }))} keyboardType="numeric" />
          </ScrollView>
        </View>
      </Modal>
      <FeatureTip feature="meetups" />
    </View>
  );
}

// ── Carte de sortie ──────────────────────────────────────────────────────────

function MeetupCard({
  item, locale, isMine, onRsvp, onReport,
}: {
  item: Meetup;
  locale: string;
  isMine: boolean;
  onRsvp: () => void;
  onReport: () => void;
}) {
  const { t } = useI18n();
  const d = dateParts(item.date, locale);
  const going = item.myStatus === 'going';
  const fill = item.maxAttendees ? Math.min(1, item.attendeesCount / item.maxAttendees) : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        {/* Bloc calendrier : le jour en grand, au dégradé de marque. */}
        <View style={styles.dateBlock}>
          <Text style={styles.dateMonth} numberOfLines={1}>{d.month}</Text>
          <GradientText style={styles.dateDay}>{d.day}</GradientText>
          <Text style={styles.dateTime}>{d.time}</Text>
        </View>

        <View style={styles.cardInfo}>
          {d.weekday ? <Text style={styles.weekday} numberOfLines={1}>{d.weekday}</Text> : null}
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.cardCity} numberOfLines={1}>📍 {item.city}</Text>
        </View>

        {/* Signaler une sortie créée par quelqu'un d'autre (règle 1.2 App Store). */}
        {!isMine ? (
          <GlassIconButton
            icon="⋯"
            size={34}
            label={t('report_meetup_title')}
            onPress={onReport}
          />
        ) : null}
      </View>

      {item.description ? <Text style={styles.cardDesc} numberOfLines={3}>{item.description}</Text> : null}

      {/* Hôte + participants réels */}
      <View style={styles.hostRow}>
        <View style={styles.hostAvatar}>
          {item.host?.photoUrl ? (
            <Image source={{ uri: item.host.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.hostInitialBox]}>
              <Text style={styles.hostInitial}>{(item.host?.displayName ?? '?')[0]}</Text>
            </LinearGradient>
          )}
        </View>
        <Text style={styles.hostText} numberOfLines={1}>
          {t('mu_by_host').replace('{name}', item.host?.displayName ?? '?')}
        </Text>
        <Text style={styles.attendees}>
          {t('mu_participants').replace('{n}', String(item.attendeesCount)).replace('{max}', item.maxAttendees ? `/${item.maxAttendees}` : '')}
        </Text>
      </View>

      {fill !== null ? (
        <View style={styles.gauge}>
          <LinearGradient
            colors={gradients.brand}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.gaugeFill, { width: `${Math.max(4, Math.round(fill * 100))}%` }]}
          />
        </View>
      ) : null}

      {going ? (
        <OutlineButton label={t('mu_going')} onPress={onRsvp} />
      ) : (
        <BrandButton label={t('mu_join_tonight')} onPress={onRsvp} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.md, marginBottom: spacing.md, paddingLeft: spacing.md, paddingRight: spacing.sm,
    height: 48, borderRadius: radius.pill,
    backgroundColor: 'rgba(31,31,42,0.72)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
  },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, height: 48 },
  clearBtn: { padding: 6 },
  clearText: { color: colors.textMuted, fontSize: 14 },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.md, gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  dateBlock: {
    width: 76, paddingVertical: 10, borderRadius: radius.lg, alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  dateMonth: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase' },
  dateDay: { fontSize: 38, fontWeight: '900', letterSpacing: -1, lineHeight: 44 },
  dateTime: { color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
  cardInfo: { flex: 1, gap: 4, minWidth: 0 },
  weekday: { color: colors.brandSoft, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  cardTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  cardCity: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  cardDesc: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },

  hostRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hostAvatar: {
    width: 30, height: 30, borderRadius: 15, overflow: 'hidden',
    borderWidth: 1.5, borderColor: colors.surface,
  },
  hostInitialBox: { alignItems: 'center', justifyContent: 'center' },
  hostInitial: { color: '#fff', fontSize: 13, fontWeight: '900' },
  hostText: { flex: 1, color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  attendees: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  gauge: { height: 5, borderRadius: 3, backgroundColor: colors.surfaceElevated, overflow: 'hidden', marginTop: -6 },
  gaugeFill: { height: 5, borderRadius: 3 },

  modal: { flex: 1, backgroundColor: colors.bg },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 12,
  },
  cancel: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  modalTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  modalHero: { fontSize: 30, fontWeight: '900', letterSpacing: -0.6, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, color: colors.textPrimary, fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
});
