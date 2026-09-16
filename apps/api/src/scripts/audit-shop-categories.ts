/**
 * Repère les produits entrés dans un rayon par un mot trop général.
 *
 * Lecture seule — ne modifie rien.
 *
 * Pourquoi ce script : `keywords` est une liste OU. Il suffit qu'un titre
 * contienne un seul mot du rayon pour y entrer, et certains de ces mots
 * (« rangement », « couche », « chambre », « support »…) se retrouvent dans des
 * objets de tous les rayons. Le contrôle manuel du rayon Bébé y a trouvé des
 * couches pour chien et une robe de chambre pour femme ; les autres rayons
 * n'avaient jamais été relus.
 *
 * Relire 5 000 titres à la main n'est pas réaliste. On mesure donc plutôt :
 * un mot-clé est **général** s'il apparaît dans les titres de nombreux rayons
 * différents. « moulinet » ne se trouve qu'en Pêche ; « support » se trouve
 * partout. Un produit dont TOUS les mots-clés reconnus sont généraux n'est
 * rattaché à son rayon par rien de spécifique : c'est lui qu'il faut relire.
 *
 * Le résultat est une liste à relire, pas une liste à supprimer — un mot
 * général peut très bien désigner le bon objet.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/audit-shop-categories.js
 *   node dist/scripts/audit-shop-categories.js --rayon=cuisine
 *   node dist/scripts/audit-shop-categories.js --seuil=8 --exemples=10
 *
 *   --seuil=N     un mot est général s'il apparaît dans au moins N rayons (6)
 *   --exemples=N  titres suspects affichés par rayon (5)
 *   --rayon=slug  n'affiche que ce rayon, avec tous ses titres suspects
 */
import { PrismaClient } from '@prisma/client';
import {
  SHOP_CATEGORIES,
  containsTerm,
  isBanned,
  isExcluded,
  isJunk,
  matchesContext,
  normalize,
} from '../modules/shop/shop-categories';

const prisma = new PrismaClient();

/** Occurrences minimales dans un rayon pour que le mot y « existe » vraiment. */
const MIN_PAR_RAYON = 2;

function option(nom: string, args: string[]): string | null {
  const arg = args.find((a) => a.startsWith(`--${nom}=`));
  return arg ? arg.slice(nom.length + 3) : null;
}

function entier(nom: string, args: string[], defaut: number): number {
  const n = Number.parseInt(option(nom, args) ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : defaut;
}

function tronque(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const seuil = entier('seuil', args, 6);
  const exemples = entier('exemples', args, 5);
  const seulRayon = option('rayon', args);
  const debut = Date.now();

  const produits = await prisma.product.findMany({
    select: { id: true, title: true, category: { select: { slug: true } } },
  });

  // Titres normalisés une seule fois, groupés par rayon.
  const parRayon = new Map<string, { id: string; title: string; norm: string }[]>();
  for (const p of produits) {
    const liste = parRayon.get(p.category.slug) ?? [];
    liste.push({ id: p.id, title: p.title, norm: normalize(p.title) });
    parRayon.set(p.category.slug, liste);
  }

  // ── Étendue de chaque mot-clé : dans combien de rayons apparaît-il ? ──────
  const motsCles = new Set(SHOP_CATEGORIES.flatMap((c) => c.keywords.map(normalize)));
  const etendue = new Map<string, number>();
  for (const mot of motsCles) {
    let rayons = 0;
    for (const titres of parRayon.values()) {
      let vus = 0;
      for (const t of titres) {
        if (containsTerm(t.norm, mot) && ++vus >= MIN_PAR_RAYON) break;
      }
      if (vus >= MIN_PAR_RAYON) rayons += 1;
    }
    etendue.set(mot, rayons);
  }
  const estGeneral = (mot: string) => (etendue.get(normalize(mot)) ?? 0) >= seuil;

  // ── Audit rayon par rayon ─────────────────────────────────────────────────
  type Ligne = { slug: string; nom: string; total: number; faibles: number; horsFiltre: number };
  const bilan: Ligne[] = [];

  for (const seed of SHOP_CATEGORIES) {
    if (seulRayon && seed.slug !== seulRayon) continue;
    const titres = parRayon.get(seed.slug) ?? [];
    if (titres.length === 0) continue;

    const horsFiltre: string[] = [];
    const faibles: { title: string; mots: string[] }[] = [];
    const responsables = new Map<string, number>();

    for (const t of titres) {
      // Ce qui ne passerait plus les filtres actuels : un import plus ancien
      // que le dernier resserrement des critères.
      if (
        isBanned(t.title) ||
        isExcluded(t.title, seed.exclude) ||
        !matchesContext(t.title, seed.requireContext) ||
        isJunk(t.title, seed.keywords)
      ) {
        horsFiltre.push(t.title);
        continue;
      }

      const reconnus = seed.keywords.filter((k) => containsTerm(t.norm, k));
      if (reconnus.length === 0) {
        horsFiltre.push(t.title);
        continue;
      }
      if (reconnus.every(estGeneral)) {
        faibles.push({ title: t.title, mots: reconnus });
        for (const m of reconnus) responsables.set(m, (responsables.get(m) ?? 0) + 1);
      }
    }

    bilan.push({
      slug: seed.slug,
      nom: seed.nameFr,
      total: titres.length,
      faibles: faibles.length,
      horsFiltre: horsFiltre.length,
    });

    if (faibles.length === 0 && horsFiltre.length === 0) continue;

    const pct = Math.round((faibles.length / titres.length) * 100);
    const mots = [...responsables.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([m, n]) => `${m} (${n})`)
      .join(', ');

    console.log(`\n■ ${seed.emoji} ${seed.nameFr} [${seed.slug}] — ${faibles.length}/${titres.length} à relire (${pct} %)`);
    if (horsFiltre.length > 0) console.log(`  ${horsFiltre.length} ne passent plus les filtres actuels`);
    if (mots) console.log(`  entrés par : ${mots}`);

    const limite = seulRayon ? faibles.length : exemples;
    for (const f of faibles.slice(0, limite)) {
      console.log(`   · ${tronque(f.title, seulRayon ? 140 : 95)}`);
    }
    if (!seulRayon && faibles.length > limite) console.log(`   … et ${faibles.length - limite} autre(s)`);
  }

  // ── Synthèse ──────────────────────────────────────────────────────────────
  if (!seulRayon) {
    const total = bilan.reduce((s, l) => s + l.total, 0);
    const faibles = bilan.reduce((s, l) => s + l.faibles, 0);
    const horsFiltre = bilan.reduce((s, l) => s + l.horsFiltre, 0);

    console.log('\n══ Synthèse, du rayon le plus touché au moins touché ══');
    for (const l of [...bilan].sort((a, b) => b.faibles / b.total - a.faibles / a.total)) {
      const pct = Math.round((l.faibles / l.total) * 100);
      console.log(
        `  ${String(pct).padStart(3)} %  ${String(l.faibles).padStart(4)}/${String(l.total).padEnd(4)} ${l.slug}` +
          (l.horsFiltre ? `  (+${l.horsFiltre} hors filtre)` : ''),
      );
    }

    const generaux = [...etendue.entries()]
      .filter(([, n]) => n >= seuil)
      .sort((a, b) => b[1] - a[1])
      .map(([m, n]) => `${m} (${n})`);
    console.log(`\nMots-clés généraux (présents dans ${seuil} rayons ou plus) : ${generaux.length}`);
    console.log(`  ${generaux.join(', ')}`);

    console.log(
      `\n${faibles} produit(s) à relire sur ${total}, ${horsFiltre} hors filtre — ` +
        `${Math.round((Date.now() - debut) / 1000)}s.`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
