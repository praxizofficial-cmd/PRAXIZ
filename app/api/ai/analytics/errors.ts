export class AnalyticsDataQueryError extends Error {
  constructor() {
    super("Analytics data query failed");
    this.name = "AnalyticsDataQueryError";
  }
}

export function analyticsDataQueryFailure() {
  return {
    status: 503,
    body: {
      error:
        "Verified analytics data is temporarily unavailable. Please try again.",
      kind: "DATA_QUERY_FAILED",
      retryable: true,
    },
  } as const;
}
