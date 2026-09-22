/**
 * Repère les produits qu'aucun mot spécifique ne rattache à leur rayon.
 *
 * Lecture seule — ne modifie rien.
 *
 * Pourquoi ce script : `keywords` est une liste OU. Il suffit qu'un titre
 * contienne un seul mot du rayon pour y entrer, et certains de ces mots
 * (« rangement », « couche », « chambre », « rouleau »…) désignent des objets
 * de tous les rayons. Le contrôle manuel du rayon Bébé y a trouvé des couches
 * pour chien et une robe de chambre pour femme.
 *
 * Mesure retenue — la spécificité d'un mot pour un rayon : parmi tous les
 * titres du catalogue qui contiennent ce mot, quelle part se trouve dans ce
 * rayon ? « moulinet » est à 100 % en Pêche ; « rouleau » est dispersé entre
 * pâtisserie, peinture, sport et bricolage. Un produit est à relire quand même
 * son mot le plus spécifique l'est peu.
 *
 * Une première version comptait plutôt dans COMBIEN de rayons un mot
 * apparaît. Elle signalait 1 704 produits, en majorité légitimes : les
 * vendeurs glissent « voyage », « randonnée » ou « camping » dans des titres de
 * tous les rayons, si bien que le mot central de chaque rayon passait pour
 * général — et les bâtons de randonnée étaient « à relire ». La part relative
 * ne tombe pas dans ce piège : le rayon Randonnée garde la majorité des titres
 * qui disent « randonnée ».
 *
 * Le résultat reste une liste à relire, pas à supprimer.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/audit-shop-categories.js
 *   node dist/scripts/audit-shop-categories.js --rayon=cuisine
 *   node dist/scripts/audit-shop-categories.js --specificite=20 --exemples=8
 *
 *   --specificite=N  seuil en %, sous lequel un produit est à relire (25)
 *   --exemples=N     titres affichés par rayon (6)
 *   --rayon=slug     n'affiche que ce rayon, avec tous ses titres à relire
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
  const seuil = entier('specificite', args, 25) / 100;
  const exemples = entier('exemples', args, 6);
  const seulRayon = option('rayon', args);
  const debut = Date.now();

  // Les archivés ne sont plus au catalogue : les compter gonflait les totaux
  // et faisait réapparaître, en « hors filtre », ceux que la purge venait de
  // sortir.
  const produits = await prisma.product.findMany({
    where: { status: { not: 'archived' } },
    select: { title: true, category: { select: { slug: true } } },
  });

  const parRayon = new Map<string, { title: string; norm: string }[]>();
  for (const p of produits) {
    const liste = parRayon.get(p.category.slug) ?? [];
    liste.push({ title: p.title, norm: normalize(p.title) });
    parRayon.set(p.category.slug, liste);
  }

  // ── Occurrences de chaque mot-clé, rayon par rayon ────────────────────────
  const motsCles = new Set(SHOP_CATEGORIES.flatMap((c) => c.keywords.map(normalize)));
  const occurrences = new Map<string, Map<string, number>>();
  const totaux = new Map<string, number>();
  for (const mot of motsCles) {
    const parSlug = new Map<string, number>();
    let total = 0;
    for (const [slug, titres] of parRayon) {
      let n = 0;
      for (const t of titres) if (containsTerm(t.norm, mot)) n += 1;
      if (n > 0) parSlug.set(slug, n);
      total += n;
    }
    occurrences.set(mot, parSlug);
    totaux.set(mot, total);
  }

  /** Part des titres contenant `mot` qui se trouvent dans `slug`. */
  const specificite = (mot: string, slug: string): number => {
    const m = normalize(mot);
    const total = totaux.get(m) ?? 0;
    return total === 0 ? 0 : (occurrences.get(m)?.get(slug) ?? 0) / total;
  };

  // ── Audit rayon par rayon ─────────────────────────────────────────────────
  type Ligne = { slug: string; total: number; aRelire: number; horsFiltre: number };
  const bilan: Ligne[] = [];

  for (const seed of SHOP_CATEGORIES) {
    if (seulRayon && seed.slug !== seulRayon) continue;
    const titres = parRayon.get(seed.slug) ?? [];
    if (titres.length === 0) continue;

    let horsFiltre = 0;
    const aRelire: { title: string; meilleur: string; part: number }[] = [];
    const responsables = new Map<string, number>();

    for (const t of titres) {
      const reconnus = seed.keywords.filter((k) => containsTerm(t.norm, k));
      if (
        reconnus.length === 0 ||
        isBanned(t.title) ||
        isExcluded(t.title, seed.exclude) ||
        !matchesContext(t.title, seed.requireContext) ||
        isJunk(t.title, seed.keywords)
      ) {
        horsFiltre += 1;
        continue;
      }

      let meilleur = reconnus[0];
      let part = specificite(meilleur, seed.slug);
      for (const k of reconnus.slice(1)) {
        const s = specificite(k, seed.slug);
        if (s > part) { meilleur = k; part = s; }
      }
      if (part < seuil) {
        aRelire.push({ title: t.title, meilleur, part });
        responsables.set(meilleur, (responsables.get(meilleur) ?? 0) + 1);
      }
    }

    bilan.push({ slug: seed.slug, total: titres.length, aRelire: aRelire.length, horsFiltre });
    if (aRelire.length === 0 && horsFiltre === 0) continue;

    const pct = Math.round((aRelire.length / titres.length) * 100);
    const mots = [...responsables.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([m, n]) => `${m} ${Math.round(specificite(m, seed.slug) * 100)} % (${n})`)
      .join(', ');

    console.log(`\n■ ${seed.emoji} ${seed.nameFr} [${seed.slug}] — ${aRelire.length}/${titres.length} à relire (${pct} %)`);
    if (horsFiltre > 0) console.log(`  ${horsFiltre} ne passent plus les filtres actuels`);
    if (mots) console.log(`  meilleur mot, et sa part dans ce rayon : ${mots}`);

    // Les moins rattachés d'abord : ce sont les plus probablement hors sujet.
    aRelire.sort((a, b) => a.part - b.part);
    const limite = seulRayon ? aRelire.length : exemples;
    for (const r of aRelire.slice(0, limite)) {
      console.log(`   · ${tronque(r.title, seulRayon ? 140 : 95)}`);
    }
    if (!seulRayon && aRelire.length > limite) console.log(`   … et ${aRelire.length - limite} autre(s)`);
  }

  if (!seulRayon) {
    const total = bilan.reduce((s, l) => s + l.total, 0);
    const aRelire = bilan.reduce((s, l) => s + l.aRelire, 0);
    const horsFiltre = bilan.reduce((s, l) => s + l.horsFiltre, 0);

    console.log(`\n══ Synthèse (spécificité < ${Math.round(seuil * 100)} %) ══`);
    for (const l of [...bilan].sort((a, b) => b.aRelire / b.total - a.aRelire / a.total)) {
      const pct = Math.round((l.aRelire / l.total) * 100);
      console.log(
        `  ${String(pct).padStart(3)} %  ${String(l.aRelire).padStart(4)}/${String(l.total).padEnd(4)} ${l.slug}` +
          (l.horsFiltre ? `  (+${l.horsFiltre} hors filtre)` : ''),
      );
    }
    console.log(
      `\n${aRelire} produit(s) à relire sur ${total}, ${horsFiltre} hors filtre — ` +
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
