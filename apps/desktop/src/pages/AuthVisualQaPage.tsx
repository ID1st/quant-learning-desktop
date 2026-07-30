import { useEffect } from "react";
import type { AuthPhase } from "@quant/shared";

import { useAuthStore } from "../features/auth/authStore";
import { LoginPage } from "./LoginPage";

const visualQaPhases = new Set<AuthPhase>([
  "SIGNED_OUT",
  "LOGIN",
  "REGISTERING",
  "INVITE_REQUIRED",
  "ENTITLEMENT_EXPIRED",
  "RESET_REQUEST",
  "RESET_PASSWORD",
  "SERVICE_UNAVAILABLE",
]);

export function AuthVisualQaPage() {
  const requestedPhase =
    new URLSearchParams(window.location.search).get("auth-visual-qa") ??
    "LOGIN";
  const phase = visualQaPhases.has(requestedPhase as AuthPhase)
    ? (requestedPhase as AuthPhase)
    : "LOGIN";

  useEffect(() => {
    useAuthStore.setState({
      phase,
      session: null,
      errorCode: null,
      isSubmitting: false,
    });
  }, [phase]);

  return <LoginPage />;
}
