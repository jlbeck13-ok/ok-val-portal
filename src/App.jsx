import React, { useEffect, useMemo, useState } from "react";
import { SignedIn, SignedOut, SignIn, UserButton, useAuth } from "@clerk/clerk-react";

import OkValLogo from "./components/OkValLogo";
import SidebarNav from "./components/layout/SidebarNav";

import Dashboard from "./pages/Dashboard";
import Questions from "./pages/Questions";
import Quizzes from "./pages/Quizzes";
import Placeholder from "./pages/Placeholder";
import Admin from "./pages/Admin";

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

function AccessStateCard({ title, subtitle, tone = "warn", children }) {
  return (
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
          maxWidth: 720,
          border: `1px solid ${BORDER}`,
          background: "rgba(255,255,255,0.04)",
          borderRadius: 22,
          padding: 20,
          boxShadow: "0 20px 60px rgba(0,0,0,0.40)",
          display: "grid",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 46, height: 46, display: "grid", placeItems: "center" }}>
              <OkValLogo size={44} />
            </div>
            <div>
              <BrandWordmark size={20} />
              <div style={{ marginTop: 6, color: TEXT_DIM, fontSize: 13, lineHeight: 1.4 }}>
                Oklahoma Valuation Portal
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Pill tone={tone}>
              <Icon name="dot" /> {title}
            </Pill>
            <UserButton />
          </div>
        </div>

        <div style={{ fontSize: 24, fontWeight: 1000, letterSpacing: 0.2 }}>{title}</div>
        <div style={{ color: TEXT_DIM, fontSize: 14, lineHeight: 1.55 }}>{subtitle}</div>

        <div
          style={{
            border: `1px solid ${BORDER}`,
            background: "rgba(255,255,255,0.03)",
            borderRadius: 18,
            padding: 16,
            display: "grid",
            gap: 12,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function PendingApprovalView({ me, onRefresh, loadingRefresh }) {
  const orgName =
    me?.active_organization?.organization_name ||
    me?.organization?.organization_name ||
    me?.pending_request?.organization_name ||
    "your selected organization";

  const submittedAt =
    me?.pending_request?.submitted_at ||
    me?.pending_request?.created_at ||
    null;

  return (
    <AccessStateCard
      title="Pending approval"
      subtitle="Your account is signed in, but access to the portal is not available until your organization request is approved."
      tone="warn"
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill>
          <Icon name="dot" /> {me?.display_name || me?.email || "Signed in"}
        </Pill>
        <Pill tone="warn">
          <Icon name="dot" /> Request status: {me?.pending_request?.status || "pending"}
        </Pill>
        <Pill>
          <Icon name="dot" /> Organization: {orgName}
        </Pill>
      </div>

      {submittedAt ? (
        <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.5 }}>
          Request submitted: {String(submittedAt)}
        </div>
      ) : null}

      <div style={{ fontSize: 13, color: TEXT_DIM_2, lineHeight: 1.5 }}>
        Once an Assessor, Director, or System Admin approves your request, you will be able to access the application.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <GhostButton
          onClick={onRefresh}
          icon={<Icon name="refresh" />}
          ariaLabel="Refresh approval status"
          disabled={loadingRefresh}
        >
          {loadingRefresh ? "Refreshing…" : "Check approval status"}
        </GhostButton>
      </div>
    </AccessStateCard>
  );
}

function RequestAccessView({ me, getToken, onSubmitted }) {
  const [orgs, setOrgs] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadOrgs() {
      try {
        setLoading(true);
        setError("");

        const orgResp = await apiFetch(getToken, "/api/organizations");
        const rows = orgResp?.data || [];

        if (!mounted) return;

        setOrgs(rows);
        setSelectedOrgId(rows?.[0]?.organization_id || "");
      } catch (e) {
        if (!mounted) return;
        setError(String(e?.message || e));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadOrgs();
    return () => {
      mounted = false;
    };
  }, [getToken]);

  async function submitOrgRequest() {
    try {
      setWorking(true);
      setError("");

      if (!selectedOrgId) {
        setError("Select an organization first.");
        return;
      }

      await apiFetch(getToken, "/api/org-requests", {
        method: "POST",
        body: JSON.stringify({ requested_organization_id: selectedOrgId }),
      });

      await onSubmitted?.();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <AccessStateCard
      title="Access required"
      subtitle="Your account is signed in, but you do not have approved organization access yet."
      tone="bad"
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill>
          <Icon name="dot" /> {me?.display_name || me?.email || "Signed in"}
        </Pill>
        <Pill tone="bad">
          <Icon name="dot" /> Not approved
        </Pill>
      </div>

      <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
        <div style={{ fontSize: 12, color: TEXT_DIM_2, fontWeight: 900 }}>Organization</div>
        <select
          value={selectedOrgId}
          onChange={(e) => setSelectedOrgId(e.target.value)}
          disabled={loading || working}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(0,0,0,0.25)",
            color: "white",
            outline: "none",
          }}
        >
          <option value="">
            {loading ? "Loading organizations..." : "Select an organization"}
          </option>
          {(orgs || []).map((o) => (
            <option key={o.organization_id} value={o.organization_id}>
              {o.organization_name}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <Pill tone="bad">
          <Icon name="dot" /> {error}
        </Pill>
      ) : null}

      <div style={{ fontSize: 13, color: TEXT_DIM_2, lineHeight: 1.5 }}>
        Submitting a request does not grant access. Your account will remain blocked until the request is approved.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <GhostButton
          onClick={submitOrgRequest}
          icon={<Icon name="check" />}
          ariaLabel="Request access"
          disabled={loading || working || !selectedOrgId}
        >
          {working ? "Submitting…" : "Request access"}
        </GhostButton>
      </div>
    </AccessStateCard>
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
      setMe(json?.data || null);
      setStatus("ok");
    } catch (e) {
      setStatus("error");
      setError(String(e?.message || e));
      setMe(null);
    }
  }

  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authz = useMemo(() => {
    const globalRoleCode = String(me?.global_role_code || "").trim().toLowerCase();
    const membershipRoleCode = String(me?.membership_role_code || "").trim().toLowerCase();

    const hasApprovedRole =
      !!globalRoleCode || !!membershipRoleCode || Array.isArray(me?.roles) && me.roles.length > 0;

    const hasApprovedOrg =
      !!me?.active_organization_id ||
      !!me?.organization_id ||
      !!me?.active_organization?.organization_id ||
      !!me?.organization?.organization_id;

    const hasPendingRequest =
      !!me?.pending_request &&
      String(me?.pending_request?.status || "pending").toLowerCase() === "pending";

    const isApproved = hasApprovedOrg && hasApprovedRole;

    return {
      hasApprovedOrg,
      hasApprovedRole,
      hasPendingRequest,
      isApproved,
    };
  }, [me]);

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
    if (active === "reports") {
      return () => (
        <Placeholder
          title="Reports"
          description="Proficiency breakdown by domain and role-based reporting views."
        />
      );
    }
    return Dashboard;
  })();

  const activeLabel = nav.find((x) => x.key === active)?.label || "Overview";
  const orgName =
    me?.active_organization?.organization_name ||
    me?.organization?.organization_name ||
    null;
  const roleName =
    me?.membership_role_name ||
    me?.roles?.[0]?.role_name ||
    me?.global_role_name ||
    null;

  if (status === "loading") {
    return (
      <AccessStateCard
        title="Loading"
        subtitle="Checking your account access."
        tone="warn"
      >
        <Pill tone="warn">
          <Icon name="dot" /> Loading account status…
        </Pill>
      </AccessStateCard>
    );
  }

  if (status === "error") {
    return (
      <AccessStateCard
        title="Unable to verify access"
        subtitle="The app could not load your account status from /api/me, so access is blocked."
        tone="bad"
      >
        <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.5 }}>{error}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <GhostButton
            onClick={loadMe}
            icon={<Icon name="refresh" />}
            ariaLabel="Retry account check"
          >
            Retry
          </GhostButton>
        </div>
      </AccessStateCard>
    );
  }

  if (!authz.isApproved && authz.hasPendingRequest) {
    return <PendingApprovalView me={me} onRefresh={loadMe} loadingRefresh={status === "loading"} />;
  }

  if (!authz.isApproved) {
    return <RequestAccessView me={me} getToken={getToken} onSubmitted={loadMe} />;
  }

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
              <Pill tone="ok">
                <Icon name="dot" /> authorized
              </Pill>
              <UserButton />
            </div>
          </header>

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
              <Page me={me} status={status} error={error} onRefresh={loadMe} getToken={getToken} />
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