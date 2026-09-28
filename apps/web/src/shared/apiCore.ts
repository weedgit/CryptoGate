export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  "/v1";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

const SERVER_ERROR_MESSAGE = "Something went wrong on the server. Please try again.";

/** Throws an `ApiError` built from a non-OK response (code, friendly message, details). */
export async function parseError(res: Response): Promise<never> {
  const body = await res.text();
  try {
    const json = JSON.parse(body) as {
      code?: string;
      message?: string;
      error?: string;
      details?: unknown;
    };
    const raw = json.message?.trim() || json.error?.trim() || "";
    const friendly =
      res.status >= 500 ? SERVER_ERROR_MESSAGE : raw || `Request failed (${res.status})`;
    throw new ApiError(json.code ?? "http_error", friendly, res.status, json.details);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const friendly =
      res.status >= 500
        ? SERVER_ERROR_MESSAGE
        : body?.trim() || `Request failed (${res.status})`;
    throw new ApiError("http_error", friendly, res.status);
  }
}
