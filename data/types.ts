export type Product = {
  sku: string;
  name: string;
  description: string;
  brand: string;
  category: string;
  images: string[];
  inStock: boolean;
  retailPrice: number;
  partnerPrice: number;
};

export type CartItem = {
  product: Product;
  quantity: number;
};

export type ProductCatalog = {
  products: Product[];
  brands: string[];
  categories: string[];
};

/** Romanian display names for category slugs */
export const CATEGORY_LABELS: Record<string, string> = {
  clippers: 'Masini de tuns',
  trimmers: 'Contur',
  wax: 'Ceara',
  combs: 'Piepteni',
  aftershave: 'After shave',
  scissors: 'Foarfece',
  dye: 'Vopsea',
  chairs: 'Scaune',
  shampoo: 'Sampon',
  dryers: 'Uscatoare',
  gel: 'Gel',
  powder: 'Pudra',
  brushes: 'Perii',
  blades: 'Lame',
  razors: 'Aparate ras',
  furniture: 'Mobilier',
  cream: 'Crema',
  spray: 'Spray/Fixativ',
  fragrance: 'Parfumuri',
  accessories: 'Accesorii',
  hygiene: 'Igiena',
  shaving: 'Ras',
  grooming: 'Ingrijire',
  'styling-tools': 'Styling',
  care: 'Tratamente',
  promo: 'Promotii',
  altele: 'Altele',
};
