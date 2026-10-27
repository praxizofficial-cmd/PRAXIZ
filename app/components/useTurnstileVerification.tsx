"use client";

import { useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useTurnstileTheme } from "./useTurnstileTheme";

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
const configurationError =
  "Security verification is unavailable: NEXT_PUBLIC_TURNSTILE_SITE_KEY is not configured. Please contact PRAXIZ support.";

export function useTurnstileVerification() {
  const theme = useTurnstileTheme();
  // A token belongs to the widget that issued it. Changing appearance must
  // invalidate it immediately, before the replacement widget completes.
  const [verification, setVerification] = useState<{
    token: string;
    theme: typeof theme;
  } | null>(null);
  if (verification && verification.theme !== theme) setVerification(null);
  const [widgetError, setWidgetError] = useState("");
  const widget = useRef<TurnstileInstance | undefined>(null);
  const captchaToken = siteKey && verification?.theme === theme
    ? verification.token
    : "";

  function resetCaptcha() {
    setVerification(null);
    setWidgetError("");
    widget.current?.reset();
  }

  const verificationError = siteKey ? widgetError : configurationError;
  const securityVerification = (
    <div className="auth-turnstile">
      {siteKey && (
        <Turnstile
          key={theme}
          ref={widget}
          siteKey={siteKey}
          options={{ theme, size: "flexible", responseField: false }}
          scriptOptions={{ onError: () => {
            setVerification(null);
            setWidgetError("Security verification could not load. Please check your connection and reload this page.");
          } }}
          onSuccess={(token) => {
            setVerification({ token, theme });
            setWidgetError("");
          }}
          onExpire={() => setVerification(null)}
          onTimeout={() => setVerification(null)}
          onError={() => {
            setVerification(null);
            setWidgetError("Security verification could not load. Please retry or check your connection.");
          }}
          onUnsupported={() => {
            setVerification(null);
            setWidgetError("Security verification is not supported by this browser. Please use an updated browser.");
          }}
        />
      )}
      {verificationError && <p className="form-error" role="alert">{verificationError}</p>}
      {siteKey && widgetError && (
        <button type="button" className="table-link" onClick={resetCaptcha}>
          Retry security verification
        </button>
      )}
    </div>
  );

  return { captchaToken, resetCaptcha, securityVerification, verificationError };
}
