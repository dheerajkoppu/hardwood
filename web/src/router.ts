import { useMemo, useSyncExternalStore } from "react";

export interface Route {
  path: string;
  parameters: URLSearchParams;
}

type RouteParameters = Record<string, string | undefined>;

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function currentHash(): string {
  return window.location.hash;
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, currentHash);
  return useMemo(() => {
    const [path, query = ""] = (hash.replace(/^#/, "") || "/").split("?");
    return { path, parameters: new URLSearchParams(query) };
  }, [hash]);
}

export function linkTo(path: string, parameters: RouteParameters = {}): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(parameters)) {
    if (value !== undefined) query.set(name, value);
  }
  const queryText = query.toString();
  return `#${path}${queryText ? `?${queryText}` : ""}`;
}

export function navigate(
  path: string,
  parameters: RouteParameters = {},
  replace = false,
): void {
  const target = linkTo(path, parameters);
  if (replace) window.location.replace(target);
  else window.location.hash = target;
}
