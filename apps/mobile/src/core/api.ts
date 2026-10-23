export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export class Api {
  private token?: string;
  setToken(value: string | undefined) {
    this.token = value;
  }
  constructor(public baseUrl: string) {
    if (
      !/^https:\/\//.test(baseUrl) &&
      !/^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/.test(baseUrl)
    )
      throw new Error(
        "Set EXPO_PUBLIC_API_URL to an HTTPS API address (or a local development address).",
      );
  }
  async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      key?: string;
      text?: boolean;
      anonymous?: boolean;
    } = {},
  ): Promise<T> {
    if (!path.startsWith("/api/v1/")) throw new Error("Invalid API path.");
    const token = this.token;
    const response = await fetch(this.baseUrl.replace(/\/$/, "") + path, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(!options.anonymous && token
          ? { Authorization: `Bearer ${token}` }
          : {}),
        ...(options.key ? { "Idempotency-Key": options.key } : {}),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(15000),
      credentials: "omit",
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        error.detail?.code || "REQUEST_FAILED",
        typeof error.detail?.message === "string"
          ? error.detail.message
          : `Request could not be completed (${response.status}). Check your entries and retry.`,
      );
    }
    if (response.status === 204) return undefined as T;
    return (options.text ? await response.text() : await response.json()) as T;
  }
}
