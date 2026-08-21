-- Race-safe document number allocation (docs/03 §5). One row lock via
-- `insert ... on conflict do update`, callable only with the service role
-- (numbering_sequences has no policy for `authenticated` at all), so every
-- concurrent request serialises on the same row and can never receive the
-- same number twice — verified by the concurrency test in docs/10.

create or replace function public.allocate_document_number(
  p_business_id uuid,
  p_document_type text
) returns text
language plpgsql
as $$
declare
  v_settings numbering_settings%rowtype;
  v_period_key text;
  v_next integer;
  v_parts text[] := '{}';
  v_number text;
begin
  select * into v_settings from numbering_settings
    where business_id = p_business_id and document_type = p_document_type;

  if not found then
    -- A business created before numbering_settings existed for this type.
    insert into numbering_settings (business_id, document_type, prefix)
      values (p_business_id, p_document_type, upper(left(p_document_type, 3)))
      returning * into v_settings;
  end if;

  v_period_key := case v_settings.reset_frequency
    when 'yearly'  then to_char(now(), 'YYYY')
    when 'monthly' then to_char(now(), 'YYYY-MM')
    when 'daily'   then to_char(now(), 'YYYY-MM-DD')
    else 'ALL'
  end;

  insert into numbering_sequences (business_id, document_type, period_key, current_value)
  values (p_business_id, p_document_type, v_period_key, greatest(v_settings.start_number, 1))
  on conflict (business_id, document_type, period_key)
  do update set current_value = numbering_sequences.current_value + 1,
                updated_at = now()
  returning current_value into v_next;

  if v_settings.prefix <> '' then v_parts := array_append(v_parts, v_settings.prefix); end if;
  if v_settings.include_year then
    v_parts := array_append(v_parts,
      case v_settings.year_format when 'yy' then to_char(now(), 'YY') else to_char(now(), 'YYYY') end);
  end if;
  if v_settings.include_month then
    v_parts := array_append(v_parts, to_char(now(), 'MM'));
  end if;
  v_parts := array_append(v_parts, lpad(v_next::text, v_settings.padding, '0'));

  v_number := array_to_string(v_parts, v_settings.separator);
  if v_settings.suffix <> '' then v_number := v_number || v_settings.suffix; end if;

  return v_number;
end;
$$;

-- Callable only by the service role (backend), never directly by a client —
-- there is deliberately no grant to `authenticated` here.
revoke all on function public.allocate_document_number(uuid, text) from public;
grant execute on function public.allocate_document_number(uuid, text) to service_role;
