import { STRIP_METADATA_ARGS, reencodeArgs, remuxArgs, thumbnailArgs } from '../video-transcode.service';

/** Valeur qui suit `flag` dans la liste d'arguments. */
function valueOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

describe('arguments ffmpeg des vidéos', () => {
  const cases = [
    ['remux', remuxArgs('in.mov', 'out.mp4')],
    ['ré-encodage', reencodeArgs('in.mov', 'out.mp4')],
    ['miniature', thumbnailArgs('in.mov', 'out.jpg')],
  ] as const;

  it.each(cases)('%s : retire métadonnées globales, de flux, chapitres et pistes de données', (_name, args) => {
    expect(valueOf([...args], '-map_metadata')).toBe('-1');
    expect(valueOf([...args], '-map_metadata:s:v')).toBe('-1');
    expect(valueOf([...args], '-map_metadata:s:a')).toBe('-1');
    expect(valueOf([...args], '-map_chapters')).toBe('-1');
    expect(args).toContain('-dn');
  });

  it.each(cases)("%s : options de sortie après l'entrée, fichier de sortie en dernier", (_name, args) => {
    const input = args.indexOf('-i');
    expect(input).toBeGreaterThan(-1);
    for (const opt of STRIP_METADATA_ARGS.filter((a) => a.startsWith('-'))) {
      expect(args.indexOf(opt)).toBeGreaterThan(input + 1);
    }
    expect(args[args.length - 1]).toMatch(/^out\./);
  });

  it('remux : reste sans ré-encodage et garde +faststart', () => {
    const args = remuxArgs('in.mov', 'out.mp4');
    expect(valueOf(args, '-c')).toBe('copy');
    expect(valueOf(args, '-movflags')).toBe('+faststart');
  });

  it('ré-encodage : garde +faststart et le downscale 1280px', () => {
    const args = reencodeArgs('in.mov', 'out.mp4');
    expect(valueOf(args, '-movflags')).toBe('+faststart');
    expect(valueOf(args, '-vf')).toBe("scale='min(1280,iw)':-2");
  });
});
