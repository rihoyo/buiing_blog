function open() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("buiing-blog-drafts", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("drafts");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function run(mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", mode),
      req = action(tx.objectStore("drafts"));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error || Error("DRAFT_STORAGE"));
    };
  });
}
export const draftStore = {
  get: (key) => run("readonly", (s) => s.get(key)),
  put: (key, value) => run("readwrite", (s) => s.put(value, key)),
  delete: (key) => run("readwrite", (s) => s.delete(key)),
  list: async (owner) =>
    (await run("readonly", (s) => s.getAll()))
      .filter((d) => d?.owner === owner)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
};
