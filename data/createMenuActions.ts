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
    route: '/book-appointment',
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
  {
    id: 'shop',
    label: 'Explorează produse',
    icon: 'storefront-outline',
    route: '/(tabs)/shop',
    colorKey: 'shop',
    requiresAuth: false,
  },
];
