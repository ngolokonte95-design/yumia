import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

// Coupe l'appel ffmpeg s'il traîne — un fichier pathologique ne doit jamais
// bloquer indéfiniment la requête d'upload (pas de file d'attente async pour
// l'instant, donc c'est fait en synchrone avec un garde-fou).
const TRANSCODE_TIMEOUT_MS = 90_000;

/**
 * Ré-encode une vidéo uploadée vers un format léger et homogène (H.264 1080p
 * max, faststart pour le streaming progressif) — les fichiers importés depuis
 * la galerie (souvent 4K bruts, jusqu'à plusieurs dizaines de Mo) saturaient
 * le décodeur matériel de certains téléphones Android en lecture inline,
 * causant des saccades sévères (peu ou pas de marge par rapport à iOS pour
 * décoder plusieurs flux 4K en simultané dans un fil défilant).
 *
 * Best-effort : toute erreur (ffmpeg absent, timeout, fichier corrompu) est
 * avalée par l'appelant, qui doit alors utiliser le buffer original tel quel
 * plutôt que d'échouer l'upload entier pour un souci de compression.
 */
@Injectable()
export class VideoTranscodeService {
  private readonly logger = new Logger(VideoTranscodeService.name);

  async transcode(buffer: Buffer, originalExt: string): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'yumia-video-'));
    const input = join(dir, `in${originalExt || '.mp4'}`);
    const output = join(dir, 'out.mp4');

    try {
      await writeFile(input, buffer);

      await execFileAsync('ffmpeg', [
        '-y',
        '-i', input,
        // Ne réduit que si plus large que 1920px — ne remonte jamais en
        // qualité une vidéo déjà petite. -2 garde une hauteur paire (requis
        // par libx264).
        '-vf', "scale='min(1920,iw)':-2",
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '25',
        '-c:a', 'aac',
        '-b:a', '128k',
        // Déplace l'index moov en tête de fichier : lecture progressive dès
        // les premiers octets reçus, au lieu d'attendre tout le téléchargement.
        '-movflags', '+faststart',
        output,
      ], { timeout: TRANSCODE_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 10 });

      const result = await readFile(output);
      this.logger.log(`Transcodage vidéo : ${buffer.length} → ${result.length} octets`);
      return result;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
