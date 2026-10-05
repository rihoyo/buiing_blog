// Deploy guest-interactions with gateway Verify JWT OFF. No login for guests.
// Only this server can call service-role-only SQL. Administrator actions verify Auth + role.
const origin = "https://rihoyo.github.io";
const cors = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  Vary: "Origin",
};
const reply = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: cors });
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          salt: Uint8Array.from(salt.match(/../g)!, (b) => parseInt(b, 16)),
          iterations: 210000,
        },
        key,
        256,
      ),
    ),
  );
}
const equal = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
const uuid = (s: unknown) =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
async function limitedBody(req: Request) {
  if (Number(req.headers.get("content-length") || 0) > 65536)
    throw Error("REQUEST_TOO_LARGE");
  const reader = req.body?.getReader();
  if (!reader) throw Error("INVALID_CONTENT");
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 65536) {
      await reader.cancel();
      throw Error("REQUEST_TOO_LARGE");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all));
}
Deno.serve(async (req: Request) => {
  if (req.headers.get("origin") !== origin)
    return reply({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      return reply({ error: "INVALID_CONTENT" }, 400);
    const input = await limitedBody(req),
      action = input?.action;
    if (
      ![
        "create",
        "vote",
        "delete",
        "edit",
        "admin-delete",
        "admin-ban",
        "admin-unban",
      ].includes(action)
    )
      return reply({ error: "INVALID_ACTION" }, 400);
    if (action === "create") {
      if (
        !["comment", "guestbook", "thread"].includes(input.scope) ||
        typeof input.name !== "string" ||
        !input.name.trim() ||
        input.name.trim().length > 40 ||
        typeof input.body !== "string" ||
        !input.body.trim() ||
        input.body.trim().length > 10000 ||
        typeof input.password !== "string" ||
        input.password.length > 128 ||
        input.website
      )
        return reply({ error: "INVALID_CONTENT" }, 400);
      if (
        input.scope === "comment" &&
        (typeof input.slug !== "string" ||
          !/^[a-zA-Z0-9_-]{1,160}$/.test(input.slug))
      )
        return reply({ error: "INVALID_CONTENT" }, 400);
      if (input.scope === "thread" && !uuid(input.thread))
        return reply({ error: "INVALID_CONTENT" }, 400);
      if (
        input.parent !== null &&
        input.parent !== undefined &&
        !uuid(input.parent)
      )
        return reply({ error: "INVALID_PARENT" }, 400);
    } else if (!uuid(input.id)) return reply({ error: "INVALID_CONTENT" }, 400);
    if (
      ["delete", "edit"].includes(action) &&
      (typeof input.password !== "string" || input.password.length > 128)
    )
      return reply({ error: "INVALID_PASSWORD" }, 400);
    if (
      action === "edit" &&
      (typeof input.body !== "string" ||
        !input.body.trim() ||
        input.body.trim().length > 10000)
    )
      return reply({ error: "INVALID_CONTENT" }, 400);
    const base = Deno.env.get("SUPABASE_URL"),
      service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!base || !service || !anon)
      return reply({ error: "GUEST_SETUP_REQUIRED" }, 503);
    // Hash infrastructure-provided network metadata; raw addresses are never stored or returned.
    // The global SQL budget still applies when network metadata is absent or spoofed.
    const ip = (
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      "unknown"
    )
      .trim()
      .slice(0, 128);
    const hmac = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(service),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const actor = hex(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          hmac,
          new TextEncoder().encode("guest-network:" + ip),
        ),
      ),
    );
    const serverHeaders = {
      Authorization: "Bearer " + service,
      apikey: service,
      "Content-Type": "application/json",
    };
    async function rpc(name: string, args: unknown) {
      const r = await fetch(base + "/rest/v1/rpc/" + name, {
        method: "POST",
        headers: serverHeaders,
        body: JSON.stringify(args),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        const known = [
          "BLOCKED_WORD",
          "INVALID_CONTENT",
          "INVALID_PARENT",
          "THREAD_NOT_FOUND",
          "ENTRY_NOT_FOUND",
          "ACCOUNT_BANNED",
          "POST_PRIVATE",
        ].find((e) => String(data?.message).includes(e));
        throw Error(
          known ||
            (["PGRST202", "PGRST205", "42883", "42P01"].includes(data?.code)
              ? "GUEST_SETUP_REQUIRED"
              : "INVALID_CONTENT"),
        );
      }
      return data;
    }
    if (
      (await rpc("secure_guest_budget", {
        p_actor: actor,
        p_action: action.startsWith("admin-")
          ? "admin"
          : action === "edit"
            ? "delete"
            : action,
      })) !== true
    )
      return reply({ error: "RATE_LIMIT" }, 429);
    let isAdmin = false;
    if (action.startsWith("admin-")) {
      const authorization = req.headers.get("authorization") || "",
        authHeaders = {
          Authorization: authorization,
          apikey: anon,
          "Content-Type": "application/json",
        };
      if (!authorization.startsWith("Bearer "))
        return reply({ error: "FORBIDDEN" }, 403);
      const u = await fetch(base + "/auth/v1/user", { headers: authHeaders });
      if (!u.ok) return reply({ error: "FORBIDDEN" }, 403);
      const role = await fetch(base + "/rest/v1/rpc/is_admin", {
        method: "POST",
        headers: authHeaders,
        body: "{}",
      });
      if (!role.ok || (await role.json()) !== true)
        return reply({ error: "FORBIDDEN" }, 403);
      isAdmin = true;
    }
    if (action === "create") {
      const salt = hex(crypto.getRandomValues(new Uint8Array(16))),
        hash = await passwordHash(input.password, salt);
      const id = await rpc("secure_guest_create", {
        p_scope: input.scope,
        p_slug: input.scope === "comment" ? input.slug : null,
        p_thread: input.scope === "thread" ? input.thread : null,
        p_parent: input.parent || null,
        p_name: input.name.trim(),
        p_body: input.body.trim(),
        p_salt: salt,
        p_hash: hash,
        p_actor: actor,
      });
      return reply({ id });
    }
    if (action === "vote")
      return reply(
        await rpc("secure_guest_vote", { p_id: input.id, p_actor: actor }),
      );
    if (action === "admin-unban")
      return reply({
        unbanned: await rpc("secure_guest_unban", { p_id: input.id }),
      });
    if (action === "admin-ban")
      return reply({
        banned: await rpc("secure_guest_ban", { p_id: input.id }),
      });
    let hash = "";
    if (!isAdmin) {
      const credentials = await rpc("secure_guest_secret", { p_id: input.id });
      if (
        !credentials ||
        !/^[a-f0-9]{32}$/.test(credentials.salt) ||
        !/^[a-f0-9]{64}$/.test(credentials.hash)
      )
        return reply({ error: "INVALID_PASSWORD" }, 403);
      hash = await passwordHash(input.password, credentials.salt);
      if (!equal(hash, credentials.hash)) {
        await rpc("secure_guest_activity", {
          p_id: input.id,
          p_action: "password_rejected",
          p_actor: actor,
        });
        return reply({ error: "INVALID_PASSWORD" }, 403);
      }
    }
    if (action === "edit") {
      const edited = await rpc("secure_guest_edit", {
        p_id: input.id,
        p_hash: hash,
        p_body: input.body.trim(),
        p_actor: actor,
      });
      if (!edited) return reply({ error: "INVALID_PASSWORD" }, 403);
      return reply({ edited: true });
    }
    const deleted = await rpc("secure_guest_delete", {
      p_id: input.id,
      p_hash: hash,
      p_admin: isAdmin,
    });
    if (!deleted) return reply({ error: "INVALID_PASSWORD" }, 403);
    await rpc("secure_guest_activity", {
      p_id: input.id,
      p_action: isAdmin ? "admin_delete" : "delete",
      p_actor: actor,
    });
    return reply({ deleted: true });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    const known = [
      "INVALID_CONTENT",
      "INVALID_PARENT",
      "BLOCKED_WORD",
      "ACCOUNT_BANNED",
      "THREAD_NOT_FOUND",
      "ENTRY_NOT_FOUND",
      "POST_PRIVATE",
      "GUEST_SETUP_REQUIRED",
      "REQUEST_TOO_LARGE",
    ].includes(code)
      ? code
      : "INVALID_CONTENT";
    return reply(
      { error: known },
      known === "GUEST_SETUP_REQUIRED"
        ? 503
        : known === "REQUEST_TOO_LARGE"
          ? 413
          : 400,
    );
  }
});
