import React, { useEffect, useMemo, useState } from "react";
import { SignedIn, SignedOut, SignIn, UserButton, useAuth } from "@clerk/clerk-react";

import OkValLogo from "./components/OkValLogo";
import SidebarNav from "./components/layout/SidebarNav";

import Dashboard from "./pages/Dashboard";
import Questions from "./pages/Questions";
import Quizzes from "./pages/Quizzes";
import Placeholder from "./pages/Placeholder";
import Admin from "./pages/Admin";
import Reports from "./pages/Reports";


import { apiFetch } from "./lib/api";
import { isAdmin } from "./lib/authz";
import {
  BG,
  BORDER,
  GhostButton,
  Icon,
  NAVY,
  Pill,
  TEXT_DIM,
  TEXT_DIM_2,
  useIsMobile,
} from "./components/ui/UI";

// Make layout more fluid/dynamic (use more of the window)
// - remove hard content max
// - keep comfortable padding via clamp
const PAGE_PAD_X = "clamp(14px, 2.2vw, 40px)";
const PAGE_PAD_Y = "clamp(12px, 1.6vw, 24px)";

const BRAND_BLUE = "#60a5fa";
const BRAND_FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"';
const BRAND_LETTER_SPACING = 0.8;

function BrandWordmark({ size = 18 }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 0,
        fontFamily: BRAND_FONT_STACK,
        fontWeight: 950,
        letterSpacing: BRAND_LETTER_SPACING,
        lineHeight: 1,
      }}
    >
      <span style={{ color: "white", fontSize: size }}>OK</span>
      <span style={{ color: BRAND_BLUE, fontSize: size }}>VAL</span>
    </div>
  );
}

function AppShell() {
  const { getToken } = useAuth();
  const isMobile = useIsMobile(980);

  const [me, setMe] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [error, setError] = useState("");

  const [active, setActive] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function loadMe() {
    try {
      setStatus("loading");
      setError("");
      const json = await apiFetch(getToken, "/api/me");
      setMe(json.data);
      setStatus("ok");
    } catch (e) {
      setStatus("error");
      setError(String(e?.message || e));
    }
  }

  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nav = useMemo(() => {
    const base = [
      { key: "dashboard", label: "Dashboard", icon: <Icon name="home" /> },
      { key: "questions", label: "Question Bank", icon: <Icon name="book" /> },
      { key: "quizzes", label: "Quizzes", icon: <Icon name="check" /> },
      { key: "reports", label: "Reports", icon: <Icon name="chart" /> },
    ];
    if (isAdmin(me)) base.push({ key: "admin", label: "Admin", icon: <Icon name="shield" /> });
    return base;
  }, [me]);

  function selectPage(key) {
    setActive(key);
    if (isMobile) setSidebarOpen(false);
  }

  const headerBlock = (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 46, height: 46, display: "grid", placeItems: "center" }}>
        <OkValLogo size={44} />
      </div>
      <div style={{ minWidth: 0 }}>
        <BrandWordmark size={20} />
        <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.60)" }}>
          Oklahoma Valuation Portal
        </div>
      </div>
    </div>
  );

  const sidebarItems = { header: headerBlock, nav };

  const Page = (() => {
    if (active === "dashboard") return Dashboard;
    if (active === "questions") return Questions;
    if (active === "admin") return Admin;
    if (active === "quizzes") return Quizzes;
    if (active === "reports") return Reports;
    return () => <Placeholder title="Reports" description="Proficiency breakdown by domain and role-based reporting views." />;
    return Dashboard;
  })();

  const activeLabel = nav.find((x) => x.key === active)?.label || "Overview";
  const orgName = me?.organization?.organization_name || null;
  const roleName = me?.roles?.[0]?.role_name || null;

  return (
    <div style={{ minHeight: "100vh", background: BG, color: "white" }}>
      <style>{`
        * { box-sizing: border-box; }
        ::selection { background: rgba(0,255,170,0.22); }
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius: 999px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.20); }
      `}</style>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "280px 1fr",
          minHeight: "100vh",
          width: "100%",
        }}
      >
        {!isMobile ? (
          <aside
            style={{
              background: NAVY,
              borderRight: "1px solid rgba(255,255,255,0.10)",
              position: "sticky",
              top: 0,
              height: "100vh",
            }}
          >
            <SidebarNav
              items={sidebarItems}
              activeKey={active}
              onSelect={selectPage}
              footer={
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", fontWeight: 900 }}>Signed in</div>
                    <UserButton />
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                    {me?.display_name || me?.email || "—"}
                  </div>
                </div>
              }
            />
          </aside>
        ) : null}

        <div style={{ minWidth: 0, display: "grid", gridTemplateRows: "auto 1fr" }}>
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.02)",
              position: "sticky",
              top: 0,
              zIndex: 50,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              {isMobile ? (
                <GhostButton onClick={() => setSidebarOpen(true)} icon={<Icon name="menu" />} ariaLabel="Open menu">
                  Menu
                </GhostButton>
              ) : null}

              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, display: "grid", placeItems: "center" }}>
                  <OkValLogo size={34} />
                </div>

                <div style={{ minWidth: 0 }}>
                  <BrandWordmark size={18} />

                  {/* Dynamic breadcrumb line: Page • Org • Role */}
                  <div
                    style={{
                      fontSize: 12,
                      color: "rgba(255,255,255,0.60)",
                      marginTop: 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      minWidth: 0,
                    }}
                  >
                    <span>{activeLabel}</span>

                    {orgName ? (
                      <>
                        <span style={{ opacity: 0.4 }}>•</span>
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {orgName}
                        </span>
                      </>
                    ) : null}

                    {roleName ? (
                      <>
                        <span style={{ opacity: 0.4 }}>•</span>
                        <span style={{ whiteSpace: "nowrap" }}>{roleName}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Pill tone={status === "ok" ? "ok" : status === "error" ? "bad" : "warn"}>
                <Icon name="dot" /> {status}
              </Pill>
              <UserButton />
            </div>
          </header>

          {/* Make main content use the full available width, not a fixed max */}
          <main
            style={{
              width: "100%",
              margin: "0 auto",
              padding: `${PAGE_PAD_Y} ${PAGE_PAD_X}`,
            }}
          >
            <div
              style={{
                width: "100%",
                border: `1px solid ${BORDER}`,
                background: "rgba(255,255,255,0.03)",
                borderRadius: 22,
                padding: 16,
              }}
            >
              {status === "error" ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 1000 }}>Unable to load /api/me</div>
                  <div style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.5 }}>{error}</div>
                  <div style={{ color: TEXT_DIM_2, fontSize: 12 }}>
                    If this persists, check Vercel env vars and server logs for /api/me.
                  </div>
                </div>
              ) : (
                <Page me={me} status={status} error={error} onRefresh={loadMe} getToken={getToken} />
              )}
            </div>
          </main>
        </div>

        {isMobile && sidebarOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setSidebarOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              zIndex: 60,
              display: "flex",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 320,
                maxWidth: "88vw",
                background: NAVY,
                borderRight: "1px solid rgba(255,255,255,0.12)",
                height: "100%",
              }}
            >
              <SidebarNav
                items={sidebarItems}
                activeKey={active}
                onSelect={selectPage}
                footer={
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", fontWeight: 900 }}>Signed in</div>
                      <UserButton />
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                      {me?.display_name || me?.email || "—"}
                    </div>
                  </div>
                }
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <SignedOut>
        <div
          style={{
            minHeight: "100vh",
            background: BG,
            color: "white",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              border: `1px solid ${BORDER}`,
              background: "rgba(255,255,255,0.04)",
              borderRadius: 22,
              padding: 18,
              boxShadow: "0 20px 60px rgba(0,0,0,0.40)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <BrandWordmark size={20} />
                <div style={{ marginTop: 6, color: TEXT_DIM, fontSize: 13, lineHeight: 1.4 }}>
                  Sign in to access training, quizzes, and role-based tools.
                </div>
              </div>
              <Pill tone="warn">
                <Icon name="dot" /> Signed out
              </Pill>
            </div>

            <div style={{ marginTop: 14 }}>
              <SignIn />
            </div>

            <div style={{ marginTop: 12, fontSize: 12, color: TEXT_DIM_2, lineHeight: 1.45 }}>
              If you ever see a blank page, check Vercel env vars first, then the browser console.
            </div>
          </div>
        </div>
      </SignedOut>

      <SignedIn>
        <AppShell />
      </SignedIn>
    </>
  );
}
