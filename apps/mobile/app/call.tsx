/**
 * Écran d'appel voix/vidéo — WebRTC réel (react-native-webrtc).
 * Import lazy : ne crashe pas dans Expo Go, affiche un écran d'info à la place.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import { fetchIceServers } from '../lib/turn';
import { isE2EAvailable } from '../lib/e2e-crypto';
import { useI18n } from '../lib/useI18n';
import { haptics } from '../lib/useHaptics';
import { startCallSound, stopCallSound } from '../lib/call-sounds';
import { restorePlaybackAudio } from '../lib/audio-session';
import { consumeOutgoingCall } from '../lib/outgoing-call';
import { dismissIncomingCall, endNativeCall, onNativeCallEvents, setShowWhenLocked } from '../lib/call-ui';
import { SpaceBackground, SPACE_BLACK } from '../components/space/SpaceBackground';
import { GlassControl, PulsingAvatar, RoundAction } from '../components/call/CallVisuals';

// Import lazy — react-native-webrtc nécessite un build natif (pas Expo Go)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let WebRTC: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebRTC = require('react-native-webrtc');
} catch { /* Expo Go — module natif absent */ }

const API = API_BASE_URL;
// Serveurs ICE (STUN + TURN temporaire) : voir lib/turn.ts.

type CallState = 'calling' | 'ringing' | 'connected' | 'ended';
type CallType  = 'voice' | 'video';

function fmtTimer(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ── Écran affiché dans Expo Go (pas de build natif) ──────────────────────────
function NoWebRTCScreen({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  return (
    <View style={noStyles.container}>
      <Text style={noStyles.icon}>📞</Text>
      <Text style={noStyles.title}>{t('call_no_webrtc_title')}</Text>
      <Text style={noStyles.body}>{t('call_no_webrtc_body')}</Text>
      <Pressable style={noStyles.btn} onPress={onBack}>
        <Text style={noStyles.btnTxt}>{t('call_back')}</Text>
      </Pressable>
    </View>
  );
}

const noStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SPACE_BLACK, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 },
  icon: { fontSize: 64 },
  title: { fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center' },
  body: { fontSize: 15, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 22 },
  btn: { marginTop: 8, backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 32, paddingVertical: 14 },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

// ─────────────────────────────────────────────────────────────────────────────
export default function CallScreen() {
  const {
    convId, partnerId, partnerName, partnerPhoto,
    type: callTypeParam, incoming, callId: existingCallId, answered,
  } = useLocalSearchParams<{
    convId?: string; partnerId?: string; partnerName?: string; partnerPhoto?: string;
    type?: string; incoming?: string; callId?: string; answered?: string;
  }>();

  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  const callType: CallType  = callTypeParam === 'video' ? 'video' : 'voice';
  const isIncoming           = incoming === 'true';
  // Déjà décroché sur la sonnerie native (CallKit, notification Android) :
  // pas de second « Répondre » à l'écran.
  const autoAnswer           = isIncoming && answered === '1';

  const [callState, setCallState]     = useState<CallState>(isIncoming ? 'ringing' : 'calling');
  const [isMuted, setIsMuted]         = useState(false);
  const [speakerOn, setSpeakerOn]     = useState(true);
  const [videoOn, setVideoOn]         = useState(callType === 'video');
  const [timer, setTimer]             = useState(0);
  const [callIdState, setCallIdState] = useState<string | null>(existingCallId ?? null);
  const [encrypted, setEncrypted]     = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [localStream, setLocalStream]   = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [remoteStream, setRemoteStream] = useState<any>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pcRef      = useRef<any>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iceSentRef = useRef<Set<string>>(new Set());
  const iceRecvRef = useRef<Set<string>>(new Set());
  const callIdRef  = useRef<string | null>(existingCallId ?? null);
  callIdRef.current = callIdState;
  const autoAnsweredRef = useRef(false);

  const h = { Authorization: `Bearer ${accessToken ?? ''}`, 'Content-Type': 'application/json' };

  // Si Expo Go, afficher l'écran d'info directement
  if (!WebRTC) {
    return <NoWebRTCScreen onBack={() => router.back()} />;
  }

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callState]);

  // ── Sonnerie + vibration ────────────────────────────────────────────────────
  // Appel reçu : sonnerie et vibration. Appel émis : tonalité de retour
  // (« tuut… tuut ») et vibration. Tout s'arrête sur 'connected'/'ended' et au
  // démontage de l'écran (voir cleanup ci-dessous).
  useEffect(() => {
    if (callState === 'ringing' && autoAnswer) return;
    if (callState === 'calling' || callState === 'ringing') {
      haptics.startRing();
      startCallSound(callState === 'ringing' ? 'incoming' : 'outgoing');
    } else {
      haptics.stopRing();
      stopCallSound();
    }
  }, [callState]);

  // ── Nettoyage ──────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    haptics.stopRing();
    stopCallSound();
    if (pollRef.current)    clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (timerRef.current)   clearInterval(timerRef.current);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    localStream?.getTracks().forEach((t: any) => t.stop());
    pcRef.current?.close();
    pcRef.current = null;
    // Fin côté système : sans ça, l'iPhone garde l'appel CallKit ouvert
    // (bandeau vert), et Android l'écran d'appel devant le verrouillage.
    endNativeCall(callIdRef.current);
    setShowWhenLocked(false);
    // Un appel met la sortie audio en mode micro (WebRTC) : sans ce retour,
    // les vidéos de l'app restaient inaudibles après l'appel.
    restorePlaybackAudio();
  }, [localStream]);

  // ── PeerConnection ─────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createPC = useCallback((callId: string, iceServers: any[]) => {
    const pc = new WebRTC.RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    pc.onicecandidate = (event: { candidate: { candidate: string; sdpMid?: string; sdpMLineIndex?: number } | null }) => {
      const c = event.candidate;
      if (!c) return;
      const key = c.candidate ?? '';
      if (!key || iceSentRef.current.has(key)) return;
      iceSentRef.current.add(key);
      void fetch(`${API}/calls/${callId}/ice`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex }),
      });
    };

    pc.ontrack = (event: { streams: unknown[] }) => {
      if (event.streams?.[0]) setRemoteStream(event.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      const state: string = pc.connectionState;
      if (state === 'connected') {
        setCallState('connected');
        setEncrypted(isE2EAvailable());
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      } else if (state === 'failed' || state === 'disconnected') {
        setCallState('ended');
        setTimeout(() => router.back(), 1500);
      }
    };

    return pc;
  }, [h, router]);

  // ── Média local ────────────────────────────────────────────────────────────
  const getLocalMedia = useCallback(async () => {
    const stream = await WebRTC.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video' ? { facingMode: 'user', width: 640, height: 480 } : false,
    });
    setLocalStream(stream);
    return stream;
  }, [callType]);

  // ── Appelant ───────────────────────────────────────────────────────────────
  const initiateCall = useCallback(async () => {
    if (!accessToken || !partnerId || !convId) return;
    try {
      const res = await fetch(`${API}/calls`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ recipientId: partnerId, conversationId: convId, type: callType }),
      });
      if (!res.ok) return;
      const data = await res.json() as { id: string };
      const callId = data.id;
      setCallIdState(callId);

      const [stream, iceServers] = await Promise.all([getLocalMedia(), fetchIceServers(accessToken)]);
      const pc = createPC(callId, iceServers);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));

      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: callType === 'video' });
      await pc.setLocalDescription(offer);
      await fetch(`${API}/calls/${callId}/offer`, {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ sdp: offer.sdp }),
      });
    } catch (e) { console.warn('[Call] initiateCall', e); }
  }, [accessToken, partnerId, convId, callType, h, getLocalMedia, createPC]);

  // ── Appelé ─────────────────────────────────────────────────────────────────
  const setupAsCallee = useCallback(async (callId: string) => {
    if (!accessToken) return;
    try {
      let offerSdp: string | undefined;
      for (let i = 0; i < 20; i++) {
        const res = await fetch(`${API}/calls/${callId}`, { headers: h });
        if (res.ok) {
          const data = await res.json() as { partnerSdp?: string };
          if (data.partnerSdp) { offerSdp = data.partnerSdp; break; }
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!offerSdp) return;

      const [stream, iceServers] = await Promise.all([getLocalMedia(), fetchIceServers(accessToken)]);
      const pc = createPC(callId, iceServers);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new WebRTC.RTCSessionDescription({ type: 'offer', sdp: offerSdp }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await fetch(`${API}/calls/${callId}/accept`, {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ sdp: answer.sdp }),
      });
      setCallState('connected');
      setEncrypted(isE2EAvailable());
    } catch (e) { console.warn('[Call] setupAsCallee', e); }
  }, [accessToken, h, getLocalMedia, createPC]);

  // ── Polling ICE / answer ────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    const callId = callIdState;
    if (!accessToken || !callId || !pcRef.current) return;
    try {
      const res = await fetch(`${API}/calls/${callId}`, { headers: h });
      if (!res.ok) return;
      const data = await res.json() as {
        status: string;
        partnerSdp?: string;
        partnerIce?: { candidate: string; sdpMid?: string; sdpMLineIndex?: number }[];
      };

      if (!isIncoming && data.partnerSdp && !pcRef.current.remoteDescription) {
        await pcRef.current.setRemoteDescription(
          new WebRTC.RTCSessionDescription({ type: 'answer', sdp: data.partnerSdp }),
        );
      }

      for (const c of data.partnerIce ?? []) {
        if (iceRecvRef.current.has(c.candidate)) continue;
        iceRecvRef.current.add(c.candidate);
        try { await pcRef.current.addIceCandidate(new WebRTC.RTCIceCandidate(c)); } catch { /* ignore */ }
      }

      if (data.status === 'ended' || data.status === 'rejected' || data.status === 'missed') {
        setCallState('ended');
        setTimeout(() => router.back(), 1500);
      }
    } catch { /* réseau */ }
  }, [accessToken, callIdState, h, isIncoming, router]);

  // ── Démarrage ──────────────────────────────────────────────────────────────
  useEffect(() => {
    // La sonnerie native s'arrête : l'écran d'appel prend le relais.
    if (isIncoming) dismissIncomingCall(existingCallId);
    if (!isIncoming) {
      // Appel sortant : uniquement depuis le bouton d'une conversation, jamais
      // depuis un lien (cf. lib/outgoing-call.ts).
      if (!consumeOutgoingCall(convId, partnerId)) { router.back(); return; }
      void initiateCall();
    }
    timeoutRef.current = setTimeout(() => {
      setCallState((prev) => {
        if (prev === 'calling' || prev === 'ringing') { void endCall(); return 'ended'; }
        return prev;
      });
    }, 45_000);
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!callIdState) return;
    pollRef.current = setInterval(() => void poll(), 800);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [callIdState, poll]);

  // Décroché sur la sonnerie native : on connecte tout de suite.
  useEffect(() => {
    if (!autoAnswer || autoAnsweredRef.current || !accessToken || !callIdState) return;
    autoAnsweredRef.current = true;
    void acceptCall();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAnswer, accessToken, callIdState]);

  // Raccroché ou micro coupé depuis l'écran d'appel de l'iPhone (CallKit).
  useEffect(() => onNativeCallEvents(callIdState, {
    onEnd: () => { void endCall(); },
    onMute: (muted) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      localStream?.getAudioTracks().forEach((t: any) => { t.enabled = !muted; });
      setIsMuted(muted);
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [callIdState, localStream]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const acceptCall = async () => {
    if (!callIdState) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    await setupAsCallee(callIdState);
    pollRef.current = setInterval(() => void poll(), 800);
  };

  const endCall = async () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setCallState('ended');
    if (accessToken && callIdState) {
      await fetch(`${API}/calls/${callIdState}/end`, { method: 'PATCH', headers: h }).catch(() => {});
    }
    cleanup();
    setTimeout(() => router.back(), 800);
  };

  const declineCall = async () => {
    if (accessToken && callIdState) {
      await fetch(`${API}/calls/${callIdState}/reject`, { method: 'PATCH', headers: h }).catch(() => {});
    }
    cleanup();
    router.back();
  };

  const toggleMute = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    localStream?.getAudioTracks().forEach((t: any) => { t.enabled = isMuted; });
    setIsMuted(!isMuted);
  };

  const toggleVideo = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    localStream?.getVideoTracks().forEach((t: any) => { t.enabled = !videoOn; });
    setVideoOn(!videoOn);
  };

  const statusLabel = () => {
    if (callState === 'calling')   return t('call_status_calling');
    if (callState === 'ringing')   return t('call_status_ringing');
    if (callState === 'connected') return fmtTimer(timer);
    return t('call_status_ended');
  };

  const initials = (partnerName ?? '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const showVideo = callType === 'video' && callState === 'connected';
  const RTCView   = WebRTC.RTCView;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      {/* Fond : espace profond (comme l'Accueil), sauf quand la vidéo
          distante occupe l'écran. Animations arrêtées en fin d'appel. */}
      {!showVideo && <SpaceBackground active={callState !== 'ended'} />}

      {/* Flux vidéo distant plein écran */}
      {showVideo && remoteStream && (
        <RTCView streamURL={remoteStream.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" zOrder={0} />
      )}

      {/* Flux vidéo local (coin) */}
      {showVideo && localStream && videoOn && (
        <RTCView streamURL={localStream.toURL()} style={[styles.localVideo, { top: insets.top + 72 }]} objectFit="cover" zOrder={1} mirror />
      )}

      {/* Badge chiffrement */}
      {encrypted && callState === 'connected' && (
        <View style={styles.encBadge}>
          <Text style={styles.encBadgeTxt}>{t('call_encrypted_badge')}</Text>
        </View>
      )}

      {/* Avatar & infos (mode vocal ou en attente) */}
      {!showVideo && (
        <View style={styles.callerSection}>
          <PulsingAvatar
            photo={partnerPhoto}
            initials={initials}
            pulsing={callState === 'calling' || callState === 'ringing'}
          />
          <Text style={styles.partnerName} numberOfLines={2}>{partnerName ?? t('call_user_fallback')}</Text>
          <View style={[styles.statusPill, callState === 'connected' && styles.statusPillLive]}>
            {callState === 'connected' ? <View style={styles.liveDot} /> : null}
            <Text style={[styles.callStatus, callState === 'connected' && styles.callTimer]}>{statusLabel()}</Text>
          </View>
          {callState === 'calling' && <ActivityIndicator color="rgba(255,255,255,0.6)" size="small" style={{ marginTop: 4 }} />}
        </View>
      )}

      {/* Nom + timer sur vidéo */}
      {showVideo && (
        <View style={[styles.videoTopInfo, { paddingTop: insets.top + 8 }]}>
          <View style={styles.videoInfoPill}>
            <Text style={styles.videoName} numberOfLines={1}>{partnerName}</Text>
            <View style={styles.liveDot} />
            <Text style={[styles.callStatus, styles.callTimer]}>{fmtTimer(timer)}</Text>
          </View>
        </View>
      )}

      {/* Contrôles en cours d'appel */}
      {callState === 'connected' && (
        <View style={styles.controlsDock}>
          <View style={styles.inCallControls}>
            <GlassControl icon={isMuted ? '🔇' : '🎤'} label={isMuted ? t('call_muted') : t('call_mic')} active={!isMuted} onPress={toggleMute} />
            <GlassControl icon={speakerOn ? '🔊' : '🔉'} label={t('call_speaker')} active={speakerOn} onPress={() => setSpeakerOn(!speakerOn)} />
            {callType === 'video' && (
              <GlassControl icon={videoOn ? '📹' : '🚫'} label={videoOn ? t('call_camera') : t('call_camera_off')} active={videoOn} onPress={toggleVideo} />
            )}
            <GlassControl icon="⌨️" label={t('call_keyboard')} active={false} onPress={() => {}} />
          </View>
        </View>
      )}

      {/* Appel entrant */}
      {callState === 'ringing' && (
        <View style={styles.incomingActions}>
          <RoundAction kind="decline" icon="📴" label={t('call_decline')} onPress={declineCall} />
          <RoundAction kind="accept" icon={callType === 'video' ? '📹' : '📞'} label={t('call_accept')} onPress={acceptCall} bounce />
        </View>
      )}

      {/* Raccrocher */}
      {(callState === 'calling' || callState === 'connected') && (
        <View style={styles.endWrap}>
          <RoundAction kind="decline" icon="📴" label={t('call_end')} onPress={endCall} />
        </View>
      )}

      {callState === 'ended' && (
        <View style={styles.endedBadge}>
          <Text style={styles.endedTxt}>{t('call_status_ended')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SPACE_BLACK, alignItems: 'center' },
  localVideo: {
    position: 'absolute', right: 16, width: 104, height: 148, borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.brandSoft, zIndex: 10, overflow: 'hidden',
  },
  videoTopInfo: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 5 },
  videoInfoPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '80%',
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.pill,
    backgroundColor: 'rgba(3,3,10,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
  },
  videoName: { color: '#fff', fontSize: 16, fontWeight: '800', flexShrink: 1 },
  encBadge: {
    marginTop: 12, zIndex: 5, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
  },
  encBadgeTxt: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
  callerSection: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: spacing.lg },
  partnerName: {
    fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: -0.8, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 2 },
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 7, paddingHorizontal: 16, borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  statusPillLive: { borderColor: 'rgba(43,182,115,0.5)' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  callStatus: { fontSize: 15, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },
  callTimer: { color: '#fff', fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  controlsDock: {
    marginBottom: spacing.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderRadius: radius.xl, backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  inCallControls: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.sm },
  incomingActions: { flexDirection: 'row', gap: 96, paddingBottom: spacing.xxl },
  endWrap: { paddingBottom: spacing.xl },
  endedBadge: { paddingBottom: spacing.xxl },
  endedTxt: { fontSize: 16, color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
});
