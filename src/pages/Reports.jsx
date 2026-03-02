import React, { useEffect, useMemo, useState } from "react";
import { Card, TEXT_DIM, GhostButton } from "../components/ui/UI";

function fmt(n) {
  if (n == null || Number.isNaN(Number(n))) return "0.00";
  return Number(n).toFixed(2);
}

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  const [openUser, setOpenUser] = useState(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr("");
        const res = await fetch("/api/reports");
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || "Failed to load reports");
        if (!alive) return;
        setData(j);
      } catch (e) {
        if (!alive) return;
        setErr(e.message || "Error");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const my = data?.my_report || null;
  const myDomains = useMemo(() => {
    const ds = my?.domain_scores;
    if (!ds) return [];
    if (Array.isArray(ds)) return ds;
    // in case it comes back as JSON string
    try {
      return JSON.parse(ds);
    } catch {
      return [];
    }
  }, [my]);

  const users = data?.users || [];
  const scope = data?.scope || "self";

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: TEXT_DIM }}>Loading reports…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ padding: 24 }}>
        <Card>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Reports</div>
          <div style={{ color: TEXT_DIM, marginBottom: 12 }}>
            Error loading reports:
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{err}</div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>My Results</div>
            <div style={{ color: TEXT_DIM, marginTop: 4 }}>
              {data?.me?.display_name || ""}
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ color: TEXT_DIM, fontSize: 12 }}>Overall (weighted)</div>
            <div style={{ fontWeight: 900, fontSize: 28 }}>
              {fmt(my?.overall_weighted_score)}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, color: TEXT_DIM, fontSize: 12 }}>
          Domain scores
        </div>

        <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
          {myDomains.length === 0 ? (
            <div style={{ color: TEXT_DIM }}>No domain data yet.</div>
          ) : (
            myDomains.map((d) => (
              <div
                key={d.domain_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  paddingTop: 8,
                }}
              >
                <div style={{ fontWeight: 700 }}>{d.domain_name}</div>
                <div style={{ color: TEXT_DIM }}>{fmt(d.weighted_score)}</div>
              </div>
            ))
          )}
        </div>
      </Card>

      {(scope === "org" || scope === "all") && (
        <Card>
          <div style={{ fontWeight: 900, fontSize: 18 }}>
            {scope === "all" ? "All Users" : "Organization Users"}
          </div>
          <div style={{ color: TEXT_DIM, marginTop: 4 }}>
            Click a user to view full details
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {users.map((u) => (
              <button
                key={`${u.organization_id}-${u.user_id}`}
                onClick={() => setOpenUser(u)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: 12,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{u.display_name}</div>
                    <div style={{ color: TEXT_DIM, fontSize: 12, marginTop: 2 }}>
                      {scope === "all"
                        ? `${u.organization_name} • ${u.membership_role_code}`
                        : `${u.membership_role_code}`}
                    </div>
                  </div>
                  <div style={{ fontWeight: 900 }}>{fmt(u.overall_weighted_score)}</div>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {openUser && (
        <div
          onClick={() => setOpenUser(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(720px, 100%)" }}
          >
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>
                    {openUser.display_name}
                  </div>
                  <div style={{ color: TEXT_DIM, marginTop: 4, fontSize: 12 }}>
                    {openUser.organization_name} • {openUser.membership_role_code}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: TEXT_DIM, fontSize: 12 }}>Overall (weighted)</div>
                  <div style={{ fontWeight: 900, fontSize: 28 }}>
                    {fmt(openUser.overall_weighted_score)}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                <GhostButton onClick={() => setOpenUser(null)}>Close</GhostButton>
              </div>

              <div style={{ marginTop: 12, color: TEXT_DIM, fontSize: 12 }}>
                Domain scores
              </div>

              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                {(Array.isArray(openUser.domain_scores)
                  ? openUser.domain_scores
                  : (() => {
                    try {
                      return JSON.parse(openUser.domain_scores || "[]");
                    } catch {
                      return [];
                    }
                  })()
                ).map((d) => (
                  <div
                    key={d.domain_id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      paddingTop: 8,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{d.domain_name}</div>
                    <div style={{ color: TEXT_DIM }}>{fmt(d.weighted_score)}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
