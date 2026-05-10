/**
 * useSalonBillingDetails — fetch + CRUD for the salon's billing entities.
 *
 * Each salon can have N entities (legal persons / PJ + natural persons /
 * PF), one of which is marked `is_default = true` and used by callers
 * (marketplace checkout, e-Factura) when no specific entity is selected.
 *
 * Owner-only writes (RLS enforced). DB schema enforces:
 *  - PJ requires fiscal_code (CUI/CIF), CNP must be NULL
 *  - PF requires cnp (13 digits), fiscal_code must be NULL, is_vat_payer = false
 *  - At most one is_default = true per salon (partial unique index)
 *
 * Callers that need exactly the default record can use the
 * `useDefaultSalonBilling()` shortcut below.
 *
 * Ported verbatim from Tapzi-barber/hooks/use-salon-billing-details.ts.
 * Import path: @/lib/supabase (same as Tapzi).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type BillingEntityType = 'legal_person' | 'natural_person';

export type SalonBillingDetails = {
  id: string;
  salon_id: string;
  entity_type: BillingEntityType;
  is_default: boolean;
  /** Display name — company name (PJ) or full personal name (PF). */
  company_name: string;
  /** CUI/CIF for PJ; NULL for PF. */
  fiscal_code: string | null;
  /** CNP for PF; NULL for PJ. */
  cnp: string | null;
  /** Trade Register number — PJ only. */
  registration_no: string | null;
  /** Always false for PF (DB-enforced). */
  is_vat_payer: boolean;
  iban: string | null;
  bank_name: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  county: string;
  postal_code: string | null;
  country: string;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
};

/** Shape the form passes to create/update. The hook injects salon_id. */
export type SalonBillingInput = Omit<SalonBillingDetails, 'id' | 'salon_id'>;

export type UseSalonBillingDetailsReturn = {
  /** All entities for this salon, default first, then by created_at. */
  entities: SalonBillingDetails[];
  /** Convenience accessor — the entity flagged is_default. */
  defaultEntity: SalonBillingDetails | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** Look up by id from the already-fetched list. Cheap O(N). */
  getById: (id: string) => SalonBillingDetails | null;
  /** Insert a new entity. If it's the first one, forces is_default=true. */
  createEntity: (
    input: SalonBillingInput,
  ) => Promise<{ ok: true; entity: SalonBillingDetails } | { ok: false; error: string }>;
  /** Update an existing entity by id. */
  updateEntity: (
    id: string,
    input: Partial<SalonBillingInput>,
  ) => Promise<{ ok: true; entity: SalonBillingDetails } | { ok: false; error: string }>;
  /** Delete an entity. If it was the default and others exist, the
   *  caller is responsible for picking a new default first — this hook
   *  refuses to delete a default while siblings remain to avoid a
   *  silent "no default" state. */
  deleteEntity: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Atomically promote `id` to default and demote whatever held it. */
  setDefault: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

const SELECT_COLS =
  'id, salon_id, entity_type, is_default, company_name, fiscal_code, cnp, registration_no, is_vat_payer, iban, bank_name, address_line1, address_line2, city, county, postal_code, country, contact_email, contact_phone, notes';

export function useSalonBillingDetails(
  salonId: string | null | undefined,
): UseSalonBillingDetailsReturn {
  const [entities, setEntities] = useState<SalonBillingDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntities = useCallback(async () => {
    if (!salonId) {
      setEntities([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('salon_billing_details')
      .select(SELECT_COLS)
      .eq('salon_id', salonId)
      // Default first, then alphabetic on company_name for stable ordering.
      .order('is_default', { ascending: false })
      .order('company_name', { ascending: true });
    if (err) {
      console.warn('[useSalonBillingDetails] fetch error:', err.message);
      setError(err.message);
      setEntities([]);
    } else {
      setEntities((data ?? []) as SalonBillingDetails[]);
    }
    setLoading(false);
  }, [salonId]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  const defaultEntity = useMemo(
    () => entities.find((e) => e.is_default) ?? null,
    [entities],
  );

  const getById = useCallback(
    (id: string) => entities.find((e) => e.id === id) ?? null,
    [entities],
  );

  const createEntity = useCallback(
    async (input: SalonBillingInput) => {
      if (!salonId) return { ok: false as const, error: 'missing_salon' };
      setSaving(true);
      setError(null);

      // First entity for this salon must be the default — there's no
      // sensible "no default" starting state. Subsequent inserts honor
      // whatever is_default the caller passed.
      const isFirst = entities.length === 0;
      const payload = {
        salon_id: salonId,
        ...input,
        is_default: isFirst ? true : input.is_default,
      };

      // If we're creating a row WITH is_default=true and one already
      // exists, demote the old default in the same transaction-ish
      // pair so the partial unique index doesn't fire.
      if (payload.is_default && !isFirst) {
        const { error: demoteErr } = await supabase
          .from('salon_billing_details')
          .update({ is_default: false })
          .eq('salon_id', salonId)
          .eq('is_default', true);
        if (demoteErr) {
          setSaving(false);
          setError(demoteErr.message);
          return { ok: false as const, error: demoteErr.message };
        }
      }

      const { data, error: err } = await supabase
        .from('salon_billing_details')
        .insert(payload)
        .select(SELECT_COLS)
        .single();
      setSaving(false);

      if (err) {
        setError(err.message);
        return { ok: false as const, error: err.message };
      }
      const entity = data as SalonBillingDetails;
      // Refetch to sync the demote + insert in local state. Cheaper to
      // just re-pull than to manually splice with the right ordering.
      await fetchEntities();
      return { ok: true as const, entity };
    },
    [salonId, entities.length, fetchEntities],
  );

  const updateEntity = useCallback(
    async (id: string, input: Partial<SalonBillingInput>) => {
      if (!salonId) return { ok: false as const, error: 'missing_salon' };
      setSaving(true);
      setError(null);

      // Refuse to demote the ONLY default — a salon with N entities and
      // zero defaults breaks the marketplace checkout (silently saves
      // NULL billing). Caller must promote a sibling first.
      if (input.is_default === false) {
        const target = entities.find((e) => e.id === id);
        const otherDefaults = entities.filter(
          (e) => e.id !== id && e.is_default,
        );
        if (target?.is_default && otherDefaults.length === 0 && entities.length > 1) {
          setSaving(false);
          return {
            ok: false as const,
            error: 'cannot_demote_only_default',
          };
        }
      }

      // Special-case promoting to default: demote the current default
      // first, otherwise the partial unique index rejects the update.
      if (input.is_default === true) {
        const current = entities.find((e) => e.is_default);
        if (current && current.id !== id) {
          const { error: demoteErr } = await supabase
            .from('salon_billing_details')
            .update({ is_default: false })
            .eq('id', current.id);
          if (demoteErr) {
            setSaving(false);
            setError(demoteErr.message);
            return { ok: false as const, error: demoteErr.message };
          }
        }
      }

      const { data, error: err } = await supabase
        .from('salon_billing_details')
        .update(input)
        .eq('id', id)
        .select(SELECT_COLS)
        .single();
      setSaving(false);

      if (err) {
        setError(err.message);
        return { ok: false as const, error: err.message };
      }
      await fetchEntities();
      return { ok: true as const, entity: data as SalonBillingDetails };
    },
    [salonId, entities, fetchEntities],
  );

  const deleteEntity = useCallback(
    async (id: string) => {
      const target = entities.find((e) => e.id === id);
      if (!target) return { ok: false as const, error: 'not_found' };

      // Refuse to delete the default while siblings exist — the caller
      // should setDefault() to another entity first. Without this guard
      // the salon ends up with no default and downstream callers (the
      // marketplace checkout, e-Factura) silently fall back to NULL
      // billing on the next order.
      if (target.is_default && entities.length > 1) {
        return {
          ok: false as const,
          error: 'cannot_delete_default_with_siblings',
        };
      }

      setSaving(true);
      setError(null);
      const { error: err } = await supabase
        .from('salon_billing_details')
        .delete()
        .eq('id', id);
      setSaving(false);

      if (err) {
        setError(err.message);
        return { ok: false as const, error: err.message };
      }
      await fetchEntities();
      return { ok: true as const };
    },
    [entities, fetchEntities],
  );

  const setDefault = useCallback(
    async (id: string) => {
      // Idempotent — short-circuit if already default. Avoids the
      // demote-promote dance + a useless DB round trip on rapid taps.
      const target = entities.find((e) => e.id === id);
      if (target?.is_default) return { ok: true as const };
      return updateEntity(id, { is_default: true });
    },
    [entities, updateEntity],
  );

  return {
    entities,
    defaultEntity,
    loading,
    saving,
    error,
    refetch: fetchEntities,
    getById,
    createEntity,
    updateEntity,
    deleteEntity,
    setDefault,
  };
}

/**
 * Convenience hook for callers that only ever need the default entity
 * (marketplace checkout pre-fill, etc.). Wraps the full hook and
 * exposes a slimmed-down interface that mirrors the pre-multi-entity
 * shape so existing callsites can migrate with a one-line change.
 */
export function useDefaultSalonBilling(salonId: string | null | undefined) {
  const { defaultEntity, loading, error, refetch } = useSalonBillingDetails(salonId);
  return {
    details: defaultEntity,
    loading,
    error,
    refetch,
  };
}
