-- Record the email used to provision a staff profile. This gives retries a
-- durable, unique link to the Auth identity even if email delivery or the
-- profile write fails after Auth has created the user.
alter table public.admin_profiles
  add column invite_email text,
  add column invited_at timestamptz;

alter table public.admin_profiles
  add constraint admin_profiles_invite_email_valid check (
    invite_email is null or (
      invite_email = lower(btrim(invite_email)) and
      length(invite_email) between 3 and 254 and
      invite_email like '%@%'
    )
  );

create unique index admin_profiles_invite_email_unique
  on public.admin_profiles (invite_email) where invite_email is not null;
