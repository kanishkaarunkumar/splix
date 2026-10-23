export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    const url = new URL(path, "splix://");
    const route =
      url.host === "review" ? `/review${url.pathname}` : url.pathname;
    if (/^\/review\/[a-zA-Z0-9-]{1,128}$/.test(route)) return route;
  } catch {}
  return "/Home";
}
