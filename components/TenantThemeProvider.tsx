/**
 * TenantThemeProvider
 * ===================
 *
 * Server component that injects per-tenant CSS variables on the page so
 * the rest of the styling (which references `var(--brand-500)` etc.) picks
 * up the tenant's colors without any other code changes.
 *
 * Mount this at the root layout level, INSIDE <body>. It renders nothing
 * visible — just a <style> tag with :root overrides.
 */

import { tenantBrand } from '@/config/tenant.config'

export function TenantThemeProvider() {
  // Inject brand variables. Existing tokens (--primary, --shell-*) cascade
  // off --brand-500 / --brand-700, so overriding the three primitives is
  // enough to repaint the whole shell.
  const css = `
:root {
  --brand-500: ${tenantBrand.primaryColor};
  --brand-600: ${tenantBrand.primaryColorDark};
  --brand-700: ${tenantBrand.primaryColorDark};
  --tenant-accent: ${tenantBrand.accentColor};
}
`.trim()

  // dangerouslySetInnerHTML is intentional here — the values come from a
  // build-time TS config file, NOT user input, so XSS risk is zero.
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
