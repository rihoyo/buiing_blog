// Deploy as publish-post, with gateway JWT verification OFF: this function validates
// the bearer token with Supabase Auth and checks is_admin before every GitHub call.
const site = "https://rihoyo.github.io";
const headers = {
  "Access-Control-Allow-Origin": site,
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  Vary: "Origin",
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST")
    return respond({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const bearer = req.headers.get("Authorization") || "";
    if (!bearer.startsWith("Bearer "))
      return respond({ error: "LOGIN_REQUIRED" }, 401);
    const base = Deno.env.get("SUPABASE_URL")!,
      anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeaders = {
      Authorization: bearer,
      apikey: anon,
      "Content-Type": "application/json",
    };
    const [user, role] = await Promise.all([
      fetch(base + "/auth/v1/user", { headers: authHeaders }),
      fetch(base + "/rest/v1/rpc/is_admin", {
        method: "POST",
        headers: authHeaders,
        body: "{}",
      }),
    ]);
    if (!user.ok) return respond({ error: "LOGIN_REQUIRED" }, 401);
    if (!role.ok || (await role.json()) !== true)
      return respond({ error: "FORBIDDEN" }, 403);
    const token = Deno.env.get("BLOG_GITHUB_TOKEN");
    if (!token) return respond({ error: "PUBLISH_SETUP_REQUIRED" }, 503);
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 900000)
      return respond({ error: "POST_TOO_LARGE" }, 413);
    const input = JSON.parse(raw),
      file = input.file;
    if (input.post?.visibility === "private" && input.action !== "make-private")
      return respond({ error: "PRIVATE_POST_USE_OWNER_STORAGE" }, 400);
    if (
      typeof file !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}\.json$/.test(file)
    )
      return respond({ error: "INVALID_FILE" }, 400);
    const endpoint =
      "https://api.github.com/repos/rihoyo/buiing_blog/contents/posts/" + file;
    const gh = {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "buiing-blog-publisher",
      "Content-Type": "application/json",
    };
    const current = await fetch(endpoint + "?ref=main", { headers: gh });
    if (!current.ok && current.status !== 404)
      return respond({ error: "GITHUB_ACCESS_FAILED" }, 502);
    let old: any = null,
      sha: string | null = null;
    if (current.ok) {
      const data = await current.json();
      sha = data.sha;
      if (data.encoding === "none") {
        const rawFile = await fetch(endpoint + "?ref=main", {
          headers: { ...gh, Accept: "application/vnd.github.raw+json" },
        });
        if (!rawFile.ok) return respond({ error: "GITHUB_ACCESS_FAILED" }, 502);
        old = await rawFile.json();
      } else
        old = JSON.parse(
          new TextDecoder().decode(
            Uint8Array.from(atob(data.content.replace(/\s/g, "")), (c) =>
              c.charCodeAt(0),
            ),
          ),
        );
    }
    if (["make-private", "finish-private"].includes(input.action)) {
      let p: any;
      if (input.action === "make-private") {
        p = input.post;
        if (
          !old ||
          old.visibility === "withdrawn" ||
          !p ||
          p.visibility !== "private" ||
          p.id !== old.id
        )
          return respond({ error: "INVALID_POST" }, 400);
        if ((input.sha || null) !== sha)
          return respond({ error: "EDIT_CONFLICT" }, 409);
        p = {
          ...p,
          date: old.date,
          publicSourceFile: file,
          publicRemovalPending: true,
        };
        const stage = await fetch(
          base + "/rest/v1/rpc/stage_public_to_private",
          {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ p_post: p, p_file: file }),
          },
        );
        if (!stage.ok) {
          const error = await stage.json().catch(() => ({}));
          return respond(
            {
              error: String(error.message || "").includes("EDIT_CONFLICT")
                ? "EDIT_CONFLICT"
                : "PRIVACY_TRANSITION_SETUP_REQUIRED",
            },
            409,
          );
        }
      } else {
        if (
          typeof input.privateId !== "string" ||
          !/^[a-zA-Z0-9_-]{1,160}$/.test(input.privateId)
        )
          return respond({ error: "INVALID_POST" }, 400);
        const mine = await fetch(
          base +
            "/rest/v1/owner_posts?select=post,revision&id=eq." +
            encodeURIComponent(input.privateId),
          { headers: authHeaders },
        );
        if (!mine.ok) return respond({ error: "PRIVATE_SETUP_REQUIRED" }, 503);
        const rows = await mine.json();
        p = rows[0]?.post;
        if (
          !p ||
          p.visibility !== "private" ||
          p.publicSourceFile !== file ||
          (old && old.id !== p.id)
        )
          return respond({ error: "FORBIDDEN" }, 403);
      }
      const tombstone = {
        id: p.id,
        visibility: "withdrawn",
        date: p.date,
        updatedAt: new Date().toISOString(),
      };
      const text = JSON.stringify(tombstone, null, 2),
        bytes = new TextEncoder().encode(text);
      let bin = "";
      for (const byte of bytes) bin += String.fromCharCode(byte);
      let removalPending = true;
      try {
        const removed = await fetch(endpoint, {
          method: "PUT",
          headers: gh,
          body: JSON.stringify({
            message: "Make blog post private: " + p.id,
            content: btoa(bin),
            branch: "main",
            ...(sha ? { sha } : {}),
          }),
        });
        if (removed.ok) {
          const finished = await fetch(
            base + "/rest/v1/rpc/finish_owner_transition",
            {
              method: "POST",
              headers: authHeaders,
              body: JSON.stringify({ p_id: p.id, p_revision: p.revision }),
            },
          );
          removalPending = !(finished.ok && (await finished.json()) === true);
        }
      } catch {}
      return respond({
        live: true,
        sha: p.revision,
        removalPending,
        url: site + "/buiing_blog/private-post/?id=" + encodeURIComponent(p.id),
      });
    }
    if (old?.visibility === "withdrawn")
      return respond({ error: "POST_PRIVATE" }, 409);
    if (input.action === "load")
      return old
        ? respond({ post: old, sha, file })
        : respond({ error: "POST_NOT_FOUND" }, 404);
    if (input.action !== "publish")
      return respond({ error: "INVALID_ACTION" }, 400);
    if ((input.sha || null) !== sha)
      return respond({ error: "EDIT_CONFLICT" }, 409);
    const p = input.post;
    if (
      !p ||
      typeof p.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,160}$/.test(p.id) ||
      typeof p.title !== "string" ||
      !p.title.trim() ||
      p.title.length > 160 ||
      !Array.isArray(p.blocks) ||
      p.blocks.length < 1 ||
      p.blocks.length > 300
    )
      return respond({ error: "INVALID_POST" }, 400);
    if (old && old.id !== p.id)
      return respond({ error: "SLUG_IMMUTABLE" }, 400);
    if (!old && file !== p.id + ".json")
      return respond({ error: "INVALID_FILE" }, 400);
    if (!["Development", "Dev Notes", "Tutorial"].includes(p.category))
      return respond({ error: "INVALID_POST" }, 400);
    const blocks = [];
    for (const b of p.blocks) {
      if (["paragraph", "heading", "code", "markdown"].includes(b.type)) {
        if (typeof b.text !== "string" || b.text.length > 100000)
          return respond({ error: "INVALID_BLOCK" }, 400);
        const aliases = {
          xml: "html",
          sh: "bash",
          shell: "bash",
          py: "python",
          js: "javascript",
          ts: "typescript",
          yml: "yaml",
          c: "cpp",
          "c++": "cpp",
        };
        const candidate =
          aliases[String(b.language || "").toLowerCase()] ||
          String(b.language || "auto").toLowerCase();
        const language = [
          "auto",
          "plaintext",
          "html",
          "bash",
          "python",
          "javascript",
          "typescript",
          "css",
          "json",
          "sql",
          "yaml",
          "java",
          "cpp",
          "go",
          "rust",
        ].includes(candidate)
          ? candidate
          : "plaintext";
        blocks.push({
          type: b.type,
          text: b.text,
          ...(b.type === "code" ? { language } : {}),
        });
      } else if (b.type === "table") {
        if (
          !Array.isArray(b.rows) ||
          b.rows.length < 1 ||
          b.rows.length > 30 ||
          !Array.isArray(b.rows[0]) ||
          b.rows[0].length < 1 ||
          b.rows[0].length > 20 ||
          b.rows.some(
            (r: any) =>
              !Array.isArray(r) ||
              r.length !== b.rows[0].length ||
              r.some((c: any) => typeof c !== "string" || c.length > 10000),
          )
        )
          return respond({ error: "INVALID_BLOCK" }, 400);
        blocks.push({ type: "table", rows: b.rows, header: b.header === true });
      } else if (b.type === "image") {
        let u;
        try {
          u = new URL(b.src);
        } catch {
          return respond({ error: "INVALID_IMAGE" }, 400);
        }
        if (
          u.protocol !== "https:" ||
          u.username ||
          u.password ||
          typeof b.alt !== "string" ||
          b.alt.length > 500
        )
          return respond({ error: "INVALID_IMAGE" }, 400);
        blocks.push({ type: "image", src: u.href, alt: b.alt });
      } else if (b.type === "link") {
        let u;
        try {
          u = new URL(b.url);
        } catch {
          return respond({ error: "INVALID_LINK" }, 400);
        }
        if (
          !["http:", "https:"].includes(u.protocol) ||
          u.username ||
          u.password ||
          !["embed", "url", "mention", "bookmark"].includes(b.mode)
        )
          return respond({ error: "INVALID_LINK" }, 400);
        if (b.thumbnail) {
          let image;
          try {
            image = new URL(b.thumbnail);
          } catch {
            return respond({ error: "INVALID_IMAGE" }, 400);
          }
          if (image.protocol !== "https:" || image.username || image.password)
            return respond({ error: "INVALID_IMAGE" }, 400);
        }
        blocks.push({
          type: "link",
          url: u.href,
          mode: b.mode,
          title: String(b.title || u.hostname).slice(0, 160),
          description: String(b.description || "").slice(0, 500),
          thumbnail: String(b.thumbnail || "").slice(0, 2048),
        });
      } else if (b.type === "youtube") {
        let u;
        try {
          u = new URL(b.url);
        } catch {
          return respond({ error: "INVALID_VIDEO" }, 400);
        }
        let id;
        if (["youtu.be", "www.youtu.be"].includes(u.hostname))
          id = u.pathname.slice(1);
        else if (
          ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(
            u.hostname,
          )
        )
          id =
            u.searchParams.get("v") ||
            u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
        if (
          !/^[-\w]{11}$/.test(id || "") ||
          !["embed", "url", "mention", "bookmark"].includes(b.mode)
        )
          return respond({ error: "INVALID_VIDEO" }, 400);
        blocks.push({
          type: "youtube",
          url: "https://www.youtube.com/watch?v=" + id,
          mode: b.mode,
          title: String(b.title || "YouTube 동영상").slice(0, 160),
        });
      } else return respond({ error: "INVALID_BLOCK" }, 400);
    }
    if (p.coverImage) {
      let u;
      try {
        u = new URL(p.coverImage);
      } catch {
        return respond({ error: "INVALID_IMAGE" }, 400);
      }
      if (u.protocol !== "https:" || u.username || u.password)
        return respond({ error: "INVALID_IMAGE" }, 400);
    }
    const now = new Date().toISOString(),
      text = blocks
        .filter((b) => "text" in b)
        .map((b) => (b as any).text)
        .join("\n");
    const post = {
      id: p.id,
      title: p.title.trim(),
      category: p.category,
      tags: Array.isArray(p.tags)
        ? p.tags.slice(0, 20).map((t: unknown) => String(t).slice(0, 40))
        : [],
      date:
        old?.date ||
        new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
          new Date(),
        ),
      updatedAt: now,
      revision: p.revision,
      excerpt: text.slice(0, 130),
      minutes: Math.max(1, Math.ceil(text.length / 500)),
      art: [
        "code",
        "layers",
        "orb",
        "terminal",
        "type",
        "gradient",
        "blueprint",
        "grid",
        "window",
        "quote",
        "circuit",
        "waves",
      ].includes(p.art)
        ? p.art
        : old?.art || "code",
      ...(typeof p.artLabel === "string"
        ? { artLabel: p.artLabel.slice(0, 120) }
        : {}),
      ...(typeof p.artCaption === "string"
        ? { artCaption: p.artCaption.slice(0, 120) }
        : {}),
      ...(typeof p.artText === "string"
        ? { artText: p.artText.slice(0, 300) }
        : {}),
      ...(typeof p.artCodeText === "string"
        ? { artCodeText: p.artCodeText.slice(0, 80) }
        : {}),
      ...(typeof p.artTerminalText === "string"
        ? { artTerminalText: p.artTerminalText.slice(0, 1000) }
        : {}),
      ...(p.coverImage
        ? {
            coverImage: p.coverImage,
            coverAlt: String(p.coverAlt || "").slice(0, 500),
          }
        : {}),
      blocks,
    };
    if (typeof p.revision !== "string" || !/^[\w-]{1,100}$/.test(p.revision))
      return respond({ error: "INVALID_POST" }, 400);
    const filtered = await fetch(base + "/rest/v1/rpc/validate_blog_words", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ p_post: post }),
    });
    if (!filtered.ok) {
      const info = await filtered.json().catch(() => null);
      return respond(
        {
          error: String(info?.message).includes("BLOCKED_WORD")
            ? "BLOCKED_WORD"
            : "COMMUNITY_UPGRADE_REQUIRED",
        },
        400,
      );
    }
    const bytes = new TextEncoder().encode(JSON.stringify(post, null, 2));
    let bin = "";
    for (const byte of bytes) bin += String.fromCharCode(byte);
    const saved = await fetch(endpoint, {
      method: "PUT",
      headers: gh,
      body: JSON.stringify({
        message: (old ? "Update" : "Publish") + " blog post: " + post.id,
        content: btoa(bin),
        branch: "main",
        ...(sha ? { sha } : {}),
      }),
    });
    if (saved.status === 409 || saved.status === 422)
      return respond({ error: "EDIT_CONFLICT" }, 409);
    if (!saved.ok) return respond({ error: "GITHUB_WRITE_FAILED" }, 502);
    const result = await saved.json();
    let live = false;
    try {
      const sync = await fetch(base + "/rest/v1/rpc/sync_published_post", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ p_post: post, p_file: file }),
      });
      live = sync.ok && (await sync.json()) === true;
    } catch {}
    return respond({
      live,
      sha: result.content.sha,
      revision: post.revision,
      url: site + "/buiing_blog/posts/" + post.id + "/",
      actionsUrl: "https://github.com/rihoyo/buiing_blog/actions",
    });
  } catch {
    return respond({ error: "PUBLISH_FAILED" }, 500);
  }
});
