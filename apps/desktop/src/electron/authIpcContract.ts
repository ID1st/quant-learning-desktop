export const authIpcChannels = {
  bootstrap: "auth:bootstrap",
  requestRegistrationCode: "auth:requestRegistrationCode",
  register: "auth:register",
  login: "auth:login",
  redeemInvite: "auth:redeemInvite",
  renewEntitlement: "auth:renewEntitlement",
  requestPasswordReset: "auth:requestPasswordReset",
  resetPassword: "auth:resetPassword",
  logout: "auth:logout",
  getSnapshot: "auth:getSnapshot",
  stateChanged: "auth:stateChanged",
  revalidate: "auth:revalidate",
} as const;
