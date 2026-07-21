import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, posApi } from './api';
import { draftFingerprint, reconcileDraftLineIds } from './domain';
import { clearDurableDraft, saveDurableDraft } from './localPersistence';
import type { Bill, OrderDraft } from './types';

export type ClientSaveState = 'SAVED' | 'QUEUED' | 'SAVING' | 'OFFLINE' | 'FAILED' | 'CONFLICT' | 'LOCKED';

interface Options {
  bill: Bill;
  draft: OrderDraft;
  baseDraft: OrderDraft;
  enabled: boolean;
  durabilityEnabled?: boolean;
  lockedMessage?: string;
  onSaved: (bill: Bill, reconciledDraft: OrderDraft) => void;
  onConflict: (error: ApiError) => void;
}

interface Result {
  state: ClientSaveState;
  message: string;
  dirty: boolean;
  flushNow: () => Promise<boolean>;
  acceptAuthoritativeBaseline: (bill: Bill, draft: OrderDraft) => void;
}

export function useDraftAutosave({
  bill,
  draft,
  baseDraft,
  enabled,
  durabilityEnabled = true,
  lockedMessage = 'Edición bloqueada',
  onSaved,
  onConflict,
}: Options): Result {
  const [state, setState] = useState<ClientSaveState>(enabled ? 'SAVED' : 'LOCKED');
  const [message, setMessage] = useState(enabled ? 'Cambios guardados' : lockedMessage);
  const [dirty, setDirty] = useState(() => draftFingerprint(draft) !== draftFingerprint(baseDraft));
  const latestDraft = useRef(draft);
  const latestFingerprint = useRef(draftFingerprint(draft));
  const savedFingerprint = useRef(draftFingerprint(baseDraft));
  const revision = useRef(bill.revision);
  const billId = useRef(bill.id);
  const baselineVersion = useRef(0);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSavedRef = useRef(onSaved);
  const onConflictRef = useRef(onConflict);

  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);
  useEffect(() => { onConflictRef.current = onConflict; }, [onConflict]);
  useEffect(() => { revision.current = bill.revision; }, [bill.revision]);

  useEffect(() => {
    if (bill.id !== billId.current) {
      baselineVersion.current += 1;
      if (timer.current) clearTimeout(timer.current);
      billId.current = bill.id;
      revision.current = bill.revision;
      savedFingerprint.current = draftFingerprint(baseDraft);
      latestFingerprint.current = draftFingerprint(draft);
      latestDraft.current = draft;
      setDirty(latestFingerprint.current !== savedFingerprint.current);
      setState(enabled ? 'SAVED' : 'LOCKED');
      setMessage(enabled ? 'Cambios guardados' : lockedMessage);
    }
  }, [baseDraft, bill.id, bill.revision, draft, enabled, lockedMessage]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (!enabled) {
      setState('LOCKED');
      setMessage(lockedMessage);
      return false;
    }
    if (inFlight.current) {
      const completed = await inFlight.current;
      if (!completed) return false;
      return latestFingerprint.current === savedFingerprint.current ? true : flush();
    }
    if (latestFingerprint.current === savedFingerprint.current) return true;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setState('OFFLINE');
      setMessage('Sin conexión. El cambio está pendiente en este dispositivo.');
      return false;
    }

    const sentDraft = latestDraft.current;
    const sentFingerprint = latestFingerprint.current;
    const operationBaselineVersion = baselineVersion.current;
    setState('SAVING');
    setMessage('Guardando y encolando…');

    const operation = posApi.saveDraft(billId.current, {
      expectedRevision: revision.current,
      diners: sentDraft.diners,
      notes: sentDraft.notes,
      items: sentDraft.items,
    }).then((savedBill) => {
      // A manager may accept a newer authoritative remote snapshot while an
      // older request is settling. Never let that response replace the rebase.
      if (operationBaselineVersion !== baselineVersion.current) return true;
      revision.current = savedBill.revision;
      savedFingerprint.current = sentFingerprint;
      const reconciledDraft = reconcileDraftLineIds(latestDraft.current, sentDraft, savedBill.items);
      latestDraft.current = reconciledDraft;
      latestFingerprint.current = draftFingerprint(reconciledDraft);
      onSavedRef.current(savedBill, reconciledDraft);
      const stillDirty = latestFingerprint.current !== sentFingerprint;
      if (durabilityEnabled) {
        if (stillDirty) saveDurableDraft(billId.current, savedBill.revision, reconciledDraft);
        else clearDurableDraft(billId.current);
      }
      setDirty(stillDirty);
      setState(stillDirty ? 'QUEUED' : 'SAVED');
      setMessage(stillDirty
        ? 'Hay cambios nuevos por guardar'
        : savedBill.syncState === 'SYNCED' ? 'Guardado y confirmado por Contífico' : 'Guardado; sincronización remota en curso');
      return true;
    }).catch((error: unknown) => {
      if (operationBaselineVersion !== baselineVersion.current) return true;
      const apiError = error instanceof ApiError ? error : new ApiError(0);
      setDirty(true);
      if (apiError.status === 409) {
        setState('CONFLICT');
        setMessage('Contífico cambió esta prefactura. Se detuvieron los envíos.');
        onConflictRef.current(apiError);
      } else if (apiError.status === 0) {
        setState('OFFLINE');
        setMessage('Sin conexión. El cambio sigue pendiente.');
      } else {
        setState('FAILED');
        setMessage(apiError.message);
      }
      return false;
    }).finally(() => {
      inFlight.current = null;
    });

    inFlight.current = operation;
    const succeeded = await operation;
    if (succeeded && latestFingerprint.current !== savedFingerprint.current) {
      return flush();
    }
    return succeeded;
  }, [durabilityEnabled, enabled, lockedMessage]);

  useEffect(() => {
    latestDraft.current = draft;
    latestFingerprint.current = draftFingerprint(draft);
    const changed = latestFingerprint.current !== savedFingerprint.current;
    setDirty(changed);

    if (durabilityEnabled) {
      if (changed) saveDurableDraft(billId.current, revision.current, draft);
      else clearDurableDraft(billId.current);
    }

    if (!enabled) {
      setState('LOCKED');
      setMessage(lockedMessage);
      return;
    }
    if (!changed) {
      setState('SAVED');
      setMessage('Cambios guardados');
      return;
    }

    setState(typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'QUEUED');
    setMessage(typeof navigator !== 'undefined' && !navigator.onLine
      ? 'Sin conexión. El cambio está pendiente en este dispositivo.'
      : 'Cambio pendiente; guardado automático en menos de 2 s');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 2000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [draft, durabilityEnabled, enabled, flush, lockedMessage]);

  useEffect(() => {
    const handleOnline = () => {
      if (latestFingerprint.current !== savedFingerprint.current) void flush();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flush]);

  const flushNow = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    return flush();
  }, [flush]);

  const acceptAuthoritativeBaseline = useCallback((authoritativeBill: Bill, authoritativeDraft: OrderDraft) => {
    baselineVersion.current += 1;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    billId.current = authoritativeBill.id;
    revision.current = authoritativeBill.revision;
    latestDraft.current = authoritativeDraft;
    const fingerprint = draftFingerprint(authoritativeDraft);
    latestFingerprint.current = fingerprint;
    savedFingerprint.current = fingerprint;
    clearDurableDraft(authoritativeBill.id);
    setDirty(false);
    setState('SAVED');
    setMessage(authoritativeBill.syncState === 'SYNCED'
      ? 'Versión de Contífico aceptada'
      : 'Versión remota aceptada; sincronización en curso');
  }, []);

  return { state, message, dirty, flushNow, acceptAuthoritativeBaseline };
}
