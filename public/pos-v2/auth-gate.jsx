/* Minimal auth gate — reuses pos-mesita-session or guest login */
function AuthGate({ children }) {
  const store = useStore();
  const [ready, setReady] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    const raw = sessionStorage.getItem("pos-mesita-session");
    if (raw) {
      setReady(true);
      return;
    }
    setBusy(true);
    fetch("/sistema/api/v1/auth/guest/", { method: "POST", headers: { "Content-Type": "application/json" } })
      .then((r) => r.json())
      .then((session) => {
        if (session?.token) {
          sessionStorage.setItem("pos-mesita-session", JSON.stringify(session));
          store.loadBootstrap().then(() => setReady(true));
        } else throw new Error("No se pudo iniciar sesión demo");
      })
      .catch((e) => setErr(e.message || "Error de autenticación"))
      .finally(() => setBusy(false));
  }, []);

  if (err) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "Inter, system-ui" }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.4rem", marginBottom: 8 }}>Mesita POS</h1>
          <p style={{ color: "#666", marginBottom: 16 }}>{err}</p>
          <a href="/" style={{ color: "var(--brand, #ea580c)" }}>Ir al login clásico</a>
        </div>
      </div>
    );
  }

  if (!ready || store.state.loading || busy) {
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
