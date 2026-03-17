// api/org-requests-decide.js
import pkg from "pg";
import { verifyToken } from "@clerk/backend";

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function getBearerToken(req) {
  const authHeader =
    req.headers["authorization"] || req.headers["Authorization"] || "";
  if (typeof authHeader !== "string") return null;

  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || null;
}

function parseJsonBody(req) {
  let body = req.body;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  if (!body || typeof body !== "object") body = {};
  return body;
}

async function getActor(client, clerkUserId) {
  const { rows: userRows } = await client.query(
    `
    select
      user_id,
      clerk_user_id,
      email,
      display_name,
      active_organization_id,
      organization_id,
      is_active
    from public.app_user
    where clerk_user_id = $1
    limit 1
    `,
    [clerkUserId]
  );

  if (userRows.length === 0) return null;

  const actor = userRows[0];

  const { rows: globalRoleRows } = await client.query(
    `
    select r.role_code
    from public.user_role ur
    join public.role r on r.role_id = ur.role_id
    where ur.user_id = $1
    order by r.role_rank desc, r.role_code asc
    limit 1
    `,
    [actor.user_id]
  );

  const global_role_code = String(globalRoleRows[0]?.role_code || "").toLowerCase();
  const is_system_admin = global_role_code === "system_admin";

  let membership_role_code = null;

  if (actor.active_organization_id) {
    const { rows: memRows } = await client.query(
      `
      select r.role_code
      from public.user_organization_membership uom
      join public.role r on r.role_id = uom.role_id
      where uom.user_id = $1
        and uom.organization_id = $2
        and uom.is_active = true
      limit 1
      `,
      [actor.user_id, actor.active_organization_id]
    );

    membership_role_code = String(memRows[0]?.role_code || "").toLowerCase() || null;
  }

  const can_admin_active_org =
    is_system_admin ||
    membership_role_code === "assessor" ||
    membership_role_code === "director";

  return {
    ...actor,
    global_role_code,
    membership_role_code,
    is_system_admin,
    can_admin_active_org,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" },
    });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Missing Bearer token" },
    });
  }

  let clerkUserId = null;
  try {
    const verified = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      authorizedParties: [
        "https://ok-val-portal.vercel.app",
        "http://localhost:5173",
      ],
    });

    clerkUserId = verified?.sub || null;
    if (!clerkUserId) {
      return res.status(401).json({
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Invalid token" },
      });
    }
  } catch (e) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Invalid token" },
    });
  }

  const body = parseJsonBody(req);

  const request_id = body.request_id || body.requestId || null;
  const approved_role_id = body.approved_role_id || body.approvedRoleId || null;
  const decision = String(body.decision || "").trim().toLowerCase();
  const decision_note = body.decision_note || body.decisionNote || null;

  if (!request_id || !decision) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "request_id and decision are required",
      },
    });
  }

  if (!["approve", "reject"].includes(decision)) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "decision must be approve or reject",
      },
    });
  }

  if (decision === "approve" && !approved_role_id) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "approved_role_id is required for approval",
      },
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const actor = await getActor(client, clerkUserId);

    if (!actor) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        error: { code: "NOT_FOUND", message: "App user not found" },
      });
    }

    if (!actor.is_active) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        ok: false,
        error: { code: "FORBIDDEN", message: "User is inactive" },
      });
    }

    if (!actor.can_admin_active_org) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        ok: false,
        error: { code: "FORBIDDEN", message: "Not authorized to decide requests" },
      });
    }

    const { rows: reqRows } = await client.query(
      `
      select
        r.request_id,
        r.requester_user_id,
        r.requested_organization_id,
        r.requested_role_id,
        r.approved_role_id,
        r.status
      from public.organization_membership_request r
      where r.request_id = $1
      for update
      `,
      [request_id]
    );

    if (reqRows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        error: { code: "NOT_FOUND", message: "Request not found" },
      });
    }

    const reqRow = reqRows[0];
    const requestStatus = String(reqRow.status || "").toLowerCase();

    if (requestStatus !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        error: { code: "NOT_PENDING", message: "Request is not pending" },
      });
    }

    const targetOrgId = reqRow.requested_organization_id;

    const actorCanApproveThis =
      actor.is_system_admin ||
      (
        !!actor.active_organization_id &&
        actor.active_organization_id === targetOrgId &&
        ["assessor", "director"].includes(String(actor.membership_role_code || "").toLowerCase())
      );

    if (!actorCanApproveThis) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Not authorized to decide requests for this organization",
        },
      });
    }

    if (decision === "reject") {
      const { rows: updatedRows } = await client.query(
        `
        update public.organization_membership_request
        set
          status = 'rejected',
          decided_at = now(),
          decided_by_user_id = $2,
          decision_note = $3,
          approved_role_id = null,
          updated_at = now(),
          updated_by = $2
        where request_id = $1
        returning
          request_id,
          status,
          decided_at,
          decided_by_user_id,
          decision_note,
          approved_role_id
        `,
        [request_id, actor.user_id, decision_note]
      );

      await client.query("COMMIT");
      return res.status(200).json({ ok: true, data: updatedRows[0] });
    }

    const { rows: roleRows } = await client.query(
      `
      select role_id, role_code, role_name, is_active
      from public.role
      where role_id = $1
      limit 1
      `,
      [approved_role_id]
    );

    if (roleRows.length === 0 || !roleRows[0].is_active) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "approved_role_id is invalid or inactive",
        },
      });
    }

    const approvedRole = roleRows[0];

    if (!actor.is_system_admin && String(approvedRole.role_code || "").toLowerCase() === "system_admin") {
      await client.query("ROLLBACK");
      return res.status(403).json({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Only system admin may assign system_admin",
        },
      });
    }

    const { rows: requesterRows } = await client.query(
      `
      select user_id, is_active
      from public.app_user
      where user_id = $1
      for update
      `,
      [reqRow.requester_user_id]
    );

    if (requesterRows.length === 0 || !requesterRows[0].is_active) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Requester user not found or inactive",
        },
      });
    }

    await client.query(
      `
      insert into public.user_organization_membership (
        user_id,
        organization_id,
        role_id,
        is_active,
        approved_at,
        approved_by,
        created_by,
        updated_by
      )
      values ($1, $2, $3, true, now(), $4, $4, $4)
      on conflict (user_id, organization_id)
      do update set
        role_id = excluded.role_id,
        is_active = true,
        approved_at = now(),
        approved_by = excluded.approved_by,
        deactivated_at = null,
        deactivated_by = null,
        deactivation_reason = null,
        updated_at = now(),
        updated_by = excluded.updated_by
      `,
      [reqRow.requester_user_id, targetOrgId, approved_role_id, actor.user_id]
    );

    await client.query(
      `
      update public.app_user
      set
        organization_id = $2,
        active_organization_id = $2,
        updated_at = now(),
        updated_by = $3
      where user_id = $1
      `,
      [reqRow.requester_user_id, targetOrgId, actor.user_id]
    );

    const { rows: finalRows } = await client.query(
      `
      update public.organization_membership_request
      set
        status = 'approved',
        approved_role_id = $4,
        decided_at = now(),
        decided_by_user_id = $2,
        decision_note = $3,
        updated_at = now(),
        updated_by = $2
      where request_id = $1
      returning
        request_id,
        status,
        requested_role_id,
        approved_role_id,
        decided_at,
        decided_by_user_id,
        decision_note
      `,
      [request_id, actor.user_id, decision_note, approved_role_id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      data: {
        request: finalRows[0],
        applied: {
          requester_user_id: reqRow.requester_user_id,
          organization_id: targetOrgId,
          membership_role_id: approved_role_id,
          membership_role_code: approvedRole.role_code,
          membership_role_name: approvedRole.role_name,
        },
      },
    });
  } catch (e) {
    await client.query("ROLLBACK");
    return res.status(500).json({
      ok: false,
      error: {
        code: "SERVER_ERROR",
        message: e?.message || "Unknown error",
      },
    });
  } finally {
    client.release();
  }
}