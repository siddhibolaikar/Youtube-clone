import type { NextApiRequest, NextApiResponse } from "next";

/** Throw from a handler to send a JSON error with a status code. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>
  ) {
    super(typeof body.error === "string" ? body.error : `HTTP ${status}`);
  }
}

export type ApiHandler<Req extends NextApiRequest = NextApiRequest> = (
  req: Req,
  res: NextApiResponse
) => Promise<unknown> | unknown;

/** Method guard + uniform error handling for API routes. */
export function withApi<Req extends NextApiRequest = NextApiRequest>(
  methods: string[],
  handler: ApiHandler<Req>
): ApiHandler<Req> {
  return async (req, res) => {
    if (!req.method || !methods.includes(req.method)) {
      res.setHeader("Allow", methods.join(", "));
      return res.status(405).json({ error: "Method not allowed" });
    }
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json(err.body);
      }
      console.error(`[api] ${req.method} ${req.url} failed:`, err);
      return res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  };
}

export function requireString(value: unknown, field: string, maxLength = 5000): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, { error: `${field} is required` });
  }
  if (value.length > maxLength) {
    throw new HttpError(400, { error: `${field} is too long` });
  }
  return value;
}
