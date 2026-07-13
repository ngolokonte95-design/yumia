/**
 * Écran d'appel voix/vidéo — WebRTC réel (react-native-webrtc).
 * Import lazy : ne crashe pas dans Expo Go, affiche un écran d'info à la place.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import { isE2EAvailable } from '../lib/e2e-crypto';

// Import lazy — react-native-webrtc nécessite un build natif (pas Expo Go)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let WebRTC: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebRTC = require('react-native-webrtc');
} catch { /* Expo Go — module natif absent */ }

const API = API_BASE_URL;
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

type CallState = 'calling' | 'ringing' | 'connected' | 'ended';
type CallType  = 'voice' | 'video';

function fmtTimer(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ── Écran affiché dans Expo Go (pas de build natif) ──────────────────────────
function NoWebRTCScreen({ onBack }: { onBack: () => void }) {
  return (
    <View style={noStyles.container}>
      <Text style={noStyles.icon}>📞</Text>
      <Text style={noStyles.title}>Appels non disponibles</Text>
      <Text style={noStyles.body}>
        Les appels voix/vidéo nécessitent un build natif de l'application.{'\n\n'}
        Cette fonctionnalité sera active dès que tu auras ton compte Apple Developer et que le build sera installé sur ton iPhone.
      </Text>
      <Pressable style={noStyles.btn} onPress={onBack}>
        <Text style={noStyles.btnTxt}>← Retour</Text>
      </Pressable>
    </View>
  );
}

const noStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D14', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 },
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
    type: callTypeParam, incoming, callId: existingCallId,
  } = useLocalSearchParams<{
    convId?: string; partnerId?: string; partnerName?: string; partnerPhoto?: string;
    type?: string; incoming?: string; callId?: string;
  }>();

  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const callType: CallType  = callTypeParam === 'video' ? 'video' : 'voice';
  const isIncoming           = incoming === 'true';

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

  // ── Nettoyage ──────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (pollRef.current)    clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (timerRef.current)   clearInterval(timerRef.current);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    localStream?.getTracks().forEach((t: any) => t.stop());
    pcRef.current?.close();
    pcRef.current = null;
  }, [localStream]);

  // ── PeerConnection ─────────────────────────────────────────────────────────
  const createPC = useCallback((callId: string) => {
    const pc = new WebRTC.RTCPeerConnection({ iceServers: ICE_SERVERS });
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

      const stream = await getLocalMedia();
      const pc = createPC(callId);
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

      const stream = await getLocalMedia();
      const pc = createPC(callId);
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
    if (!isIncoming) void initiateCall();
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
    if (callState === 'calling')   return 'Appel en cours...';
    if (callState === 'ringing')   return 'Appel entrant';
    if (callState === 'connected') return fmtTimer(timer);
    return 'Appel terminé';
  };

  const initials = (partnerName ?? '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const showVideo = callType === 'video' && callState === 'connected';
  const RTCView   = WebRTC.RTCView;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      {/* Flux vidéo distant plein écran */}
      {showVideo && remoteStream && (
        <RTCView streamURL={remoteStream.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" zOrder={0} />
      )}

      {/* Flux vidéo local (coin) */}
      {showVideo && localStream && videoOn && (
        <RTCView streamURL={localStream.toURL()} style={styles.localVideo} objectFit="cover" zOrder={1} mirror />
      )}

      {/* Badge chiffrement */}
      {encrypted && callState === 'connected' && (
        <View style={styles.encBadge}>
          <Text style={styles.encBadgeTxt}>🔐 Appel chiffré de bout en bout</Text>
        </View>
      )}

      {/* Avatar & infos (mode vocal ou en attente) */}
      {!showVideo && (
        <View style={styles.callerSection}>
          {partnerPhoto ? (
            <Image source={{ uri: partnerPhoto }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          {(callState === 'calling' || callState === 'ringing') && <View style={styles.avatarRing} />}
          <Text style={styles.partnerName}>{partnerName ?? 'Utilisateur'}</Text>
          <Text style={styles.callStatus}>{statusLabel()}</Text>
          {callState === 'calling' && <ActivityIndicator color="rgba(255,255,255,0.6)" size="small" style={{ marginTop: 8 }} />}
        </View>
      )}

      {/* Nom + timer sur vidéo */}
      {showVideo && (
        <View style={[styles.videoTopInfo, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.partnerName}>{partnerName}</Text>
          <Text style={styles.callStatus}>{fmtTimer(timer)}</Text>
        </View>
      )}

      {/* Contrôles en cours d'appel */}
      {callState === 'connected' && (
        <View style={styles.inCallControls}>
          <CallControl icon={isMuted ? '🔇' : '🎤'} label={isMuted ? 'Muet' : 'Micro'} active={!isMuted} onPress={toggleMute} />
          <CallControl icon={speakerOn ? '🔊' : '🔉'} label="Haut-parleur" active={speakerOn} onPress={() => setSpeakerOn(!speakerOn)} />
          {callType === 'video' && (
            <CallControl icon={videoOn ? '📹' : '🚫'} label={videoOn ? 'Caméra' : 'Cam off'} active={videoOn} onPress={toggleVideo} />
          )}
          <CallControl icon="⌨️" label="Clavier" active={false} onPress={() => {}} />
        </View>
      )}

      {/* Appel entrant */}
      {callState === 'ringing' && (
        <View style={styles.incomingActions}>
          <Pressable style={styles.declineBtn} onPress={declineCall}>
            <Text style={styles.callBtnIcon}>📴</Text>
            <Text style={styles.callBtnLabel}>Refuser</Text>
          </Pressable>
          <Pressable style={styles.acceptBtn} onPress={acceptCall}>
            <Text style={styles.callBtnIcon}>{callType === 'video' ? '📹' : '📞'}</Text>
            <Text style={styles.callBtnLabel}>Accepter</Text>
          </Pressable>
        </View>
      )}

      {/* Raccrocher */}
      {(callState === 'calling' || callState === 'connected') && (
        <Pressable style={styles.endBtn} onPress={endCall}>
          <Text style={styles.endBtnIcon}>📴</Text>
          <Text style={styles.endBtnLabel}>Terminer</Text>
        </Pressable>
      )}

      {callState === 'ended' && (
        <View style={styles.endedBadge}>
          <Text style={styles.endedTxt}>Appel terminé</Text>
        </View>
      )}
    </View>
  );
}

function CallControl({ icon, label, active, onPress }: { icon: string; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.control} onPress={onPress}>
      <View style={[styles.controlCircle, active && styles.controlCircleActive]}>
        <Text style={styles.controlIcon}>{icon}</Text>
      </View>
      <Text style={styles.controlLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D14', alignItems: 'center' },
  localVideo: { position: 'absolute', top: 80, right: 16, width: 100, height: 140, borderRadius: radius.lg, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', zIndex: 10 },
  videoTopInfo: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', gap: 4, zIndex: 5 },
  encBadge: { marginTop: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 6, zIndex: 5 },
  encBadgeTxt: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },
  callerSection: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  avatar: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)' },
  avatarFallback: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 42, fontWeight: '800', color: '#fff' },
  avatarRing: { position: 'absolute', width: 148, height: 148, borderRadius: 74, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
  partnerName: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  callStatus: { fontSize: 16, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  inCallControls: { flexDirection: 'row', gap: spacing.xl, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  control: { alignItems: 'center', gap: 8, minWidth: 64 },
  controlCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  controlCircleActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  controlIcon: { fontSize: 26 },
  controlLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600', textAlign: 'center' },
  incomingActions: { flexDirection: 'row', gap: spacing.xxl, paddingBottom: spacing.xxl },
  declineBtn: { alignItems: 'center', gap: 10 },
  acceptBtn: { alignItems: 'center', gap: 10 },
  callBtnIcon: { fontSize: 32 },
  callBtnLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  endBtn: { alignItems: 'center', gap: 8, paddingBottom: spacing.xl },
  endBtnIcon: { fontSize: 38, backgroundColor: '#E5484D', borderRadius: 40, width: 76, height: 76, textAlign: 'center', lineHeight: 76 },
  endBtnLabel: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  endedBadge: { paddingBottom: spacing.xxl },
  endedTxt: { fontSize: 16, color: 'rgba(255,255,255,0.5)' },
});
