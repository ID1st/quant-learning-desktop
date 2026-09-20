export type AuthBootstrapDeadlineResult<T> =
  { ok: true; value: T } | { ok: false; reason: "rejected" | "timeout" };

export async function runAuthBootstrapWithDeadline<T>(
  bootstrap: () => Promise<T>,
  timeoutMilliseconds = 15_000,
): Promise<AuthBootstrapDeadlineResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<AuthBootstrapDeadlineResult<T>>((resolve) => {
    timeoutId = setTimeout(() => resolve({ ok: false, reason: "timeout" }), timeoutMilliseconds);
  });

  const operation = bootstrap().then<
    AuthBootstrapDeadlineResult<T>,
    AuthBootstrapDeadlineResult<T>
  >(
    (value) => ({ ok: true, value }),
    () => ({ ok: false, reason: "rejected" }),
  );

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
