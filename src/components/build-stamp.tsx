/**
 * Shows which build is actually being served. Vercel injects the commit it deployed,
 * so a stale page is recognisable at a glance instead of being guessed.
 */
export function BuildStamp() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const environment = process.env.VERCEL_ENV;

  return (
    <p className="mt-10 text-center text-[11px] text-text-subtle">
      {sha ? `Version ${sha}${environment ? ` · ${environment}` : ""}` : "Version locale"}
    </p>
  );
}
