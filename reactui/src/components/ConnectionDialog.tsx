// File: reactui/src/components/ConnectionDialog.tsx
import { useMemo, useState } from "react";
import type { SqlServerConnectionProfile } from "../../../shared/types";


type Props = {
  show: boolean;
  onClose: () => void;
  onConnect: (profile: SqlServerConnectionProfile) => void;
};

const LS_KEY = "forgesql.lastProfile.v2";

const DEFAULT_PROFILE: SqlServerConnectionProfile = {
  name: "Local SQL Server",
  server: ".",
  database: "master",
  auth: { kind: "windows" },
  encrypt: false,
  trustServerCertificate: true,
  connectionString: "",
};

type AuthKind = "windows" | "sql";

function normalizeServer(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return ".";
  const lower = s.toLowerCase();
  if (s === "." || lower === "localhost" || lower === "(local)") return ".";

  return s;
}


function buildOdbcConnectionString(p: {
  server: string;
  database: string;
  authKind: AuthKind;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
}): string {
  const driver = "ODBC Driver 17 for SQL Server";
  const parts: string[] = [];
  parts.push(`Driver={${driver}}`);
  parts.push(`Server=${normalizeServer(p.server)}`);
  parts.push(`Database=${(p.database || "master").trim() || "master"}`);

  if (p.authKind === "windows") {
    parts.push("Trusted_Connection=Yes");
  } else {
    parts.push(`Uid=${p.user}`);
    parts.push(`Pwd=${p.password}`);
  }

  parts.push(`Encrypt=${p.encrypt ? "Yes" : "No"}`);
  parts.push(`TrustServerCertificate=${p.trustServerCertificate ? "Yes" : "No"}`);

  return parts.join(";") + ";";
}

function loadProfile(): SqlServerConnectionProfile {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_PROFILE;

    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") return DEFAULT_PROFILE;

    const p = parsed as Partial<SqlServerConnectionProfile> & { connectionString?: unknown };

    return {
      name: p.name ?? DEFAULT_PROFILE.name,
      server: p.server ?? DEFAULT_PROFILE.server,
      database: p.database ?? DEFAULT_PROFILE.database,
      auth:
        p.auth?.kind === "sql"
          ? { kind: "sql", user: p.auth.user ?? "", password: p.auth.password ?? "" }
          : { kind: "windows" },
      encrypt: p.encrypt ?? DEFAULT_PROFILE.encrypt,
      trustServerCertificate: p.trustServerCertificate ?? DEFAULT_PROFILE.trustServerCertificate,
      connectionString: typeof p.connectionString === "string" ? p.connectionString : DEFAULT_PROFILE.connectionString,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}


export default function ConnectionDialog({ show, onClose, onConnect }: Props) {
  const [initial] = useState(loadProfile);

  const [name, setName] = useState(initial.name);
  const [server, setServer] = useState(initial.server ?? ".");
  const [database, setDatabase] = useState(initial.database ?? "master");

  const [authKind, setAuthKind] = useState<AuthKind>(initial.auth.kind === "sql" ? "sql" : "windows");

  const [user, setUser] = useState(initial.auth.kind === "sql" ? initial.auth.user : "");
  const [password, setPassword] = useState(initial.auth.kind === "sql" ? initial.auth.password : "");

  const [encrypt, setEncrypt] = useState<boolean>(initial.encrypt ?? false);
  const [trustServerCertificate, setTrustServerCertificate] = useState<boolean>(initial.trustServerCertificate ?? true);

  // Connection string box: can be generated OR raw-pasted.
  const [useRawConnStr, setUseRawConnStr] = useState<boolean>(!!(initial.connectionString ?? "").trim());
  const [rawConnStr, setRawConnStr] = useState<string>(initial.connectionString ?? "");

  const generatedConnStr = useMemo(() => {
    return buildOdbcConnectionString({
      server,
      database,
      authKind,
      user,
      password,
      encrypt,
      trustServerCertificate,
    });
  }, [server, database, authKind, user, password, encrypt, trustServerCertificate]);

  const displayedConnStr = useMemo(() => {
    // What we show in the textbox
    return useRawConnStr ? rawConnStr : generatedConnStr;
  }, [useRawConnStr, rawConnStr, generatedConnStr]);

  const effectiveConnStr = useMemo(() => {
    // What we copy
    const raw = (rawConnStr ?? "").trim();
    return useRawConnStr && raw ? raw : generatedConnStr;
  }, [useRawConnStr, rawConnStr, generatedConnStr]);

  const profile: SqlServerConnectionProfile = useMemo(
    () => ({
      name,
      server,
      database: database || undefined,
      auth: authKind === "windows" ? { kind: "windows" } : { kind: "sql", user, password },
      encrypt,
      trustServerCertificate,
      // Only persist raw string if user explicitly chose it.
      connectionString: useRawConnStr ? (rawConnStr ?? "").trim() : "",
    }),
    [name, server, database, authKind, user, password, encrypt, trustServerCertificate, useRawConnStr, rawConnStr],
  );

  function handleConnect() {
    localStorage.setItem(LS_KEY, JSON.stringify(profile));
    onConnect(profile);
  }

  async function handleCopyConnStr() {
    try {
      await navigator.clipboard.writeText(effectiveConnStr);
    } catch {
      // user can still manually select + copy
    }
  }

  function handleConnStrChange(next: string) {
    // If they type here, we treat it as "raw" mode automatically.
    setUseRawConnStr(true);
    setRawConnStr(next);
  }

  function handleUseGenerated() {
    setUseRawConnStr(false);
  }

  function handleUseGeneratedButPaste() {
    // Helpful when they want the generated string as a starting point,
    // but still want "raw" mode to stay enabled.
    setUseRawConnStr(true);
    setRawConnStr(generatedConnStr);
  }

  if (!show) return null;

  return (
    <div className="position-fixed top-0 start-0 w-100 h-100" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="bg-white rounded shadow position-absolute top-50 start-50 translate-middle p-3" style={{ width: 520 }}>
        <h5 className="mb-3">Connect to SQL Server</h5>

        <div className="mb-2">
          <label className="form-label">Profile Name</label>
          <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="mb-2">
          <label className="form-label">Server</label>
          <input className="form-control" value={server} onChange={(e) => setServer(e.target.value)} placeholder="." />
          <div className="form-text">
            Use <code>.</code> for local default instance (works with your <code>sqlcmd -S . -E</code>).
          </div>
        </div>

        <div className="mb-2">
          <label className="form-label">Database</label>
          <input className="form-control" value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="master" />
        </div>

        <div className="mb-2">
          <label className="form-label">Authentication</label>
          <select className="form-select" value={authKind} onChange={(e) => setAuthKind(e.target.value === "sql" ? "sql" : "windows")}>
            <option value="windows">Windows (Trusted Connection)</option>
            <option value="sql">SQL Login (user/password)</option>
          </select>
        </div>

        {authKind === "sql" && (
          <div className="row g-2 mb-2">
            <div className="col-6">
              <label className="form-label">User</label>
              <input className="form-control" value={user} onChange={(e) => setUser(e.target.value)} />
            </div>
            <div className="col-6">
              <label className="form-label">Password</label>
              <input className="form-control" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
        )}

        <div className="row g-2 mb-3">
          <div className="col-6">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                checked={encrypt}
                onChange={(e) => setEncrypt(e.target.checked)}
                id="chkEncrypt"
              />
              <label className="form-check-label" htmlFor="chkEncrypt">
                Encrypt
              </label>
            </div>
          </div>
          <div className="col-6">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                checked={trustServerCertificate}
                onChange={(e) => setTrustServerCertificate(e.target.checked)}
                id="chkTrust"
              />
              <label className="form-check-label" htmlFor="chkTrust">
                Trust Server Certificate
              </label>
            </div>
          </div>
        </div>

        {/* Connection string box: generate + paste into same textbox */}
        <div className="mb-2">
          <div className="d-flex align-items-center">
            <label className="form-label mb-0">Connection String</label>
            <div className="ms-auto d-flex gap-2">
              <button className="btn btn-sm btn-outline-secondary" type="button" onClick={handleCopyConnStr}>
                <i className="bi bi-clipboard me-1" />
                Copy
              </button>
            </div>
          </div>

          <textarea
            className="form-control font-monospace"
            rows={3}
            value={displayedConnStr}
            onChange={(e) => handleConnStrChange(e.target.value)}
            spellCheck={false}
          />

          <div className="d-flex align-items-center mt-2">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                checked={useRawConnStr}
                onChange={(e) => setUseRawConnStr(e.target.checked)}
                id="chkUseRaw"
              />
              <label className="form-check-label" htmlFor="chkUseRaw">
                Use raw connection string (paste your existing server string here)
              </label>
            </div>

            {useRawConnStr ? (
              <button className="btn btn-sm btn-outline-primary ms-auto" type="button" onClick={handleUseGenerated} title="Switch back to generated mode">
                Use Generated
              </button>
            ) : (
              <button className="btn btn-sm btn-outline-primary ms-auto" type="button" onClick={handleUseGeneratedButPaste} title="Copy generated into raw mode">
                Copy Generated → Raw
              </button>
            )}
          </div>

          <div className="form-text">
            This box is both: (1) the generated string you can copy, and (2) where you can paste a connection string to connect to an existing server configuration.
            If the string contains a password, treat it like a secret.
          </div>
        </div>

        <div className="d-flex gap-2 mt-3">
          <button className="btn btn-primary" onClick={handleConnect}>
            <i className="bi bi-plug me-1" />
            Connect
          </button>
          <button className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
