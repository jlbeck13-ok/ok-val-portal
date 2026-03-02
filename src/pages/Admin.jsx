// Admin.jsx (replace entire file)
import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  GhostButton,
  Icon,
  Pill,
  TEXT_DIM,
  TEXT_DIM_2,
} from "../components/ui/UI";
import { apiFetch } from "../lib/api";

export default function Admin({ me, getToken, onRefresh }) {
  const meData = me?.data || me || {};

  // Normalize codes so we don't get burned by "ASSESSOR" vs "assessor"
  const norm = (v) => (v == null ? "" : String(v).trim().toLowerCase());

  const membershipRole = norm(meData.membership_role_code);
  const globalRole = norm(meData.global_role_code);

  // Prefer the explicit boolean from /api/me, but keep a safe fallback
  const isSystemAdmin = !!meData.is_system_admin || globalRole === "system_admin";

  // Your rule: Assessor OR Director in the active org can access Admin
  const isOrgApprover = ["assessor", "director"].includes(membershipRole);

  // If your backend already computed this correctly, allow it too
  const canUseAdmin = isSystemAdmin || isOrgApprover || !!meData.can_admin_active_org;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [requests, setRequests] = useState([]);
  const [roles, setRoles] = useState([]);

  // USERS MODULE
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersErr, setUsersErr] = useState("");
  const [usersData, setUsersData] = useState({ organizations: [], unassigned: [] });
  const [orgsForTransfer, setOrgsForTransfer] = useState([]);

  // Modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState(null); // { user_id, ... membership/org info }
  const [editWorking, setEditWorking] = useState(false);
  const [editError, setEditError] = useState("");

  const [editDisplayName, setEditDisplayName] = useState("");
  const [editRoleId, setEditRoleId] = useState("");
  const [editTransferOrgId, setEditTransferOrgId] = useState("");

  // Per-request selection
  const [selectedRoleByRequestId, setSelectedRoleByRequestId] = useState({});
  const [actionState, setActionState] = useState({}); // requestId -> {status, error}

  async function loadUsers() {
    try {
      setUsersLoading(true);
      setUsersErr("");

      // IMPORTANT: /api/org-users uses Clerk cookie auth (like org-requests-pending.js)
      // so we intentionally use plain fetch (same-origin cookies automatically included).
      const resp = await fetch("/api/org-users", { method: "GET" });
      const body = await resp.json();

      if (!resp.ok || !body?.ok) {
        throw new Error(body?.error?.message || "Failed to load users");
      }

      setUsersData(body.data || { organizations: [], unassigned: [] });
      setUsersLoading(false);
    } catch (e) {
      setUsersLoading(false);
      setUsersErr(String(e?.message || e));
    }
  }

  async function loadTransferOrganizationsIfNeeded() {
    if (!isSystemAdmin) return;
    try {
      // /api/organizations uses Bearer token verifyToken, so we keep using apiFetch/getToken
      const orgResp = await apiFetch(getToken, "/api/organizations");
      setOrgsForTransfer(orgResp?.data || []);
    } catch (e) {
      // Don't block Admin if org list fails; only impacts transfer dropdown.
      setOrgsForTransfer([]);
    }
  }

  async function loadAll() {
    try {
      setLoading(true);
      setErr("");

      const [pending, rolesResp] = await Promise.all([
        apiFetch(getToken, "/api/org-requests-pending"),
        apiFetch(getToken, "/api/roles"),
      ]);

      const reqs = pending?.data || [];
      const rs = rolesResp?.data || [];

      setRequests(reqs);
      setRoles(rs);

      // Default role selection:
      // Prefer director, then assessor, else first available.
      const directorRoleId =
        rs.find((r) => norm(r.role_code) === "director")?.role_id || "";
      const assessorRoleId =
        rs.find((r) => norm(r.role_code) === "assessor")?.role_id || "";
      const fallbackRoleId = rs[0]?.role_id || "";
      const defaultRoleId = directorRoleId || assessorRoleId || fallbackRoleId;

      const defaults = {};
      for (const r of reqs) defaults[r.request_id] = defaultRoleId;

      setSelectedRoleByRequestId((prev) => ({ ...defaults, ...prev }));
      setLoading(false);

      // Users module loads alongside
      await Promise.all([loadUsers(), loadTransferOrganizationsIfNeeded()]);
    } catch (e) {
      setLoading(false);
      setErr(String(e?.message || e));
      // still try users load so the page isn't dead if pending fails
      try {
        await Promise.all([loadUsers(), loadTransferOrganizationsIfNeeded()]);
      } catch { }
    }
  }

  useEffect(() => {
    if (!canUseAdmin) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseAdmin]);

  const roleOptions = useMemo(() => {
    return (roles || []).map((r) => ({
      id: r.role_id,
      label: `${r.role_name} (${r.role_code})`,
      code: norm(r.role_code),
    }));
  }, [roles]);

  const orgOptions = useMemo(() => {
    return (orgsForTransfer || []).map((o) => ({
      id: o.organization_id,
      label: o.organization_name,
      typeCode: o.organization_type_code,
    }));
  }, [orgsForTransfer]);

  async function decide(requestId, decision) {
    try {
      setActionState((s) => ({
        ...s,
        [requestId]: { status: "working", error: "" },
      }));

      const body = { request_id: requestId, decision };

      if (decision === "approve") {
        const approved_role_id = selectedRoleByRequestId[requestId];
        if (!approved_role_id) {
          setActionState((s) => ({
            ...s,
            [requestId]: {
              status: "error",
              error: "Select an approved role first.",
            },
          }));
          return;
        }
        body.approved_role_id = approved_role_id;
      }

      await apiFetch(getToken, "/api/org-requests-decide", {
        method: "POST",
        body: JSON.stringify(body),
      });

      await loadAll();
      await onRefresh?.();

      setActionState((s) => ({
        ...s,
        [requestId]: { status: "ok", error: "" },
      }));
    } catch (e) {
      setActionState((s) => ({
        ...s,
        [requestId]: { status: "error", error: String(e?.message || e) },
      }));
    }
  }

  function openEdit(user, orgCtx) {
    // user is a flattened object from /api/org-users
    // orgCtx: { organization_id, organization_name }
    setEditError("");
    setEditWorking(false);
    setEditUser({
      ...user,
      organization_id: orgCtx?.organization_id || user.organization_id || null,
      organization_name: orgCtx?.organization_name || user.organization_name || null,
    });

    setEditDisplayName(user.display_name || "");
    setEditRoleId(user.membership_role_id || "");
    setEditTransferOrgId(""); // only used by system_admin

    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditUser(null);
    setEditDisplayName("");
    setEditRoleId("");
    setEditTransferOrgId("");
    setEditWorking(false);
    setEditError("");
  }

  async function saveEdit() {
    if (!editUser?.user_id) return;

    try {
      setEditWorking(true);
      setEditError("");

      const payload = {
        user_id: editUser.user_id,
      };

      // Update display_name (optional)
      if (typeof editDisplayName === "string") {
        payload.display_name = editDisplayName.trim();
      }

      // Update membership role (optional)
      if (editRoleId) {
        payload.role_id = editRoleId;
      }

      // For system admin, pass org for accuracy (especially when grouped)
      if (isSystemAdmin && editUser.organization_id) {
        payload.organization_id = editUser.organization_id;
      }

      // Transfer (system_admin only)
      if (isSystemAdmin && editTransferOrgId) {
        payload.transfer_to_organization_id = editTransferOrgId;
      }

      const resp = await fetch("/api/org-users-update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await resp.json();
      if (!resp.ok || !body?.ok) {
        throw new Error(body?.error?.message || "Failed to save user");
      }

      // Refresh users (and me, in case the actor did something that affects context)
      await loadUsers();
      await onRefresh?.();

      setEditWorking(false);
      closeEdit();
    } catch (e) {
      setEditWorking(false);
      setEditError(String(e?.message || e));
    }
  }

  async function removeUserFromOrg() {
    if (!editUser?.user_id) return;
    if (!editUser?.organization_id && isSystemAdmin) {
      setEditError("Missing organization context for removal.");
      return;
    }

    try {
      setEditWorking(true);
      setEditError("");

      const payload = {
        user_id: editUser.user_id,
        deactivation_reason: "Removed from organization",
      };

      // For system_admin we include org explicitly
      if (isSystemAdmin && editUser.organization_id) {
        payload.organization_id = editUser.organization_id;
      }

      const resp = await fetch("/api/org-users-deactivate", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await resp.json();
      if (!resp.ok || !body?.ok) {
        throw new Error(body?.error?.message || "Failed to remove user");
      }

      await loadUsers();
      await onRefresh?.();

      setEditWorking(false);
      closeEdit();
    } catch (e) {
      setEditWorking(false);
      setEditError(String(e?.message || e));
    }
  }

  if (!canUseAdmin) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <Card
          title="Admin"
          subtitle="Access denied. You must be an Assessor or Director in the active organization."
        >
          <Pill tone="bad">
            <Icon name="dot" /> You need an <b>Assessor</b> or <b>Director</b>{" "}
            membership role for the active organization (or SYSTEM_ADMIN).
          </Pill>

          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: TEXT_DIM_2 }}>
              Debug snapshot:
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill>
                <Icon name="dot" /> Global role: {meData.global_role_code || "—"}
              </Pill>
              <Pill>
                <Icon name="dot" /> Active org role:{" "}
                {meData.membership_role_code || "—"}
              </Pill>
              <Pill>
                <Icon name="dot" /> can_admin_active_org:{" "}
                {String(!!meData.can_admin_active_org)}
              </Pill>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: 0.2 }}>
            Admin
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 13,
              color: TEXT_DIM,
              lineHeight: 1.45,
            }}
          >
            Approve organization access requests and manage users within your
            active organization (Assessor/Director).
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {isSystemAdmin ? (
              <Pill tone="ok">
                <Icon name="dot" /> SYSTEM_ADMIN
              </Pill>
            ) : null}

            {meData.membership_role_code ? (
              <Pill tone={isOrgApprover ? "ok" : undefined}>
                <Icon name="dot" /> Active org role: {meData.membership_role_code}
              </Pill>
            ) : null}

            {meData.active_organization?.organization_name ? (
              <Pill>
                <Icon name="dot" /> Active org:{" "}
                {meData.active_organization.organization_name}
              </Pill>
            ) : null}
          </div>
        </div>

        <GhostButton
          onClick={loadAll}
          icon={<Icon name="refresh" />}
          ariaLabel="Refresh admin"
        >
          Refresh
        </GhostButton>
      </div>

      {/* Pending Requests */}
      <Card
        title="Pending organization requests"
        subtitle="Assessor/Director can approve requests for their active organization. SYSTEM_ADMIN can approve any."
      >
        {loading ? (
          <Pill tone="warn">
            <Icon name="dot" /> Loading…
          </Pill>
        ) : err ? (
          <div style={{ display: "grid", gap: 10 }}>
            <Pill tone="bad">
              <Icon name="dot" /> Failed to load
            </Pill>
            <div style={{ fontSize: 12, color: TEXT_DIM_2, lineHeight: 1.5 }}>
              {err}
            </div>
          </div>
        ) : requests.length === 0 ? (
          <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.5 }}>
            No pending requests.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {requests.map((r) => {
              const state = actionState[r.request_id] || {
                status: "idle",
                error: "",
              };
              const selectedRoleId = selectedRoleByRequestId[r.request_id] || "";

              return (
                <div
                  key={r.request_id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 16,
                    padding: 12,
                    background: "rgba(255,255,255,0.02)",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <Pill>
                        <Icon name="dot" /> {r.requester_display_name || "—"}
                      </Pill>
                      <Pill>
                        <Icon name="dot" /> {r.requester_email || "—"}
                      </Pill>
                      <Pill>
                        <Icon name="dot" /> {r.organization_name || "—"}
                      </Pill>
                    </div>

                    <Pill tone="warn">
                      <Icon name="dot" /> pending
                    </Pill>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: TEXT_DIM_2,
                        fontWeight: 900,
                      }}
                    >
                      Approved membership role
                    </div>

                    <select
                      value={selectedRoleId}
                      onChange={(e) =>
                        setSelectedRoleByRequestId((m) => ({
                          ...m,
                          [r.request_id]: e.target.value,
                        }))
                      }
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
                      {roleOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    <div style={{ fontSize: 12, color: TEXT_DIM_2, lineHeight: 1.45 }}>
                      This sets the user’s role within the requested organization
                      (membership-scoped).
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <GhostButton
                      onClick={() => decide(r.request_id, "approve")}
                      icon={<Icon name="check" />}
                      ariaLabel="Approve request"
                      disabled={state.status === "working"}
                    >
                      {state.status === "working" ? "Working…" : "Approve"}
                    </GhostButton>

                    <GhostButton
                      onClick={() => decide(r.request_id, "reject")}
                      icon={<Icon name="x" />}
                      ariaLabel="Reject request"
                      disabled={state.status === "working"}
                    >
                      Reject
                    </GhostButton>

                    {state.status === "ok" ? (
                      <Pill tone="ok">
                        <Icon name="dot" /> Done
                      </Pill>
                    ) : null}

                    {state.status === "error" ? (
                      <Pill tone="bad">
                        <Icon name="dot" /> {state.error}
                      </Pill>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* USERS MODULE (directly below pending requests) */}
      <Card
        title="Users"
        subtitle={
          isSystemAdmin
            ? "SYSTEM_ADMIN: View users grouped by organization. Edit roles, names, and transfer organizations."
            : "Assessor/Director: View and manage users within your active organization."
        }
      >
        {usersLoading ? (
          <Pill tone="warn">
            <Icon name="dot" /> Loading…
          </Pill>
        ) : usersErr ? (
          <div style={{ display: "grid", gap: 10 }}>
            <Pill tone="bad">
              <Icon name="dot" /> Failed to load users
            </Pill>
            <div style={{ fontSize: 12, color: TEXT_DIM_2, lineHeight: 1.5 }}>
              {usersErr}
            </div>
            <GhostButton
              onClick={loadUsers}
              icon={<Icon name="refresh" />}
              ariaLabel="Refresh users"
            >
              Retry
            </GhostButton>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {(usersData.organizations || []).length === 0 ? (
              <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.5 }}>
                No users found.
              </div>
            ) : (
              (usersData.organizations || []).map((org) => {
                const orgName = org.organization_name || "—";
                const users = org.users || [];

                return (
                  <div
                    key={org.organization_id || orgName}
                    style={{
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 16,
                      padding: 12,
                      background: "rgba(255,255,255,0.02)",
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <Pill>
                          <Icon name="dot" /> {orgName}
                        </Pill>
                        <Pill>
                          <Icon name="dot" /> {users.length} user{users.length === 1 ? "" : "s"}
                        </Pill>
                      </div>

                      <GhostButton
                        onClick={loadUsers}
                        icon={<Icon name="refresh" />}
                        ariaLabel="Refresh users"
                      >
                        Refresh
                      </GhostButton>
                    </div>

                    {users.length === 0 ? (
                      <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.5 }}>
                        No users in this organization.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {users.map((u) => (
                          <div
                            key={`${org.organization_id || "org"}:${u.user_id}`}
                            style={{
                              border: "1px solid rgba(255,255,255,0.10)",
                              borderRadius: 16,
                              padding: 12,
                              background: "rgba(0,0,0,0.20)",
                              display: "grid",
                              gap: 10,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 10,
                                flexWrap: "wrap",
                              }}
                            >
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                <Pill>
                                  <Icon name="dot" /> {u.display_name || "—"}
                                </Pill>
                                <Pill>
                                  <Icon name="dot" /> {u.email || "—"}
                                </Pill>
                                <Pill>
                                  <Icon name="dot" /> {u.membership_role_code || "—"}
                                </Pill>

                                {u.membership_is_active === false ? (
                                  <Pill tone="bad">
                                    <Icon name="dot" /> inactive
                                  </Pill>
                                ) : (
                                  <Pill tone="ok">
                                    <Icon name="dot" /> active
                                  </Pill>
                                )}
                              </div>

                              <GhostButton
                                onClick={() => openEdit(u, org)}
                                icon={<Icon name="edit" />}
                                ariaLabel="Edit user"
                              >
                                Edit
                              </GhostButton>
                            </div>

                            {u.deactivated_at ? (
                              <div style={{ fontSize: 12, color: TEXT_DIM_2, lineHeight: 1.45 }}>
                                Deactivated: {String(u.deactivated_at)}{" "}
                                {u.deactivation_reason ? `— ${u.deactivation_reason}` : ""}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Optional: show unassigned bucket only for system admin */}
            {isSystemAdmin && (usersData.unassigned || []).length > 0 ? (
              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 16,
                  padding: 12,
                  background: "rgba(255,255,255,0.02)",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Pill>
                    <Icon name="dot" /> Unassigned
                  </Pill>
                  <Pill>
                    <Icon name="dot" /> {(usersData.unassigned || []).length} user
                    {(usersData.unassigned || []).length === 1 ? "" : "s"}
                  </Pill>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {(usersData.unassigned || []).map((u) => (
                    <div
                      key={`unassigned:${u.user_id}`}
                      style={{
                        border: "1px solid rgba(255,255,255,0.10)",
                        borderRadius: 16,
                        padding: 12,
                        background: "rgba(0,0,0,0.20)",
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <Pill>
                          <Icon name="dot" /> {u.display_name || "—"}
                        </Pill>
                        <Pill>
                          <Icon name="dot" /> {u.email || "—"}
                        </Pill>
                        <Pill tone="warn">
                          <Icon name="dot" /> no org membership
                        </Pill>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      {/* EDIT MODAL */}
      {editOpen && editUser ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,0.72)",   // CHANGED (darker)
            backdropFilter: "blur(4px)",       // CHANGED (subtle blur)
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onMouseDown={(e) => {
            // click outside closes
            if (e.target === e.currentTarget) closeEdit();
          }}
        >
          <div style={{ width: "min(720px, 100%)" }}>
            {/* CHANGED: add solid surface wrapper */}
            <div
              style={{
                borderRadius: 18,
                background: "rgba(15, 15, 15, 0.92)",
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
                overflow: "hidden",
              }}
            >
              <Card
                title="Edit user"
                subtitle="Update display name, membership role, and (SYSTEM_ADMIN) transfer organization. Email is managed by Clerk."
              >
                <div style={{ display: "grid", gap: 12 }}>
                  {/* Snapshot pills */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <Pill>
                      <Icon name="dot" /> {editUser.display_name || "—"}
                    </Pill>
                    <Pill>
                      <Icon name="dot" /> {editUser.email || "—"}
                    </Pill>
                    {editUser.organization_name ? (
                      <Pill>
                        <Icon name="dot" /> {editUser.organization_name}
                      </Pill>
                    ) : null}
                    {editUser.membership_role_code ? (
                      <Pill>
                        <Icon name="dot" /> {editUser.membership_role_code}
                      </Pill>
                    ) : null}
                  </div>

                  {/* Display name */}
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, color: TEXT_DIM_2, fontWeight: 900 }}>
                      Display name
                    </div>
                    <input
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      placeholder="Display name"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(0,0,0,0.25)",
                        color: "white",
                        outline: "none",
                      }}
                    />
                    <div style={{ fontSize: 12, color: TEXT_DIM_2, lineHeight: 1.45 }}>
                      Email updates are managed by Clerk. This updates your local display label only.
                    </div>
                  </div>

                  {/* Role select */}
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, color: TEXT_DIM_2, fontWeight: 900 }}>
                      Membership role
                    </div>
                    <select
                      value={editRoleId}
                      onChange={(e) => setEditRoleId(e.target.value)}
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
                      {roleOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    <div style={{ fontSize: 12, color: TEXT_DIM_2, lineHeight: 1.45 }}>
                      Your governance rule is enforced: only one active Assessor/Director per organization.
                    </div>
                  </div>

                  {/* Transfer org (SYSTEM_ADMIN only) */}
                  {isSystemAdmin ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 12, color: TEXT_DIM_2, fontWeight: 900 }}>
                        Transfer to organization (SYSTEM_ADMIN)
                      </div>
                      <select
                        value={editTransferOrgId}
                        onChange={(e) => setEditTransferOrgId(e.target.value)}
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
                        <option value="">(No transfer)</option>
                        {orgOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <div style={{ fontSize: 12, color: TEXT_DIM_2, lineHeight: 1.45 }}>
                        Transfer will deactivate other active memberships for this user and activate the destination.
                      </div>
                    </div>
                  ) : null}

                  {/* Errors */}
                  {editError ? (
                    <Pill tone="bad">
                      <Icon name="dot" /> {editError}
                    </Pill>
                  ) : null}

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <GhostButton
                      onClick={saveEdit}
                      icon={<Icon name="check" />}
                      ariaLabel="Save user"
                      disabled={editWorking}
                    >
                      {editWorking ? "Working…" : "Save"}
                    </GhostButton>

                    <GhostButton
                      onClick={removeUserFromOrg}
                      icon={<Icon name="x" />}
                      ariaLabel="Remove user from organization"
                      disabled={editWorking}
                    >
                      Remove from org
                    </GhostButton>

                    <GhostButton
                      onClick={closeEdit}
                      icon={<Icon name="x" />}
                      ariaLabel="Close modal"
                      disabled={editWorking}
                    >
                      Close
                    </GhostButton>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
