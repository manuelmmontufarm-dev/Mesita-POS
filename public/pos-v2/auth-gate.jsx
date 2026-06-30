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
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "Inter, system-ui" }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.4rem", marginBottom: 8 }}>Mesita POS</h1>
          <p style={{ color: "#666", marginBottom: 16 }}>{err}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reintentar</button>
        </div>
      </div>
    );
  }

  if (!ready || busy || store.state.loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "Inter, system-ui" }}>
        <div style={{ textAlign: "center", color: "#666" }}>
          <div className="spin" style={{ margin: "0 auto 12px", width: 28, height: 28, border: "3px solid #eee", borderTopColor: "var(--brand, #ea580c)", borderRadius: "50%" }} />
          Conectando con Mesita API…
        </div>
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
