import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

// Coupe l'appel ffmpeg s'il traîne — un fichier pathologique ne doit jamais
// bloquer indéfiniment la requête d'upload.
const TRANSCODE_TIMEOUT_MS = 90_000;
const THUMBNAIL_TIMEOUT_MS = 15_000;
// Le VPS de prod n'a qu'~1 Go de RAM, partagé avec Postgres/Redis/l'API elle-
// même. Deux transcodages 4K simultanés suffisent à tout faire swaper et
// rendre le serveur entier injoignable (vécu en prod : plusieurs tentatives
// utilisateur empilées → load average 80, API à l'arrêt). Au-delà de cette
// file d'attente, on abandonne le transcodage plutôt que d'accumuler des
// jobs — le buffer original est alors utilisé tel quel.
const MAX_QUEUE_DEPTH = 2;

export interface TranscodeResult {
  video: Buffer;
  /** Frame extraite en JPEG — null si l'extraction échoue (best-effort). */
  thumbnail: Buffer | null;
}

/**
 * Ré-encode une vidéo uploadée vers un format léger et homogène (H.264 max
 * 1280px de large, faststart pour le streaming progressif) — les fichiers
 * importés depuis la galerie (souvent 4K bruts) saturaient le décodeur
 * matériel de nombreux téléphones Android en lecture inline. Extrait aussi
 * une image de couverture (première frame) : sans elle, l'app mobile ne peut
 * pas afficher d'image fixe le temps que le lecteur vidéo s'initialise
 * (Android démonte/remonte son lecteur en scrollant, faute de quoi les
 * décodeurs matériels — très limités — s'épuisent), ce qui donnait un flash
 * noir visible à chaque vidéo sans couverture.
 *
 * **Un seul job à la fois, process-wide** (file d'attente en mémoire
 * ci-dessous) : c'est la vraie contrainte sur ce serveur, pas juste une
 * optimisation. `-threads 1` borne aussi le CPU/RAM pris par ffmpeg lui-même.
 *
 * Best-effort : toute erreur (ffmpeg absent, timeout, fichier corrompu, file
 * d'attente pleine) est avalée par l'appelant, qui doit alors utiliser le
 * buffer original tel quel plutôt que d'échouer l'upload entier.
 */
@Injectable()
export class VideoTranscodeService {
  private readonly logger = new Logger(VideoTranscodeService.name);
  private queue: Promise<unknown> = Promise.resolve();
  private queueDepth = 0;

  async transcode(buffer: Buffer, originalExt: string): Promise<TranscodeResult> {
    if (this.queueDepth >= MAX_QUEUE_DEPTH) {
      throw new Error(`File de transcodage pleine (${this.queueDepth} en attente) — fichier original conservé.`);
    }

    this.queueDepth += 1;
    const run = this.queue.then(() => this.runFfmpeg(buffer, originalExt));
    // La file continue même si ce job échoue — sinon un seul échec la bloque
    // définitivement pour tous les uploads suivants.
    this.queue = run.catch(() => undefined).finally(() => { this.queueDepth -= 1; });
    return run;
  }

  private async runFfmpeg(buffer: Buffer, originalExt: string): Promise<TranscodeResult> {
    const dir = await mkdtemp(join(tmpdir(), 'yumia-video-'));
    const input = join(dir, `in${originalExt || '.mp4'}`);
    const output = join(dir, 'out.mp4');
    const thumbOutput = join(dir, 'thumb.jpg');

    try {
      await writeFile(input, buffer);

      await execFileAsync('ffmpeg', [
        '-y',
        '-i', input,
        // Ne réduit que si plus large que 1280px — ne remonte jamais en
        // qualité une vidéo déjà petite. -2 garde une hauteur paire (requis
        // par libx264). 1280 (pas 1920) : marge RAM serveur, largement
        // suffisant pour un écran de téléphone.
        '-vf', "scale='min(1280,iw)':-2",
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '26',
        // Un seul thread d'encodage : borne le pic RAM/CPU par job sur un
        // serveur à ressources très limitées, plutôt que de laisser x264
        // paralléliser sur tous les cœurs disponibles.
        '-threads', '1',
        '-c:a', 'aac',
        '-b:a', '128k',
        // Déplace l'index moov en tête de fichier : lecture progressive dès
        // les premiers octets reçus, au lieu d'attendre tout le téléchargement.
        '-movflags', '+faststart',
        output,
      ], { timeout: TRANSCODE_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 10 });

      const video = await readFile(output);
      this.logger.log(`Transcodage vidéo : ${buffer.length} → ${video.length} octets`);

      // Best-effort, ne doit jamais faire échouer le transcodage principal —
      // extraction d'une seule frame, très légère (pas de ré-encodage complet).
      let thumbnail: Buffer | null = null;
      try {
        await execFileAsync('ffmpeg', [
          '-y', '-i', output, '-ss', '00:00:00.1', '-vframes', '1', '-q:v', '4', thumbOutput,
        ], { timeout: THUMBNAIL_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 5 });
        thumbnail = await readFile(thumbOutput);
      } catch (err) {
        this.logger.warn(`Extraction de la couverture échouée : ${(err as Error).message}`);
      }

      return { video, thumbnail };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
