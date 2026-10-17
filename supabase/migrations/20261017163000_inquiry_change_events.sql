-- Inquiry changes and their delivery requests commit in one transaction.
alter table public.email_outbox
  add column event_type text,
  add column payload jsonb,
  add column idempotency_key text,
  add column schema_version integer;
alter table public.email_outbox
  add constraint email_outbox_event_type_check check (event_type is null or event_type in ('inquiry.received', 'inquiry.assigned', 'inquiry.status_changed', 'quote.requested')),
  add constraint email_outbox_payload_check check (payload is null or jsonb_typeof(payload) = 'object'),
  add constraint email_outbox_schema_version_check check (schema_version is null or schema_version = 1),
  add constraint email_outbox_event_fields_check check (
    (event_type is null and payload is null and idempotency_key is null and schema_version is null)
    or (event_type is not null and payload is not null and idempotency_key is not null and schema_version = 1)
  );
create unique index email_outbox_idempotency_key_idx on public.email_outbox(idempotency_key) where idempotency_key is not null;

-- API callers cannot bypass event insertion with a direct status or assignee PATCH.
revoke update(status, assignee_id) on public.inquiries from authenticated;

create function private.apply_inquiry_change(
  p_id uuid, p_status text, p_assignee_id uuid, p_change_assignee boolean, p_admin_url text
) returns public.inquiries
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.inquiries%rowtype;
  v_after public.inquiries%rowtype;
  v_email text;
  v_event uuid;
  v_payload jsonb;
  v_type text;
begin
  if auth.uid() is null or private.current_admin_role() is null then
    raise exception 'Inquiry change denied' using errcode = '42501';
  end if;
  if p_status is null and not p_change_assignee then
    raise exception 'Change required' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('new', 'consulting', 'completed', 'cancelled') then
    raise exception 'Invalid inquiry status' using errcode = '22023';
  end if;
  select * into v_before from public.inquiries where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Inquiry unavailable' using errcode = 'P0002'; end if;
  if p_change_assignee and p_assignee_id is not null then
    select u.email into v_email from public.admin_profiles a
      join auth.users u on u.id = a.user_id
      where a.user_id = p_assignee_id and a.role = 'staff' and a.active;
    if v_email is null or v_email !~ '^[^@[:space:],;<>]+@[^@[:space:],;<>]+\.[^@[:space:],;<>]+$' or length(v_email) > 254 then
      raise exception 'Active staff email required' using errcode = '22023';
    end if;
    if p_admin_url is null or p_admin_url !~ '^https?://[^[:space:]/?#]+(/[^[:space:]]*)?$'
       or length(p_admin_url) > 2048 then
      raise exception 'Invalid admin URL' using errcode = '22023';
    end if;
  end if;
  if (p_status is null or p_status = v_before.status)
     and (not p_change_assignee or p_assignee_id is not distinct from v_before.assignee_id) then
    return v_before;
  end if;
  if ((p_status is not null and p_status is distinct from v_before.status and v_before.contact_email is not null)
      or (p_change_assignee and p_assignee_id is not null and p_assignee_id is distinct from v_before.assignee_id))
     and (v_before.contact_name ~ '[[:cntrl:]]'
       or (v_before.contact_email is not null and
         (v_before.contact_email !~ '^[^@[:space:],;<>]+@[^@[:space:],;<>]+\.[^@[:space:],;<>]+$'
          or length(v_before.contact_email) > 254))
       or (p_change_assignee and p_assignee_id is not null and v_before.contact_phone ~ '[[:cntrl:]]')) then
    raise exception 'Invalid inquiry email data' using errcode = '22023';
  end if;

  update public.inquiries set
    status = coalesce(p_status, v_before.status),
    assignee_id = case when p_change_assignee then p_assignee_id else v_before.assignee_id end
    where id = p_id returning * into v_after;

  if p_change_assignee and p_assignee_id is distinct from v_before.assignee_id then
    insert into public.audit_logs(actor_id, action, entity_table, entity_id, changes)
    values (auth.uid(), case when p_assignee_id is null then 'inquiry_unassigned' else 'inquiry_assigned' end,
      'inquiries', p_id, jsonb_build_object('before', jsonb_build_object('assignee_id', v_before.assignee_id),
        'after', jsonb_build_object('assignee_id', p_assignee_id)));
    if p_assignee_id is not null then
      v_type := 'inquiry.assigned';
      v_event := gen_random_uuid();
      v_payload := jsonb_build_object('inquiryId', p_id, 'template', 'consultant_assignment',
        'data', jsonb_build_object('to', v_email, 'inquiryId', p_id, 'customerName', v_after.contact_name,
          'customerPhone', v_after.contact_phone, 'adminUrl', p_admin_url));
      if v_after.contact_email is not null then
        v_payload := jsonb_set(v_payload, '{data,customerEmail}', to_jsonb(v_after.contact_email));
      end if;
      insert into public.email_outbox(event_id, inquiry_id, event_type, payload, idempotency_key, schema_version)
      values (v_event, p_id, v_type, v_payload,
        encode(sha256(convert_to('email:v1', 'UTF8') || decode('00', 'hex') || convert_to(v_type, 'UTF8') || decode('00', 'hex') || convert_to(v_event::text, 'UTF8')), 'hex'), 1);
    end if;
  end if;

  if p_status is not null and p_status is distinct from v_before.status and v_after.contact_email is not null then
    v_type := 'inquiry.status_changed';
    v_event := gen_random_uuid();
    v_payload := jsonb_build_object('inquiryId', p_id, 'template', 'status_update',
      'data', jsonb_build_object('to', v_after.contact_email, 'recipient', 'customer',
        'inquiryId', p_id, 'customerName', v_after.contact_name, 'status', v_after.status,
        'previousStatus', v_before.status, 'reference', v_after.reference));
    insert into public.email_outbox(event_id, inquiry_id, event_type, payload, idempotency_key, schema_version)
    values (v_event, p_id, v_type, v_payload,
      encode(sha256(convert_to('email:v1', 'UTF8') || decode('00', 'hex') || convert_to(v_type, 'UTF8') || decode('00', 'hex') || convert_to(v_event::text, 'UTF8')), 'hex'), 1);
  end if;
  return v_after;
end;
$$;

create function public.change_inquiry_assignment(p_id uuid, p_assignee_id uuid, p_admin_url text)
returns public.inquiries language sql security definer set search_path = '' as $$
  select private.apply_inquiry_change(p_id, null, p_assignee_id, true, p_admin_url);
$$;
create function public.change_inquiry_status(p_id uuid, p_status text, p_assignee_id uuid default null, p_change_assignee boolean default false, p_admin_url text default null)
returns public.inquiries language sql security definer set search_path = '' as $$
  select private.apply_inquiry_change(p_id, p_status, p_assignee_id, p_change_assignee, p_admin_url);
$$;
revoke all on function private.apply_inquiry_change(uuid,text,uuid,boolean,text) from public, anon, authenticated;
revoke all on function public.change_inquiry_assignment(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.change_inquiry_status(uuid,text,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.change_inquiry_assignment(uuid,uuid,text) to authenticated;
grant execute on function public.change_inquiry_status(uuid,text,uuid,boolean,text) to authenticated;
