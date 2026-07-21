import { Component, useCallback, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { ApiError, posApi } from './api';
import { formatDateTime } from './domain';
import type { Bill, BootstrapResponse, DiningTable } from './types';
import { FloorView } from './components/FloorView';
import { HistoryView } from './components/HistoryView';
import { OrderView } from './components/OrderView';
import { AsyncButton, Icon, Notice } from './components/ui';
import logoUrl from '../logo.svg?url';

type Screen = { name: 'FLOOR' } | { name: 'HISTORY' } | { name: 'ORDER'; bill: Bill; table: DiningTable };
type BootState =
  | { status: 'LOADING' }
  | { status: 'READY'; data: BootstrapResponse }
  | { status: 'EXPIRED'; message: string }
  | { status: 'DISABLED'; message: string }
  | { status: 'ERROR'; message: string; requestId?: string };

let startupPromise: Promise<BootstrapResponse> | null = null;

function startSecureSession(): Promise<BootstrapResponse> {
  if (startupPromise) return startupPromise;
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  const ticket = fragment.get('ticket') || url.searchParams.get('ticket');
  startupPromise = (async () => {
    if (ticket) {
      try {
        await posApi.exchangeTicket(ticket);
      } finally {
        url.searchParams.delete('ticket');
        url.hash = '';
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
      }
    }
    return await posApi.bootstrap();
  })();
  return startupPromise;
}

export default function App() {
  const [boot, setBoot] = useState<BootState>({ status: 'LOADING' });
  const [screen, setScreen] = useState<Screen>({ name: 'FLOOR' });
  const [loggingOut, setLoggingOut] = useState(false);

  const loadBootstrap = useCallback(async () => {
    const data = await posApi.bootstrap();
    if (!data.restaurant.posConsoleEnabled) {
      setBoot({ status: 'DISABLED', message: 'El piloto POS no está habilitado para este restaurante.' });
      return;
    }
    setBoot({ status: 'READY', data });
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const data = await startSecureSession();
        if (!active) return;
        if (!data.restaurant.posConsoleEnabled) setBoot({ status: 'DISABLED', message: 'El piloto POS no está habilitado para este restaurante.' });
        else setBoot({ status: 'READY', data });
      } catch (caught) {
        if (!active) return;
        const error = caught instanceof ApiError ? caught : new ApiError(0);
        if (error.status === 401 || error.status === 403) setBoot({ status: 'EXPIRED', message: error.message });
        else if (error.status === 404) setBoot({ status: 'DISABLED', message: error.message });
        else setBoot({ status: 'ERROR', message: error.message, requestId: error.requestId });
      }
    }
    void initialize();
    return () => { active = false; };
  }, [loadBootstrap]);

  useEffect(() => {
    if (boot.status !== 'READY' || screen.name !== 'FLOOR') return;
    let active = true;
    let controller: AbortController | null = null;

    const refreshVisibleFloor = async () => {
      if (document.visibilityState !== 'visible') return;
      controller?.abort();
      controller = new AbortController();
      try {
        const data = await posApi.bootstrap(controller.signal);
        if (active) setBoot({ status: 'READY', data });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        // A polling failure must not replace a usable floor with an error page.
      }
    };

    const interval = window.setInterval(() => { void refreshVisibleFloor(); }, 5000);
    const onVisibility = () => { if (document.visibilityState === 'visible') void refreshVisibleFloor(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [boot.status, screen.name]);

  async function reload() {
    try {
      await loadBootstrap();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) setBoot({ status: 'EXPIRED', message: caught.message });
      else throw caught;
    }
  }

  async function openExisting(table: DiningTable) {
    if (!table.activeBill) return;
    const bill = await posApi.getBill(table.activeBill.id);
    setScreen({ name: 'ORDER', bill, table });
  }

  async function openNew(table: DiningTable, diners: number) {
    const bill = await posApi.openBill({ tableId: table.id, diners });
    setScreen({ name: 'ORDER', bill, table });
    await reload();
  }

  async function returnToFloor() {
    await reload();
    setScreen({ name: 'FLOOR' });
  }

  async function logout() {
    setLoggingOut(true);
    try { await posApi.logout(); } catch { /* The local session is treated as closed even if the request failed. */ }
    setBoot({ status: 'EXPIRED', message: 'Sesión cerrada. Abre el POS nuevamente desde Mesita.' });
    setLoggingOut(false);
  }

  if (boot.status === 'LOADING') return <BootLoader />;
  if (boot.status === 'EXPIRED') return <AccessState icon="logout" title="La sesión no está disponible" message={boot.message} action="Volver a intentar" onAction={() => window.location.reload()} />;
  if (boot.status === 'DISABLED') return <AccessState icon="info" title="Piloto no habilitado" message={boot.message} />;
  if (boot.status === 'ERROR') return <AccessState icon="wifi-off" title="No pudimos abrir la consola" message={boot.message} detail={boot.requestId ? `Referencia: ${boot.requestId}` : undefined} action="Reintentar" onAction={() => { setBoot({ status: 'LOADING' }); void loadBootstrap().catch((error: unknown) => setBoot({ status: 'ERROR', message: error instanceof Error ? error.message : 'No pudimos conectar.' })); }} />;

  const { data } = boot;
  const zone = screen.name === 'ORDER' ? data.zones.find((candidate) => candidate.id === screen.table.zoneId) : undefined;

  return (
    <ErrorBoundary>
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <div className="desktop-warning" role="status"><Icon name="info" /> Este piloto está optimizado para una pantalla de escritorio de al menos 1024 px.</div>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand-block">
            <img src={logoUrl} width="38" height="38" alt="" />
            <span><strong>Mesita POS</strong><small>{data.restaurant.name}</small></span>
            {data.restaurant.sandbox && <em>Sandbox</em>}
          </div>
          <nav aria-label="Navegación principal">
            <button className={screen.name === 'FLOOR' || screen.name === 'ORDER' ? 'active' : ''} onClick={() => { if (screen.name !== 'ORDER') setScreen({ name: 'FLOOR' }); }} aria-current={screen.name === 'FLOOR' || screen.name === 'ORDER' ? 'page' : undefined}><Icon name="map" /> Salón</button>
            <button className={screen.name === 'HISTORY' ? 'active' : ''} disabled={screen.name === 'ORDER'} title={screen.name === 'ORDER' ? 'Vuelve a Mesas antes de salir de la cuenta.' : undefined} onClick={() => setScreen({ name: 'HISTORY' })} aria-current={screen.name === 'HISTORY' ? 'page' : undefined}><Icon name="history" /> Historial</button>
          </nav>
          <div className="topbar-session">
            <span className={`integration-dot integration-${data.integration.status.toLowerCase()}`} title={`Contífico: ${data.integration.status}`} />
            <span className="user-chip"><b>{initials(data.user.name)}</b><span><strong>{data.user.name}</strong><small>{roleLabel(data.user.role)}</small></span></span>
            <AsyncButton className="icon-button" busy={loggingOut} onClick={() => void logout()} aria-label="Cerrar sesión"><Icon name="logout" /></AsyncButton>
          </div>
        </header>

        {screen.name === 'FLOOR' && <FloorView zones={data.zones} tables={data.tables} role={data.user.role} currency={data.restaurant.currency} timeZone={data.restaurant.timeZone} integration={data.integration} onSelectTable={openExisting} onOpenTable={openNew} onReload={reload} />}
        {screen.name === 'HISTORY' && <HistoryView currency={data.restaurant.currency} timeZone={data.restaurant.timeZone} />}
        {screen.name === 'ORDER' && <OrderView initialBill={screen.bill} table={screen.table} zone={zone} catalog={data.catalog || []} paymentMethods={data.paymentMethods || []} currency={data.restaurant.currency} timeZone={data.restaurant.timeZone} role={data.user.role} onBack={returnToFloor} />}

        <footer className="app-footer">
          <span>Mesita write-through pilot</span>
          <span>Contífico: {data.integration.status} · Verificado {formatDateTime(data.integration.lastCheckedAt, data.restaurant.timeZone)}</span>
        </footer>
      </div>
    </ErrorBoundary>
  );
}

function BootLoader() {
  return <div className="boot-shell" role="status" aria-live="polite"><img src={logoUrl} width="56" height="56" alt="" /><strong>Preparando Mesita POS…</strong><span>Verificando tu sesión y el estado de Contífico.</span><i /></div>;
}

function AccessState({ icon, title, message, detail, action, onAction }: { icon: 'logout' | 'info' | 'wifi-off'; title: string; message: string; detail?: string; action?: string; onAction?: () => void }) {
  return <main className="access-page"><section><img src={logoUrl} width="54" height="54" alt="Mesita" /><div className="access-icon"><Icon name={icon} size={28} /></div><h1>{title}</h1><p>{message}</p>{detail && <small>{detail}</small>}{action && onAction && <button className="button primary" onClick={onAction}>{action}</button>}<Notice tone="info" title="Acceso seguro">La sesión se crea con un ticket de un solo uso. No guardamos tokens en este navegador.</Notice></section></main>;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'M';
}

function roleLabel(role: string) {
  if (role === 'OWNER') return 'Propietario';
  if (role === 'MANAGER') return 'Manager';
  return 'Staff';
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('POS pilot render failure', error, info.componentStack);
  }
  render() {
    if (this.state.error) return <AccessState icon="info" title="La pantalla encontró un problema" message="Recarga la consola. Tus cambios confirmados permanecen en el servidor." action="Recargar" onAction={() => window.location.reload()} />;
    return this.props.children;
  }
}
