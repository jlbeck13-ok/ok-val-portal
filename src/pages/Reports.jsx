// src/pages/Reports.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Card, TEXT_DIM, GhostButton } from "../components/ui/UI";

function fmt(n) {
  if (n == null || Number.isNaN(Number(n))) return "0.00";
  return Number(n).toFixed(2);
}

function safeJsonArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try {
    return JSON.parse(v);
  } catch {
    return [];
  }
}

// 180° Gauge (SVG)
function Gauge180({ value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));

  const W = 320;
  const H = 180;
  const cx = W / 2;
  const cy = 160;
  const r = 120;

  const startX = cx - r;
  const startY = cy;
  const endX = cx + r;
  const endY = cy;

  const arcPath = `M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`;

  // Semicircle length = πr
  const L = Math.PI * r;
  const filled = (v / 100) * L;
  const dashOffset = L - filled;

  // Theme-ish colors: deep navy -> gold
  const NAVY = "#0B1F3A";
  const GOLD = "#D4AF37";

  return (
    <div style={{ width: "100%", display: "grid", placeItems: "center" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ maxWidth: 420, overflow: "visible" }}
        role="img"
        aria-label={`Overall score ${fmt(v)} out of 100`}
      >
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={NAVY} />
            <stop offset="100%" stopColor={GOLD} />
          </linearGradient>
          <filter id="softGlow" x="-20%" y="-50%" width="140%" height="160%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track */}
        <path
          d={arcPath}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="18"
          strokeLinecap="round"
        />

        {/* Progress */}
        <path
          d={arcPath}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth="18"
          strokeLinecap="round"
          strokeDasharray={L}
          strokeDashoffset={dashOffset}
          filter="url(#softGlow)"
        />

        {/* Value */}
        <text
          x={cx}
          y={cy - 30}
          textAnchor="middle"
          style={{ fontSize: 40, fontWeight: 900, fill: "white" }}
        >
          {fmt(v)}
        </text>
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          style={{ fontSize: 12, fill: "rgba(255,255,255,0.65)" }}
        >
          Overall (weighted)
        </text>
      </svg>
    </div>
  );
}

function MiniDomainBar({ value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const NAVY = "#0B1F3A";
  const GOLD = "#D4AF37";

  return (
    <div
      style={{
        width: 160,
        height: 12,
        borderRadius: 999,
        background: "rgba(255,255,255,0.10)",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
      aria-label={`Domain score ${fmt(v)} out of 100`}
      title={`${fmt(v)}`}
    >
      <div
        style={{
          width: `${v}%`,
          height: "100%",
          borderRadius: 999,
          background: `linear-gradient(90deg, ${NAVY}, ${GOLD})`,
        }}
      />
    </div>
  );
}

function Modal({ title, subtitle, onClose, children }) {
  // OPAQUE modal panel + stronger overlay, so underlying page doesn't show through.
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.82)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(880px, 100%)",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(10, 16, 28, 0.98)", // <- key fix: opaque panel
          boxShadow: "0 20px 70px rgba(0,0,0,0.55)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 16,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{title}</div>
            {subtitle ? (
              <div style={{ color: TEXT_DIM, marginTop: 4, fontSize: 12 }}>
                {subtitle}
              </div>
            ) : null}
          </div>
          <GhostButton onClick={onClose}>Close</GhostButton>
        </div>

        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
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
  const myDomains = useMemo(() => safeJsonArray(my?.domain_scores), [my]);

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
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>My Results</div>
              <div style={{ color: TEXT_DIM, marginTop: 4 }}>
                {data?.me?.display_name || ""}
              </div>
            </div>
          </div>

          <Gauge180 value={my?.overall_weighted_score} />

          <div style={{ color: TEXT_DIM, fontSize: 12, marginTop: 4 }}>
            Domain scores
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {myDomains.length === 0 ? (
              <div style={{ color: TEXT_DIM }}>No domain data yet.</div>
            ) : (
              myDomains.map((d) => (
                <div
                  key={d.domain_id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    alignItems: "center",
                    gap: 12,
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                    paddingTop: 8,
                  }}
                >
                  <div style={{ fontWeight: 700, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {d.domain_name}
                    </span>
                  </div>

                  <MiniDomainBar value={d.weighted_score} />

                  <div style={{ color: TEXT_DIM, width: 70, textAlign: "right" }}>
                    {fmt(d.weighted_score)}
                  </div>
                </div>
              ))
            )}
          </div>
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
        <Modal
          title={openUser.display_name}
          subtitle={`${openUser.organization_name} • ${openUser.membership_role_code}`}
          onClose={() => setOpenUser(null)}
        >
          <Gauge180 value={openUser.overall_weighted_score} />

          <div style={{ color: TEXT_DIM, fontSize: 12, marginTop: 8 }}>
            Domain scores
          </div>

          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            {safeJsonArray(openUser.domain_scores).map((d) => (
              <div
                key={d.domain_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  alignItems: "center",
                  gap: 12,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  paddingTop: 8,
                }}
              >
                <div style={{ fontWeight: 700, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {d.domain_name}
                  </span>
                </div>

                <MiniDomainBar value={d.weighted_score} />

                <div style={{ color: TEXT_DIM, width: 70, textAlign: "right" }}>
                  {fmt(d.weighted_score)}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
