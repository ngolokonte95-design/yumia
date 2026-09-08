/** Rayon de la boutique — réutilise la grille commune (filtres, tri, pagination). */
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../lib/auth-context';
import { shopApi, type ShopCategory } from '../../../lib/shop-api';
import { ProductGridScreen } from '../../../components/shop/ProductGridScreen';

export default function ShopCategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { accessToken } = useAuth();
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  // Sous-rayon sélectionné. `null` = « Tout », qui interroge le rayon parent
  // et remonte donc les produits de tous ses enfants.
  const [subSlug, setSubSlug] = useState<string | null>(null);

  // Le nom lisible du rayon n'est pas dans l'URL : on le récupère pour
  // l'en-tête, en gardant un titre neutre tant qu'il n'est pas connu.
  useEffect(() => {
    if (!accessToken) return;
    shopApi.categories(accessToken).then(setCategories).catch(() => {});
  }, [accessToken]);

  // Un changement de rayon doit repartir sur « Tout » : garder l'onglet
  // précédent afficherait un sous-rayon qui n'appartient plus à ce rayon.
  useEffect(() => setSubSlug(null), [slug]);

  const current = categories.find((c) => c.slug === slug);
  const title = current ? `${current.emoji} ${current.nameFr}` : 'Rayon';

  const tabs = useMemo(() => {
    const children = categories
      .filter((c) => c.parentSlug === slug)
      .sort((a, b) => a.nameFr.localeCompare(b.nameFr));
    if (children.length === 0) return undefined;
    return [
      { key: '', label: 'Tout' },
      ...children.map((c) => ({ key: c.slug, label: `${c.emoji} ${c.nameFr}` })),
    ];
  }, [categories, slug]);

  return (
    <ProductGridScreen
      title={title}
      baseQuery={{ category: subSlug ?? slug }}
      tabs={tabs}
      activeTab={subSlug ?? ''}
      onTabChange={(key) => setSubSlug(key || null)}
    />
  );
}
