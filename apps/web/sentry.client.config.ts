import * as Sentry from "@sentry/nextjs";

const rc = typeof window !== 'undefined' ? (window as any).__RUNTIME_CONFIG__ || {} : {};
const SENTRY_DSN = rc.NEXT_PUBLIC_LAUNCHLMS_SENTRY_DSN || process.env.NEXT_PUBLIC_LAUNCHLMS_SENTRY_DSN;
const LAUNCHLMS_ENV = rc.NEXT_PUBLIC_LAUNCHLMS_ENV || process.env.NEXT_PUBLIC_LAUNCHLMS_ENV || "dev";

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tunnel: '/monitoring',
    environment: LAUNCHLMS_ENV,
    // No IP addresses, cookies or request bodies go to error reporting (DEV-26).
    sendDefaultPii: false,
    enableLogs: true,
    tracesSampleRate: LAUNCHLMS_ENV === "dev" ? 1.0 : 0.1,
    // No session replays: a replay records what was on a learner's screen (DEV-26).
    beforeSend(event, hint) {
      const msg =
        (hint?.originalException as Error)?.message ??
        event?.exception?.values?.[0]?.value ??
        "";

      if (msg.includes("Failed to find Server Action")) return null;
      if (msg.includes("Organization not found")) return null;
      if (msg.includes("Organization has no config")) return null;

      return event;
    },
  });
}
