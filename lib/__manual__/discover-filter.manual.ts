// lib/__manual__/discover-filter.manual.ts
// Run with: npx tsx lib/__manual__/discover-filter.manual.ts
import { applyFilters, type FilterContext } from '@/lib/discover-filter';
import { DEFAULT_FILTERS } from '@/types/filters';
import type { SalonWithDistance } from '@/lib/discover';
import type { BarberService } from '@/types/database';

// ─── Fixture builder ─────────────────────────────────────────────────────────

function makeSalon(over: Partial<SalonWithDistance>): SalonWithDistance {
  return {
    id: 's1',
    owner_id: null,
    name: 'Salon',
    address: null,
    city: null,
    phone: null,
    avatar_url: null,
    cover_url: null,
    bio: null,
    specialties: null,
    latitude: null,
    longitude: null,
    rating_avg: 4.0,
    reviews_count: 10,
    avg_price_cents: 5000,
    is_promoted: false,
    amenities: null,
    salon_type: 'barbershop',
    salon_types: ['barbershop'],
    active: true,
    created_at: new Date().toISOString(),
    // SalonWithDistance extras
    distance_km: 2,
    travel_time_min: null,
    is_favorite: false,
    has_happy_hour: false,
    happy_hour_discount: null,
    happy_hour_ends_at: null,
    is_available_now: false,
    is_open_now: false,
    extended_open_now: false,
    price_range_label: null,
    ...over,
  };
}

function makeCtx(over: Partial<FilterContext> = {}): FilterContext {
  return {
    servicesBySalonId: new Map(),
    scheduleDaysBySalonId: new Map(),
    now: new Date('2026-04-15T10:00:00Z'),
    ...over,
  };
}

// ─── Assertions ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, got?: unknown, want?: unknown) {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}`);
    if (got !== undefined) console.log('  got :', got);
    if (want !== undefined) console.log('  want:', want);
  }
}

// ─── Cases ───────────────────────────────────────────────────────────────────

(function defaultIsNoop() {
  const list = [makeSalon({ id: 'a' }), makeSalon({ id: 'b' })];
  const out = applyFilters(list, DEFAULT_FILTERS, makeCtx());
  check('default filters return all salons', out.length === 2, out.length, 2);
})();

(function distanceExcludes() {
  const list = [
    makeSalon({ id: 'near', distance_km: 2 }),
    makeSalon({ id: 'far', distance_km: 8 }),
    makeSalon({ id: 'noloc', distance_km: null }),
  ];
  const out = applyFilters(list, { ...DEFAULT_FILTERS, distanceKm: 3 }, makeCtx());
  check(
    'distance <= 3km excludes far + noloc',
    out.length === 1 && out[0].id === 'near',
    out.map((s) => s.id)
  );
})();

(function priceRange() {
  const list = [
    makeSalon({ id: 'cheap', avg_price_cents: 3000 }),
    makeSalon({ id: 'mid', avg_price_cents: 7000 }),
    makeSalon({ id: 'high', avg_price_cents: 15000 }),
    makeSalon({ id: 'unknown', avg_price_cents: null }),
  ];
  const out = applyFilters(
    list,
    { ...DEFAULT_FILTERS, priceMinCents: 5000, priceMaxCents: 10000 },
    makeCtx()
  );
  check(
    'price 50–100 keeps mid only',
    out.length === 1 && out[0].id === 'mid',
    out.map((s) => s.id)
  );
})();

(function ratingExcludes() {
  const list = [
    makeSalon({ id: 'top', rating_avg: 4.7 }),
    makeSalon({ id: 'mid', rating_avg: 4.1 }),
    makeSalon({ id: 'low', rating_avg: 3.8 }),
    makeSalon({ id: 'none', rating_avg: null }),
  ];
  const out = applyFilters(list, { ...DEFAULT_FILTERS, minRating: 4.5 }, makeCtx());
  check('rating ≥4.5 keeps top only', out.length === 1 && out[0].id === 'top', out.map((s) => s.id));
})();

(function availabilityNow() {
  const list = [
    makeSalon({ id: 'open', is_available_now: true }),
    makeSalon({ id: 'closed', is_available_now: false }),
  ];
  const out = applyFilters(
    list,
    { ...DEFAULT_FILTERS, availability: { kind: 'now' } },
    makeCtx()
  );
  check('availability now keeps open only', out.length === 1 && out[0].id === 'open');
})();

(function availabilityDay() {
  // now = Wed 2026-04-15. tomorrow = Thu (dow=4)
  const ctx = makeCtx({
    scheduleDaysBySalonId: new Map([
      ['s-thu', new Set([4])],
      ['s-mon', new Set([1])],
    ]),
  });
  const list = [makeSalon({ id: 's-thu' }), makeSalon({ id: 's-mon' })];
  const out = applyFilters(
    list,
    { ...DEFAULT_FILTERS, availability: { kind: 'tomorrow' } },
    ctx
  );
  check('tomorrow filter matches schedule day', out.length === 1 && out[0].id === 's-thu');
})();

(function servicesMatch() {
  const svc = (id: string, name: string, category: string | null): BarberService => ({
    id,
    salon_id: 's1',
    name,
    description: null,
    duration_min: 30,
    price_cents: 5000,
    currency: 'RON',
    category,
    active: true,
    created_at: '',
  });
  const ctx = makeCtx({
    servicesBySalonId: new Map([
      ['a', [svc('x', 'Tuns', 'tuns')]],
      ['b', [svc('y', 'Manichiură', 'manichiura')]],
    ]),
  });
  const list = [makeSalon({ id: 'a' }), makeSalon({ id: 'b' })];
  const out = applyFilters(list, { ...DEFAULT_FILTERS, services: ['tuns'] }, ctx);
  check('services=tuns keeps salon a', out.length === 1 && out[0].id === 'a');
})();

(function amenitiesMatch() {
  const list = [
    makeSalon({ id: 'good', amenities: ['parcare', 'wifi'] }),
    makeSalon({ id: 'bad', amenities: ['wifi'] }),
  ];
  const out = applyFilters(
    list,
    { ...DEFAULT_FILTERS, amenities: ['parcare', 'wifi'] },
    makeCtx()
  );
  check('amenities requires all present', out.length === 1 && out[0].id === 'good');
})();

(function sortCheapest() {
  const list = [
    makeSalon({ id: 'b', avg_price_cents: 8000 }),
    makeSalon({ id: 'a', avg_price_cents: 3000 }),
    makeSalon({ id: 'c', avg_price_cents: 12000 }),
  ];
  const out = applyFilters(list, { ...DEFAULT_FILTERS, sort: 'cheapest' }, makeCtx());
  check(
    'sort=cheapest orders ascending',
    out.map((s) => s.id).join(',') === 'a,b,c',
    out.map((s) => s.id).join(',')
  );
})();

(function combo() {
  const list = [
    makeSalon({ id: 'ok', distance_km: 2, rating_avg: 4.6 }),
    makeSalon({ id: 'far', distance_km: 8, rating_avg: 4.9 }),
    makeSalon({ id: 'low', distance_km: 1, rating_avg: 4.1 }),
  ];
  const out = applyFilters(
    list,
    { ...DEFAULT_FILTERS, distanceKm: 3, minRating: 4.5, sort: 'nearest' },
    makeCtx()
  );
  check('combo distance+rating+sort', out.length === 1 && out[0].id === 'ok');
})();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
