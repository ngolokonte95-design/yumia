import { useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, ScrollView, Switch,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../lib/auth-context';
import { uploadAvatarRequest } from '../lib/auth-api';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import { useI18n } from '../lib/useI18n';
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

export default function EditSocialProfileScreen() {
  const { user, accessToken, updateProfile, reloadUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>{t('esp_title')}</Text>
        <Pressable onPress={save} disabled={saving} style={styles.saveBtn}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveTxt}>{t('esp_save')}</Text>}
        </Pressable>
      </View>

      {/* Avatar */}
      <View style={styles.avatarSection}>
        <Pressable onPress={pickPhoto} style={styles.avatarWrap}>
          {uploadingPhoto ? (
            <ActivityIndicator color={colors.brand} />
          ) : photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}><Text style={styles.avatarInitial}>{user?.displayName[0]}</Text></View>
          )}
          <View style={styles.cameraIcon}><Text style={{ fontSize: 16 }}>📷</Text></View>
        </Pressable>
        <Text style={styles.avatarHint}>{t('esp_avatar_hint')}</Text>
      </View>

      {/* Nom */}
      <View style={styles.section}>
        <Text style={styles.label}>{t('esp_display_name')}</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={40}
          placeholder={t('esp_name_placeholder')}
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Bio */}
      <View style={styles.section}>
        <Text style={styles.label}>{t('esp_bio')}</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={bio}
          onChangeText={setBio}
          maxLength={200}
          multiline
          numberOfLines={3}
          placeholder={t('esp_bio_placeholder')}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.counter}>{bio.length}/200</Text>
      </View>

      {/* Sexe */}
      <View style={styles.section}>
        <Text style={styles.label}>{t('esp_i_am')}</Text>
        <View style={styles.chips}>
          {GENDERS.map((g) => (
            <Pressable
              key={g.value}
              style={[styles.chip, gender === g.value && styles.chipActive]}
              onPress={() => setGender(g.value)}
            >
              <Text style={[styles.chipText, gender === g.value && styles.chipTextActive]}>{t(g.labelKey)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Âge */}
      <View style={styles.section}>
        <Text style={styles.label}>{t('esp_birth_year')} {age ? t('esp_years_old').replace('{age}', String(age)) : ''}</Text>
        {/* Une fois connue, l'année ne change plus (elle ouvre Tind et les
            Rencontres, réservés aux majeurs) : le serveur la refuse aussi. */}
        <TextInput
          style={[styles.input, !!user?.birthYear && { opacity: 0.6 }]}
          editable={!user?.birthYear}
          value={birthYear}
          onChangeText={(v) => setBirthYear(v.replace(/\D/g, '').slice(0, 4))}
          keyboardType="numeric"
          maxLength={4}
          placeholder={t('esp_birth_year_placeholder')}
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Intéressé par */}
      <View style={styles.section}>
        <Text style={styles.label}>{t('esp_want_to_meet')}</Text>
        <View style={styles.chips}>
          {INTERESTED_IN.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.chip, interestedIn === opt.value && styles.chipActive]}
              onPress={() => setInterestedIn(opt.value)}
            >
              <Text style={[styles.chipText, interestedIn === opt.value && styles.chipTextActive]}>{t(opt.labelKey)}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>{t('esp_meet_hint')}</Text>
      </View>

      {/* Profil privé / public */}
      <View style={styles.section}>
        <Text style={styles.label}>{t('esp_account_privacy')}</Text>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>{isPrivate ? t('esp_private_account') : t('esp_public_account')}</Text>
            <Text style={styles.toggleSub}>
              {isPrivate
                ? t('esp_private_sub')
                : t('esp_public_sub')}
            </Text>
          </View>
          <Switch
            value={isPrivate}
            onValueChange={setIsPrivate}
            trackColor={{ false: colors.border, true: colors.brand }}
            thumbColor="#fff"
          />
        </View>

        {/* Visites et rencontres : des données de position, donc désactivées
            tant que l'utilisateur ne les active pas lui-même. */}
        <View style={[styles.toggleRow, { marginTop: spacing.sm }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>{t('esp_visits_title')}</Text>
            <Text style={styles.toggleSub}>{t('esp_visits_sub')}</Text>
          </View>
          <Switch
            value={shareVisits}
            onValueChange={setShareVisits}
            trackColor={{ false: colors.border, true: colors.brand }}
            thumbColor="#fff"
          />
        </View>
        <View style={[styles.toggleRow, { marginTop: spacing.sm }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>{t('esp_encounters_title')}</Text>
            <Text style={styles.toggleSub}>{t('esp_encounters_sub')}</Text>
          </View>
          <Switch
            value={shareEncounters}
            onValueChange={(v) => void toggleEncounters(v)}
            trackColor={{ false: colors.border, true: colors.brand }}
            thumbColor="#fff"
          />
        </View>
        {shareEncounters && (
          <View style={{ marginTop: spacing.sm }}>
            <Text style={styles.toggleSub}>{t('esp_enc_audience_title')}</Text>
            <View style={[styles.chips, { marginTop: 6 }]}>
              {(['everyone', 'female', 'male'] as const).map((a) => (
                <Pressable
                  key={a}
                  style={[styles.chip, encounterAudience === a && styles.chipActive]}
                  onPress={() => setEncounterAudience(a)}
                >
                  <Text style={[styles.chipText, encounterAudience === a && styles.chipTextActive]}>
                    {t(a === 'everyone' ? 'esp_audience_everyone' : a === 'female' ? 'esp_audience_female' : 'esp_audience_male')}
                  </Text>
                </Pressable>
              ))}
            </View>
            {encounterAudience !== 'everyone' && (
              <Text style={[styles.toggleSub, { marginTop: 6 }]}>{t('esp_enc_audience_note')}</Text>
            )}
          </View>
        )}

        {/* Carte : qui voit ma position quand je la partage. Le serveur
            applique ce choix, quelle que soit la version de l'app. */}
        <View style={{ marginTop: spacing.md }}>
          <Text style={styles.toggleTitle}>{t('esp_map_title')}</Text>
          <Text style={styles.toggleSub}>{t('esp_map_sub')}</Text>
          <View style={[styles.chips, { marginTop: 6 }]}>
            {(['everyone', 'friends'] as const).map((a) => (
              <Pressable
                key={a}
                style={[styles.chip, mapAudience === a && styles.chipActive]}
                onPress={() => setMapAudience(a)}
              >
                <Text style={[styles.chipText, mapAudience === a && styles.chipTextActive]}>
                  {t(a === 'everyone' ? 'esp_audience_everyone' : 'esp_audience_friends')}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <View style={{ height: insets.bottom + 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12 },
  back: { fontSize: 22, color: colors.brand, marginRight: spacing.sm },
  title: { ...typography.h2, color: colors.text, flex: 1 },
  saveBtn: { backgroundColor: colors.brand, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 8 },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  avatarSection: { alignItems: 'center', paddingVertical: spacing.lg },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: colors.brand + '44',
  },
  avatarInitial: { fontSize: 36, color: '#fff', fontWeight: '700' },
  cameraIcon: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: colors.surface, borderRadius: 14,
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.border,
  },
  avatarHint: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  section: { paddingHorizontal: spacing.md, marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: 14, color: colors.text, fontSize: 15,
    borderWidth: 1, borderColor: colors.border,
  },
  inputMulti: { height: 90, textAlignVertical: 'top' },
  counter: { fontSize: 11, color: colors.textMuted, textAlign: 'right', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: colors.surface, borderRadius: radius.full,
    borderWidth: 1.5, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand + '22', borderColor: colors.brand },
  chipText: { color: colors.textMuted, fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: colors.brand },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 10, lineHeight: 17 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  toggleTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 3 },
  toggleSub: { fontSize: 12, color: colors.textMuted, lineHeight: 16 },
});
