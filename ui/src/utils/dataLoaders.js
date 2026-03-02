export const buildFsUrl = (relativePath) => {
  // __DATA_ROOT__ is injected by vite.config.js (points to the project root,
  // i.e. the parent of the ui/ folder). Fall back to the env var if someone
  // overrides it via ui/.env, or to "" as a last resort.
  const root =
    (typeof __DATA_ROOT__ !== "undefined" ? __DATA_ROOT__ : null) ||
    import.meta.env.VITE_DATA_ROOT ||
    "";
  const cleanedRelative = relativePath.replace(/^\/+/, "");

  if (!root) {
    return `/${cleanedRelative}`;
  }

  const normalizedRoot = root.endsWith("/") ? root.slice(0, -1) : root;
  return `/@fs${normalizedRoot}/${cleanedRelative}`;
};

export const fetchJson = async (relativePath) => {
  const response = await fetch(buildFsUrl(relativePath));
  if (!response.ok) {
    throw new Error(`Failed to load ${relativePath}`);
  }
  return response.json();
};

export const fetchText = async (relativePath) => {
  const response = await fetch(buildFsUrl(relativePath));
  if (!response.ok) {
    throw new Error(`Failed to load ${relativePath}`);
  }
  return response.text();
};
