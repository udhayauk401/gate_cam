const API_URL = import.meta.env.VITE_API_URL || "/api";

export async function api(path, options = {}) {
  const headers = { ...options.headers };
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...options,
    headers,
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined
  });
  const responseText = await response.text();
  let result = {};
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      if (response.ok) {
        throw new Error(`The API returned an unreadable response for ${path}.`);
      }
    }
  }
  if (!response.ok) {
    throw new Error(result.message || `Request failed with HTTP ${response.status} at ${path}.`);
  }
  return result;
}

export function fileUrl(filename) {
  return filename ? `${API_URL}/files/${encodeURIComponent(filename)}` : "";
}
