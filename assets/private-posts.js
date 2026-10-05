// This module never sends private content to GitHub or the public live-post table.
export async function loadPrivatePost(client, id) {
  const { data, error } = await client
    .from("owner_posts")
    .select("post,revision")
    .eq("id", id)
    .maybeSingle();
  if (error) throw Error("PRIVATE_SETUP_REQUIRED");
  if (!data) throw Error("POST_NOT_FOUND");
  return {
    post: await resolvePrivateImages(client, data.post),
    sha: data.revision,
    file: "private:" + id,
  };
}
export async function resolvePrivateImages(client, post) {
  const p = structuredClone(post);
  async function sign(path) {
    const { data, error } = await client.storage
      .from("blog-private-images")
      .createSignedUrl(path, 300);
    if (error) throw Error("PRIVATE_IMAGE_FAILED");
    return data.signedUrl;
  }
  for (const b of p.blocks || [])
    if (b.type === "image" && b.privateImagePath)
      b.src = await sign(b.privateImagePath);
  if (p.coverPrivateImagePath)
    p.coverImage = await sign(p.coverPrivateImagePath);
  return p;
}
export function privatePayload(post) {
  const safe = structuredClone(post);
  for (const b of safe.blocks) if (b.privateImagePath) b.src = "";
  if (safe.coverPrivateImagePath) delete safe.coverImage;
  safe.visibility = "private";
  safe.date ||= new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
  safe.updatedAt = new Date().toISOString();
  const text = safe.blocks
    .filter((b) => typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
  safe.excerpt = text.slice(0, 130);
  safe.minutes = Math.max(1, Math.ceil(text.length / 500));
  return safe;
}
export async function savePrivatePost(client, post, sha) {
  const safe = privatePayload(post);
  const { data, error } = await client.rpc("save_owner_post", {
    p_post: safe,
    p_expected_revision: sha,
  });
  if (error)
    throw Error(
      error.message.includes("EDIT_CONFLICT")
        ? "EDIT_CONFLICT"
        : "PRIVATE_SETUP_REQUIRED",
    );
  return {
    live: true,
    sha: data,
    url: new URL(
      "private-post/?id=" + encodeURIComponent(post.id),
      document.baseURI,
    ).href,
  };
}
