// Management API only. Application Secret Keys cannot authorize this endpoint.
const ref = "eofdtqnnqgxaoykcbfrv";
try {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) { console.log("BLOCKED: SUPABASE_ACCESS_TOKEN unavailable; Auth settings unchanged."); process.exitCode = 2; }
  else {
    const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const get = async () => {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Management access failed");
      return response.json();
    };
    let config = await get();
    if (process.argv.includes("--apply")) {
      // Narrow patch: never rotate keys, change providers/SMTP or paid settings.
      const redirects = [...new Set(String(config.uri_allow_list ?? "").split(",").map((value) => value.trim()).filter(Boolean).concat("http://localhost:3000/auth/confirm"))].join(",");
      const patch = { jwt_exp: 900, disable_signup: true, refresh_token_rotation_enabled: true, security_refresh_token_reuse_interval: 10, password_min_length: 12,
        site_url: "http://localhost:3000", uri_allow_list: redirects };
      const response = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(patch), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Settings update failed");
      config = await get();
      if (Object.entries(patch).some(([name, value]) => config[name] !== value)) throw new Error("Settings verification failed");
    }
    console.log(JSON.stringify({ jwtSeconds: config.jwt_exp, signupDisabled: config.disable_signup,
      rotation: config.refresh_token_rotation_enabled, reuseSeconds: config.security_refresh_token_reuse_interval,
      minPasswordLength: config.password_min_length, siteUrl: config.site_url,
      redirectAllowlist: config.uri_allow_list, smtpConfigured: Boolean(config.smtp_host),
      senderConfigured: Boolean(config.smtp_admin_email), emailAutoConfirm: config.mailer_autoconfirm,
      recoveryTemplateConfigured: Boolean(config.mailer_templates_recovery_content),
      inviteTemplateConfigured: Boolean(config.mailer_templates_invite_content),
      totpEnrollmentEnabled: config.mfa_totp_enroll_enabled, totpVerificationEnabled: config.mfa_totp_verify_enabled,
    }, null, 2));
  }
} catch { console.error("FAIL: Management Auth configuration request. No credentials or response bodies printed."); process.exitCode = 1; }
