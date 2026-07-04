/* Auth gate — guest login then bootstrap POS data */
function AuthGate({ children }) {
  const store = useStore();
  const [ready, setReady] = React.useState(false);
  const [busy, setBusy] = React.useState(true);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;

    async function ensureGuestSession() {
      const raw = sessionStorage.getItem("pos-mesita-session");
      if (raw) {
        try {
          const s = JSON.parse(raw);
          if (s?.token) return s;
        } catch (_) { /* fallthrough */ }
      }
      const res = await fetch("/sistema/api/v1/auth/guest/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      });
      const session = await res.json().catch(() => ({}));
      if (!res.ok || !session?.token) {
        throw new Error(session?.error || "No se pudo iniciar sesión demo");
      }
      sessionStorage.setItem("pos-mesita-session", JSON.stringify(session));
      return session;
    }

    async function boot() {
      setBusy(true);
      setErr("");
      try {
        await ensureGuestSession();
        if (cancelled) return;
        await store.init();
        if (cancelled) return;
        if (store.state.authError) {
          throw new Error(store.state.authError);
        }
        setReady(true);
      } catch (e) {
        if (!cancelled) setErr(e.message || "Error de conexión con Mesita API");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    boot();
    return () => { cancelled = true; };
  }, []);

  if (err) {
    return (
      <div className="pos-boot">
        <img className="pos-boot-logo" src="/logo.svg" alt="" width="64" height="64" style={{ animation: "none" }} />
        <div className="pos-boot-name">Mesita POS<small>Consola de caja</small></div>
        <p style={{ margin: 0, maxWidth: 380, color: "var(--ink-mut)", fontSize: 13.5 }}>{err}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Reintentar</button>
      </div>
    );
  }

  if (!ready || busy || store.state.loading) {
    // Same markup as the static shell in index.html — the swap is invisible,
    // only the message advances to show real progress.
    return (
      <div className="pos-boot" aria-live="polite">
        <img className="pos-boot-logo" src="/logo.svg" alt="" width="64" height="64" />
        <div className="pos-boot-name">Mesita POS<small>Consola de caja</small></div>
        <div className="pos-boot-bar" role="progressbar" aria-label="Cargando Mesita POS" />
        <div className="pos-boot-msg">Conectando con Mesita API…</div>
      </div>
    );
  }

  return children;
}

function BootApp() {
  return (
    <AuthGate>
      <App />
    </AuthGate>
  );
}
