// /api/reports.js
import pkg from "pg";
import { createClerkClient } from "@clerk/backend";

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
});

function toWebRequest(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const url = `${proto}://${host}${req.url}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers || {})) {
    if (typeof v === "string") headers.set(k, v);
  }
  return new Request(url, { method: req.method, headers });
}

async function getAppUser(req) {
  const webReq = toWebRequest(req);
  const authResult = await clerk.authenticateRequest(webReq);

  if (!authResult?.isAuthenticated) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }

  const clerkUserId = authResult?.toAuth?.().userId;
  if (!clerkUserId) {
    return { ok: false, status: 401, error: "Missing Clerk user id" };
  }

  const { rows } = await pool.query(
    `
    select
      u.user_id,
      u.clerk_user_id,
      u.email,
      u.display_name,
      u.active_organization_id
    from public.app_user u
    where u.clerk_user_id = $1
      and u.is_active = true
    limit 1
    `,
    [clerkUserId]
  );

  if (!rows.length) {
    return { ok: false, status: 403, error: "No app_user row for this account" };
  }

  return { ok: true, user: rows[0] };
}

function norm(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const meResult = await getAppUser(req);
    if (!meResult.ok) return res.status(meResult.status).json({ error: meResult.error });

    const me = meResult.user;

    // 1) Determine global role (system_admin?)
    const globalRoleQ = await pool.query(
      `
      select r.role_code
      from public.user_role ur
      join public.role r on r.role_id = ur.role_id
      where ur.user_id = $1
      limit 1
      `,
      [me.user_id]
    );
    const globalRoleCode = norm(globalRoleQ.rows[0]?.role_code);
    const isSystemAdmin = globalRoleCode === "system_admin";

    // 2) Determine org role in ACTIVE org (supervisor/assessor/director?)
    const activeOrgId = me.active_organization_id;

    let membershipRoleCode = "";
    if (activeOrgId) {
      const memQ = await pool.query(
        `
        select r.role_code
        from public.user_organization_membership uom
        join public.role r on r.role_id = uom.role_id
        where uom.user_id = $1
          and uom.organization_id = $2
          and uom.is_active = true
        limit 1
        `,
        [me.user_id, activeOrgId]
      );
      membershipRoleCode = norm(memQ.rows[0]?.role_code);
    }

    const canSeeOrg =
      ["supervisor", "assessor", "director"].includes(membershipRoleCode);

    // 3) Always return my own report row (from org view if possible; fallback to user view)
    // Prefer org view so org name + role are present when active org is set.
    const myRowQ = await pool.query(
      `
      select *
      from public.v_org_user_weighted_competency
      where user_id = $1
        and ($2::uuid is null or organization_id = $2)
      order by organization_name nulls last
      limit 1
      `,
      [me.user_id, activeOrgId]
    );

    // If user has no membership row, we still want their personal competency:
    let myReport = myRowQ.rows[0] || null;
    if (!myReport) {
      const fallbackQ = await pool.query(
        `
        select
          v.user_id,
          u.display_name,
          u.email,
          v.overall_weighted_score,
          v.overall_earned_weight,
          v.overall_possible_weight,
          v.domain_scores
        from public.v_user_weighted_competency v
        join public.app_user u on u.user_id = v.user_id
        where v.user_id = $1
        limit 1
        `,
        [me.user_id]
      );
      myReport = fallbackQ.rows[0] || {
        user_id: me.user_id,
        display_name: me.display_name,
        email: me.email,
        overall_weighted_score: 0,
        overall_earned_weight: 0,
        overall_possible_weight: 0,
        domain_scores: [],
      };
    }

    // 4) Secondary list (org users OR all users)
    let scope = "self";
    let users = [];

    if (isSystemAdmin) {
      scope = "all";
      const q = await pool.query(
        `
        select *
        from public.v_org_user_weighted_competency
        order by organization_name, overall_weighted_score desc nulls last, display_name
        `
      );
      users = q.rows;
    } else if (canSeeOrg && activeOrgId) {
      scope = "org";
      const q = await pool.query(
        `
        select *
        from public.v_org_user_weighted_competency
        where organization_id = $1
        order by overall_weighted_score desc nulls last, display_name
        `,
        [activeOrgId]
      );
      users = q.rows;
    }

    return res.status(200).json({
      me: {
        user_id: me.user_id,
        display_name: me.display_name,
        email: me.email,
        active_organization_id: activeOrgId,
        global_role_code: globalRoleCode,
        membership_role_code: membershipRoleCode,
        is_system_admin: isSystemAdmin,
      },
      my_report: myReport,
      scope,
      users,
    });
  } catch (err) {
    console.error("reports error", err);
    return res.status(500).json({ error: "Server error" });
  }
}
