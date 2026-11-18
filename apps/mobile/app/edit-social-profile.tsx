import { useRef, useState } from 'react';
import {
  ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, View,
  type TextInputProps,
} from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { CrystalFill, GradientText, PressableScale, Reveal } from '../components/ui';
import {
  AvatarHalo, BACK_ARROW, BrandBadge, QuietRing, SelectChip, TopGlassButton,
} from '../components/p2b/ProfileVisuals';
import { GLASS, GlassGroup, SectionLabel, ToggleRow } from '../components/profile/ProfileChrome';
import { useAuth } from '../lib/auth-context';
import { uploadAvatarRequest } from '../lib/auth-api';
import { colors, gradients, radius, spacing, typography } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import { useI18n } from '../lib/useI18n';
import { useKeyboardReveal } from '../lib/useKeyboardReveal';
import type { TranslationKey } from '../lib/translations';
import * as Location from 'expo-location';

const API = API_BASE_URL;

const GENDERS: { value: string; labelKey: TranslationKey }[] = [
  { value: 'male', labelKey: 'esp_gender_male' },
  { value: 'female', labelKey: 'esp_gender_female' },
  { value: 'other', labelKey: 'esp_gender_other' },
];

const INTERESTED_IN: { value: string; labelKey: TranslationKey }[] = [
  { value: 'everyone', labelKey: 'esp_interested_everyone' },
  { value: 'female', labelKey: 'esp_interested_female' },
  { value: 'male', labelKey: 'esp_interested_male' },
];

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Modifier le profil social — DA du 18/11/2026, sobre comme le profil :
 * halo argent derrière l'avatar, champs en verre (liseré clair au focus),
 * choix sertis de cristal, réglages de confidentialité en groupe vitré.
 * Aucune couleur hormis l'interrupteur actif.
 */

export default function EditSocialProfileScreen() {
  const { user, accessToken, updateProfile, reloadUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // La bio est en bas du formulaire : sans ça, le clavier la recouvrait.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const kb = useKeyboardReveal(scrollRef);
  const { t } = useI18n();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [gender, setGender] = useState<string>(user?.gender ?? '');
  const [birthYear, setBirthYear] = useState<string>(user?.birthYear ? String(user.birthYear) : '');
  const [interestedIn, setInterestedIn] = useState<string>(user?.interestedIn ?? 'everyone');
  const [isPrivate, setIsPrivate] = useState<boolean>(user?.isPrivate ?? false);
  const [shareVisits, setShareVisits] = useState<boolean>(user?.shareVisits ?? false);
  const [shareEncounters, setShareEncounters] = useState<boolean>(user?.shareEncounters ?? false);
  const [mapAudience, setMapAudience] = useState<'everyone' | 'friends'>(user?.mapAudience ?? 'friends');
  const [encounterAudience, setEncounterAudience] = useState<'everyone' | 'female' | 'male'>(
    user?.encounterAudience ?? 'everyone',
  );

  /**
   * Activer les Rencontres demande la localisation (au premier plan
   * seulement) : sans elle, aucun croisement ne peut être détecté. Refusée,
   * le réglage reste désactivé plutôt que d'être actif et sans effet.
   */
  const toggleEncounters = async (on: boolean) => {
    if (!on) { setShareEncounters(false); return; }
    const { status } = await Location.requestForegroundPermissionsAsync();
    setShareEncounters(status === 'granted');
  };
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const age = birthYear && !isNaN(+birthYear) ? CURRENT_YEAR - +birthYear : null;

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingPhoto(true);
    try {
      // Passe par l'uploader partage (lib/auth-api) plutot que de refaire un
      // fetch ici : c'etait la meme logique en double, et seule celle-ci a ete
      // corrigee le jour ou FormData a change de regles.
      if (!accessToken) return;
      const data = await uploadAvatarRequest(accessToken, result.assets[0].uri);
      await updateProfile({ photoUrl: data.photoUrl });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        gender: gender || undefined,
        birthYear: !user?.birthYear && birthYear && !isNaN(+birthYear) ? +birthYear : undefined,
        interestedIn,
      });
      // isPrivate enregistré séparément (champ non encore dans le type PublicUser)
      if (accessToken) {
        await fetch(`${API}/social/profile/privacy`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ isPrivate, shareVisits, shareEncounters, mapAudience, encounterAudience }),
        }).catch(() => {});
        // L'onglet Social lit ces réglages sur l'utilisateur en mémoire.
        await reloadUser().catch(() => {});
      }
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const photoUrl = user?.photoUrl
    ? user.photoUrl.startsWith('http') ? user.photoUrl : `${API.replace('/api', '')}${user.photoUrl}`
    : null;

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <TopGlassButton label={BACK_ARROW} onPress={() => router.back()} />
        <GradientText style={styles.title} colors={gradients.crystal} numberOfLines={1}>{t('esp_title')}</GradientText>
        <SaveButton label={t('esp_save')} saving={saving} onPress={() => void save()} />
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={kb.onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: kb.bottomInset + insets.bottom + 40 }}
      >
        {/* ── Avatar : halo argent, anneau discret, pastille appareil photo ── */}
        <Reveal index={0} style={styles.avatarSection}>
          <View style={styles.avatarStage}>
            <AvatarHalo size={240} />
            <PressableScale onPress={() => void pickPhoto()} scaleTo={0.95}>
              <QuietRing size={112}>
                {uploadingPhoto ? (
                  <ActivityIndicator color="#fff" />
                ) : photoUrl ? (
                  <Image source={{ uri: photoUrl }} style={styles.avatar} />
                ) : (
                  <Text style={styles.avatarInitial}>{user?.displayName[0]?.toUpperCase()}</Text>
                )}
              </QuietRing>
              <BrandBadge label="📷" size={34} style={styles.cameraBadge} onPress={() => void pickPhoto()} />
            </PressableScale>
          </View>
          <Text style={styles.avatarHint}>{t('esp_avatar_hint')}</Text>
        </Reveal>

        {/* ── Nom et bio ── */}
        <Reveal index={1} style={styles.section}>
          <SectionLabel label={t('esp_display_name')} style={styles.label} />
          <GlassField
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={40}
            placeholder={t('esp_name_placeholder')}
          />

          <SectionLabel label={t('esp_bio')} style={styles.label} />
          <GlassField
            style={styles.inputMulti}
            value={bio}
            onChangeText={setBio}
            maxLength={200}
            multiline
            numberOfLines={3}
            placeholder={t('esp_bio_placeholder')}
          />
          <Text style={styles.counter}>{bio.length}/200</Text>
        </Reveal>

        {/* ── Qui je suis ── */}
        <Reveal index={2} style={styles.section}>
          <SectionLabel label={t('esp_i_am')} style={styles.label} />
          <View style={styles.chips}>
            {GENDERS.map((g) => (
              <SelectChip key={g.value} fill label={t(g.labelKey)} active={gender === g.value} onPress={() => setGender(g.value)} />
            ))}
          </View>

          <SectionLabel
            label={`${t('esp_birth_year')}${age ? ` ${t('esp_years_old').replace('{age}', String(age))}` : ''}`}
            style={styles.label}
          />
          {/* Une fois connue, l'année ne change plus (elle ouvre Tind et les
              Rencontres, réservés aux majeurs) : le serveur la refuse aussi. */}
          <GlassField
            locked={!!user?.birthYear}
            editable={!user?.birthYear}
            value={birthYear}
            onChangeText={(v) => setBirthYear(v.replace(/\D/g, '').slice(0, 4))}
            keyboardType="numeric"
            maxLength={4}
            placeholder={t('esp_birth_year_placeholder')}
          />

          <SectionLabel label={t('esp_want_to_meet')} style={styles.label} />
          <View style={styles.chips}>
            {INTERESTED_IN.map((opt) => (
              <SelectChip key={opt.value} fill label={t(opt.labelKey)} active={interestedIn === opt.value} onPress={() => setInterestedIn(opt.value)} />
            ))}
          </View>
          <Text style={styles.hint}>{t('esp_meet_hint')}</Text>
        </Reveal>

        {/* ── Confidentialité ── */}
        <Reveal index={3} style={styles.section}>
          <SectionLabel label={t('esp_account_privacy')} style={styles.label} />
          <GlassGroup>
            <ToggleRow
              icon={isPrivate ? '🔒' : '🌍'}
              label={isPrivate ? t('esp_private_account') : t('esp_public_account')}
              sublabel={isPrivate ? t('esp_private_sub') : t('esp_public_sub')}
              value={isPrivate}
              onValueChange={setIsPrivate}
            />
            {/* Visites et rencontres : des données de position, donc
                désactivées tant que l'utilisateur ne les active pas lui-même. */}
            <ToggleRow
              icon="📍"
              label={t('esp_visits_title')}
              sublabel={t('esp_visits_sub')}
              value={shareVisits}
              onValueChange={setShareVisits}
            />
            <ToggleRow
              icon="✨"
              label={t('esp_encounters_title')}
              sublabel={t('esp_encounters_sub')}
              value={shareEncounters}
              onValueChange={(v) => void toggleEncounters(v)}
            />
          </GlassGroup>

          {shareEncounters && (
            <View style={styles.subBlock}>
              <Text style={styles.subTitle}>{t('esp_enc_audience_title')}</Text>
              <View style={styles.chips}>
                {(['everyone', 'female', 'male'] as const).map((a) => (
                  <SelectChip
                    key={a}
                    fill
                    label={t(a === 'everyone' ? 'esp_audience_everyone' : a === 'female' ? 'esp_audience_female' : 'esp_audience_male')}
                    active={encounterAudience === a}
                    onPress={() => setEncounterAudience(a)}
                  />
                ))}
              </View>
              {encounterAudience !== 'everyone' && (
                <Text style={styles.hint}>{t('esp_enc_audience_note')}</Text>
              )}
            </View>
          )}

          {/* Carte : qui voit ma position quand je la partage. Le serveur
              applique ce choix, quelle que soit la version de l'app. */}
          <View style={styles.subBlock}>
            <Text style={styles.subTitle}>{t('esp_map_title')}</Text>
            <Text style={styles.subText}>{t('esp_map_sub')}</Text>
            <View style={styles.chips}>
              {(['everyone', 'friends'] as const).map((a) => (
                <SelectChip
                  key={a}
                  fill
                  label={t(a === 'everyone' ? 'esp_audience_everyone' : 'esp_audience_friends')}
                  active={mapAudience === a}
                  onPress={() => setMapAudience(a)}
                />
              ))}
            </View>
          </View>
        </Reveal>

        {/* Le même bouton en bas : le formulaire est long. */}
        <Reveal index={4} style={styles.section}>
          <SaveButton label={t('esp_save')} saving={saving} onPress={() => void save()} wide />
        </Reveal>
      </ScrollView>
    </View>
  );
}

/** Bouton « Sauvegarder » serti de cristal ; roue de chargement pendant l'envoi. */
function SaveButton({ label, saving, onPress, wide = false }: {
  label: string; saving: boolean; onPress: () => void; wide?: boolean;
}) {
  return (
    <PressableScale
      style={[styles.saveBtn, wide && styles.saveBtnWide]}
      onPress={onPress}
      disabled={saving}
      scaleTo={0.95}
    >
      <CrystalFill />
      {saving ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <GradientText style={styles.saveTxt} colors={gradients.crystal} numberOfLines={1}>{label}</GradientText>
      )}
    </PressableScale>
  );
}

/** Champ en verre : liseré clair quand il a le focus, cadenas s'il est figé. */
function GlassField({ locked = false, style, ...props }: TextInputProps & { locked?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, GLASS, focused && styles.fieldFocused, locked && styles.fieldLocked]}>
      <TextInput
        {...props}
        style={[styles.input, style]}
        placeholderTextColor={colors.textMuted}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      />
      {locked ? <Text style={styles.lock}>🔒</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
  },
  title: { ...typography.heading, fontWeight: '900', color: '#fff', flex: 1, textAlign: 'center' },
  saveBtn: {
    height: 38, minWidth: 96, paddingHorizontal: 14, borderRadius: radius.pill, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnWide: { height: 50, alignSelf: 'stretch' },
  saveTxt: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 0.3 },

  avatarSection: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.md },
  avatarStage: { width: 240, height: 150, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 40, color: '#fff', fontWeight: '900' },
  cameraBadge: { position: 'absolute', bottom: 0, end: 0 },
  avatarHint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },

  section: { paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  label: { marginTop: spacing.lg },

  field: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, paddingHorizontal: spacing.md },
  fieldFocused: { borderColor: 'rgba(255,255,255,0.40)' },
  fieldLocked: { opacity: 0.6 },
  input: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '600', paddingVertical: 14 },
  inputMulti: { height: 96, textAlignVertical: 'top' },
  lock: { fontSize: 14, marginStart: spacing.sm },
  counter: { ...typography.label, color: colors.textMuted, textAlign: 'right', marginTop: 6 },

  chips: { flexDirection: 'row', gap: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 18 },

  subBlock: { marginTop: spacing.lg, gap: spacing.sm },
  subTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '800' },
  subText: { ...typography.caption, color: colors.textMuted, lineHeight: 17, marginTop: -4 },
});
