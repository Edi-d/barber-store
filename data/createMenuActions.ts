import { type ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface CreateMenuAction {
  id: string;
  label: string;
  icon: IoniconName;
  route: string;
  colorKey: string;
  requiresAuth: boolean;
}

export const CLIENT_ACTIONS: CreateMenuAction[] = [
  {
    id: 'book',
    label: 'Programează-te',
    icon: 'calendar',
    // Lands on the Programări (discover) tab with its draggable pull-tab
    // sheet expanded to the "Toate saloanele" view (greeting, "Cine e liber
    // acum?", salon list) — instead of dropping straight into
    // /book-appointment with no salonId (which used to trigger a flat,
    // cross-salon, no-distance barber list fallback). See the `expandSheet`
    // query-param effect in app/(tabs)/discover.tsx.
    route: '/(tabs)/discover?expandSheet=1',
    colorKey: 'booking',
    requiresAuth: true,
  },
  {
    id: 'tryon',
    label: 'Frizură AI',
    icon: 'sparkles',
    route: '/tryon',
    colorKey: 'tryon',
    requiresAuth: false,
  },
  {
    id: 'appointments',
    label: 'Programările mele',
    icon: 'time',
    route: '/appointments',
    colorKey: 'today',
    requiresAuth: true,
  },
  // Shop temporarily hidden — re-add this action to restore the marketplace entry point.
  // {
  //   id: 'shop',
  //   label: 'Explorează produse',
  //   icon: 'storefront-outline',
  //   route: '/(tabs)/shop',
  //   colorKey: 'shop',
  //   requiresAuth: false,
  // },
];
