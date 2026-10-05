// Share one in-flight configuration request across identity and public post loading.
let pending;
export function loadSiteConfig() {
  if (!pending)
    pending = fetch(new URL("config.json", document.baseURI))
      .then((response) => {
        if (!response.ok) throw Error("CONFIG");
        return response.json();
      })
      .catch((error) => {
        pending = null;
        throw error;
      });
  return pending;
}
