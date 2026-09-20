import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

// Le remux ne fait que réempaqueter les flux (aucun ré-encodage) : quelques
// secondes même sur un gros fichier.
const REMUX_TIMEOUT_MS = 30_000;
const THUMBNAIL_TIMEOUT_MS = 15_000;
// Le ré-encodage tourne hors requête : il peut être plus généreux.
const REENCODE_TIMEOUT_MS = 240_000;
// Le VPS de prod n'a qu'~1 Go de RAM, partagé avec Postgres/Redis/l'API elle-
// même. Plusieurs ré-encodages 4K simultanés suffisent à tout faire swaper et
// rendre le serveur injoignable (vécu en prod : load average 80, API à
// l'arrêt). Au-delà de cette file, on abandonne le ré-encodage — la vidéo
// remuxée reste parfaitement lisible.
const MAX_QUEUE_DEPTH = 2;
// Au-delà de ce débit, la vidéo est ré-encodée même si sa résolution et son
// codec sont déjà bons. Mesuré en prod : des 720p iPhone à 5,2 Mbit/s, servies
// telles quelles — le lecteur iOS démarrait sur les premiers octets, vidait
// son tampon et marquait un arrêt d'une fraction de seconde à chaque reel.
// Instagram sert la même résolution entre 2 et 3 Mbit/s.
const MAX_BITRATE_BPS = 3_000_000;

export interface PreparedVideo {
  /** MP4 remuxé avec faststart, prêt à servir (ou l'original si le remux échoue). */
  video: Buffer;
  /** Frame extraite en JPEG — null si l'extraction échoue (best-effort). */
  thumbnail: Buffer | null;
  /** true si un ré-encodage complet (downscale / changement de codec) reste utile. */
  needsReencode: boolean;
}

/**
 * Préparation des vidéos uploadées, en deux temps pour ne pas faire attendre
 * l'utilisateur pendant la publication :
 *
 * 1. {@link prepare} — **synchrone, quelques secondes** : remux en MP4 avec
 *    `+faststart` (l'index passe en tête du fichier → lecture progressive dès
 *    les premiers octets, au lieu d'attendre tout le téléchargement) et
 *    extraction de la miniature de couverture. Aucun ré-encodage : on ne fait
 *    que réempaqueter les flux existants.
 * 2. {@link reencodeInBackground} — **asynchrone, hors requête** : downscale
 *    en H.264 1280px max pour les sources lourdes (4K brut de galerie), qui
 *    saturaient le décodeur matériel des téléphones Android en lecture inline.
 *    Le fichier servi est remplacé une fois le job terminé.
 *
 * Best-effort de bout en bout : toute erreur (ffmpeg absent, timeout, fichier
 * atypique) laisse la vidéo précédente en place plutôt que d'échouer la
 * publication.
 */
@Injectable()
export class VideoTranscodeService {
  private readonly logger = new Logger(VideoTranscodeService.name);
  private queue: Promise<unknown> = Promise.resolve();
  private queueDepth = 0;

  async prepare(buffer: Buffer, originalExt: string): Promise<PreparedVideo> {
    const dir = await mkdtemp(join(tmpdir(), 'yumia-video-'));
    const input = join(dir, `in${originalExt || '.mp4'}`);
    const remuxed = join(dir, 'remux.mp4');
    const thumbOutput = join(dir, 'thumb.jpg');

    try {
      await writeFile(input, buffer);

      let video = buffer;
      try {
        // `-c copy` : aucun ré-encodage, on ne fait que déplacer les flux dans
        // un conteneur MP4 avec l'index en tête. Indispensable pour la lecture
        // progressive côté mobile — sans ça le lecteur doit d'abord télécharger
        // le fichier entier (saccades marquées sur Android).
        await execFileAsync('ffmpeg', [
          '-y', '-i', input, '-c', 'copy', '-movflags', '+faststart', remuxed,
        ], { timeout: REMUX_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 10 });
        video = await readFile(remuxed);
        this.logger.log(`Remux vidéo (faststart) : ${buffer.length} → ${video.length} octets`);
      } catch (err) {
        this.logger.warn(`Remux échoué, fichier original conservé : ${(err as Error).message}`);
      }

      let thumbnail: Buffer | null = null;
      try {
        await execFileAsync('ffmpeg', [
          '-y', '-i', input, '-ss', '00:00:00.1', '-vframes', '1', '-q:v', '4', thumbOutput,
        ], { timeout: THUMBNAIL_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 5 });
        thumbnail = await readFile(thumbOutput);
      } catch (err) {
        this.logger.warn(`Extraction de la couverture échouée : ${(err as Error).message}`);
      }

      return { video, thumbnail, needsReencode: await this.probeNeedsReencode(input) };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * Lance le ré-encodage hors requête et publie le résultat via `publish`.
   * Ne rejette jamais : un échec laisse simplement la version remuxée en place.
   */
  reencodeInBackground(
    buffer: Buffer,
    originalExt: string,
    publish: (video: Buffer) => Promise<unknown>,
  ): void {
    if (this.queueDepth >= MAX_QUEUE_DEPTH) {
      this.logger.warn(`File de ré-encodage pleine (${this.queueDepth}) — version remuxée conservée.`);
      return;
    }

    this.queueDepth += 1;
    const run = this.queue
      .then(() => this.runReencode(buffer, originalExt))
      .then((video) => publish(video))
      .then(() => { this.logger.log('Ré-encodage terminé, fichier remplacé.'); })
      .catch((err: Error) => { this.logger.warn(`Ré-encodage abandonné : ${err.message}`); });

    // La file continue même après un échec — sinon un seul raté la bloquerait
    // définitivement pour tous les uploads suivants.
    this.queue = run.finally(() => { this.queueDepth -= 1; });
  }

  private async runReencode(buffer: Buffer, originalExt: string): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'yumia-reencode-'));
    const input = join(dir, `in${originalExt || '.mp4'}`);
    const output = join(dir, 'out.mp4');

    try {
      await writeFile(input, buffer);
      await execFileAsync('ffmpeg', [
        '-y',
        '-i', input,
        // Ne réduit que si plus large que 1280px — ne remonte jamais en
        // qualité une vidéo déjà petite. -2 garde une hauteur paire (requis
        // par libx264). 30 i/s : les 60 i/s d'un iPhone doublent le travail
        // du décodeur sans rien apporter à un reel.
        '-vf', "scale='min(1280,iw)':-2,fps=30",
        '-c:v', 'libx264',
        // veryfast plutôt qu'ultrafast : à débit plafonné, c'est la qualité
        // par bit qui compte, et ultrafast la gaspille. Coût : ~2× plus lent,
        // en tâche de fond et sur un seul thread — acceptable.
        '-preset', 'veryfast',
        '-crf', '25',
        // Plafond de débit : c'est LUI qui supprime l'arrêt au démarrage. Le
        // CRF fixe la qualité visée, maxrate/bufsize l'empêchent de déborder.
        '-maxrate', '2500k',
        '-bufsize', '5000k',
        // Image-clé toutes les 2 s : démarrage et déplacement dans la barre
        // de progression ne cherchent plus une clé loin en arrière.
        '-g', '60',
        '-keyint_min', '60',
        '-pix_fmt', 'yuv420p',
        // Un seul thread : borne le pic RAM/CPU par job, plutôt que de laisser
        // x264 paralléliser sur tous les cœurs d'un serveur déjà à l'étroit.
        '-threads', '1',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        output,
      ], { timeout: REENCODE_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 10 });

      const video = await readFile(output);
      this.logger.log(`Ré-encodage : ${buffer.length} → ${video.length} octets`);
      return video;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * true si la source dépasse 1280px de large, n'est pas en H.264, ou dépasse
   * {@link MAX_BITRATE_BPS}. Ce dernier critère manquait : une 720p H.264 à
   * 5 Mbit/s passait sans ré-encodage et saccadait au démarrage.
   */
  private async probeNeedsReencode(input: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        // Le débit est demandé sur le flux ET sur le conteneur : certains
        // fichiers ne le renseignent qu'à un seul des deux niveaux.
        '-show_entries', 'stream=width,codec_name,bit_rate:format=bit_rate',
        '-of', 'default=nw=1',
        input,
      ], { timeout: 10_000 });
      const kv: Record<string, string> = {};
      for (const line of stdout.split('\n')) {
        const i = line.indexOf('=');
        if (i <= 0) continue;
        const key = line.slice(0, i).trim();
        const value = line.slice(i + 1).trim();
        // Le flux est listé avant le conteneur : sa valeur gagne, sauf si
        // elle est absente (N/A).
        if (!(key in kv) || kv[key] === 'N/A') kv[key] = value;
      }
      const width = parseInt(kv.width ?? '', 10);
      const codec = kv.codec_name;
      const bitrate = parseInt(kv.bit_rate ?? '', 10);
      if (!Number.isFinite(width) || !codec) return true; // sondage ambigu → prudence
      if (width > 1280) return true;
      if (codec !== 'h264') return true;
      if (Number.isFinite(bitrate) && bitrate > MAX_BITRATE_BPS) {
        this.logger.log(`Débit ${Math.round(bitrate / 1000)} kbit/s > ${MAX_BITRATE_BPS / 1000} : ré-encodage`);
        return true;
      }
      return false;
    } catch {
      return true; // ffprobe indisponible → on ré-encode par sécurité
    }
  }
}
