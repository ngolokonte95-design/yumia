/** Rayon de la boutique — réutilise la grille commune (filtres, tri, pagination). */
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../lib/auth-context';
import { shopApi, type ShopCategory } from '../../../lib/shop-api';
import { ProductGridScreen } from '../../../components/shop/ProductGridScreen';
import { useI18n } from '../../../lib/useI18n';
import { shopCategoryName } from '../../../lib/shop-category-name';

export default function ShopCategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { accessToken } = useAuth();
  const { t } = useI18n();
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
  const title = current ? `${current.emoji} ${shopCategoryName(t, current.slug, current.nameFr)}` : t('shop_cat_fallback_title');

  const tabs = useMemo(() => {
    const children = categories
      .filter((c) => c.parentSlug === slug)
      .sort((a, b) => shopCategoryName(t, a.slug, a.nameFr).localeCompare(shopCategoryName(t, b.slug, b.nameFr)));
    if (children.length === 0) return undefined;
    return [
      { key: '', label: t('shop_cat_all') },
      ...children.map((c) => ({ key: c.slug, label: `${c.emoji} ${shopCategoryName(t, c.slug, c.nameFr)}` })),
    ];
  }, [categories, slug, t]);

  return (
    <ProductGridScreen
      title={title}
      searchScopeLabel={current ? shopCategoryName(t, current.slug, current.nameFr) : t('shop_cat_this_category')}
      baseQuery={{ category: subSlug ?? slug }}
      tabs={tabs}
      activeTab={subSlug ?? ''}
      onTabChange={(key) => setSubSlug(key || null)}
    />
  );
}
