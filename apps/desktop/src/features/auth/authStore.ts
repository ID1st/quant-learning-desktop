import { create } from "zustand";
import type {
  AuthErrorCode,
  AuthPhase,
  AuthSessionSnapshot,
  AuthStateSnapshot,
} from "@quant/shared";

import { appLocalDatabase } from "../persistence/localDatabase";

const LEGACY_SESSION_COLLECTION = "auth-session";
const ONBOARDING_COLLECTION = "auth-local-onboarding";
const PROFILE_BINDING_COLLECTION = "auth-local-profile-binding";
const STORAGE_VERSION = 1;

interface LocalOnboardingState {
  apiBound: boolean;
}

interface LocalProfileBinding {
  userId: string;
}

interface LegacySession {
  userId: string;
  apiBound: boolean;
}

interface AuthState {
  phase: AuthPhase;
  session: AuthSessionSnapshot | null;
  errorCode: AuthErrorCode | null;
  isSubmitting: boolean;
  apiBound: boolean;
  profileConflictUserId: string | null;
  pendingSession: AuthSessionSnapshot | null;
  applyAuthState: (state: AuthStateSnapshot) => void;
  setPhase: (phase: AuthPhase) => void;
  setErrorCode: (errorCode: AuthErrorCode | null) => void;
  setSubmitting: (isSubmitting: boolean) => void;
  setApiBound: (apiBound: boolean) => void;
  clearSession: () => void;
  acceptPendingProfileSwitch: () => void;
  clearProfileConflict: () => void;
}

function sanitizeLegacySession(value: unknown): LegacySession | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.userId !== "string" || typeof record.apiBound !== "boolean") {
    return null;
  }
  return {
    userId: record.userId,
    apiBound: record.apiBound,
  };
}

function sanitizeOnboarding(value: unknown): LocalOnboardingState | null {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as Record<string, unknown>).apiBound !== "boolean"
  ) {
    return null;
  }
  return {
    apiBound: (value as Record<string, boolean>).apiBound,
  };
}

function sanitizeProfileBinding(value: unknown): LocalProfileBinding | null {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as Record<string, unknown>).userId !== "string"
  ) {
    return null;
  }
  return {
    userId: (value as Record<string, string>).userId,
  };
}

function migrateLegacySession(): LocalOnboardingState {
  const existingOnboarding = appLocalDatabase.readDocument(ONBOARDING_COLLECTION, {
    version: STORAGE_VERSION,
    fallback: null as LocalOnboardingState | null,
    sanitize: sanitizeOnboarding,
  });
  const legacySession = appLocalDatabase.readDocument(LEGACY_SESSION_COLLECTION, {
    version: STORAGE_VERSION,
    fallback: null as LegacySession | null,
    sanitize: sanitizeLegacySession,
  });

  appLocalDatabase.removeDocument(LEGACY_SESSION_COLLECTION);
  const onboarding = existingOnboarding ?? {
    apiBound: legacySession?.apiBound ?? false,
  };
  appLocalDatabase.writeDocument(ONBOARDING_COLLECTION, STORAGE_VERSION, onboarding);
  return onboarding;
}

function readProfileBinding(): LocalProfileBinding | null {
  return appLocalDatabase.readDocument(PROFILE_BINDING_COLLECTION, {
    version: STORAGE_VERSION,
    fallback: null,
    sanitize: sanitizeProfileBinding,
  });
}

const initialOnboarding = migrateLegacySession();
let profileBinding = readProfileBinding();

function persistApiBound(apiBound: boolean): void {
  appLocalDatabase.writeDocument(ONBOARDING_COLLECTION, STORAGE_VERSION, {
    apiBound,
  } satisfies LocalOnboardingState);
}

function bindProfile(userId: string): void {
  profileBinding = { userId };
  appLocalDatabase.writeDocument(PROFILE_BINDING_COLLECTION, STORAGE_VERSION, profileBinding);
}

export const useAuthStore = create<AuthState>((set) => ({
  phase: "BOOTSTRAPPING",
  session: null,
  errorCode: null,
  isSubmitting: false,
  apiBound: initialOnboarding.apiBound,
  profileConflictUserId: null,
  pendingSession: null,
  applyAuthState: (nextState) => {
    const session = nextState.session;
    if (
      session &&
      (nextState.phase === "AUTHENTICATED_ONLINE" || nextState.phase === "AUTHENTICATED_OFFLINE")
    ) {
      if (!profileBinding) {
        bindProfile(session.userId);
      } else if (profileBinding.userId !== session.userId) {
        set({
          phase: nextState.phase,
          session: null,
          errorCode: nextState.errorCode,
          profileConflictUserId: profileBinding.userId,
          pendingSession: session,
        });
        return;
      }
    }
    set({
      phase: nextState.phase,
      session,
      errorCode: nextState.errorCode,
      profileConflictUserId: null,
      pendingSession: null,
    });
  },
  setPhase: (phase) => set({ phase, errorCode: null }),
  setErrorCode: (errorCode) => set({ errorCode }),
  setSubmitting: (isSubmitting) => set({ isSubmitting }),
  setApiBound: (apiBound) => {
    persistApiBound(apiBound);
    set({ apiBound });
  },
  clearSession: () =>
    set({
      phase: "SIGNED_OUT",
      session: null,
      errorCode: null,
      profileConflictUserId: null,
      pendingSession: null,
    }),
  acceptPendingProfileSwitch: () =>
    set((state) => {
      if (!state.pendingSession) {
        return state;
      }
      bindProfile(state.pendingSession.userId);
      persistApiBound(false);
      return {
        session: state.pendingSession,
        pendingSession: null,
        profileConflictUserId: null,
        apiBound: false,
      };
    }),
  clearProfileConflict: () => set({ profileConflictUserId: null, pendingSession: null }),
}));
