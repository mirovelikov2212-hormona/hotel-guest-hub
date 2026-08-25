begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $fix$
declare
  v_authority text;
  v_old text;
  v_new text;
begin
  v_authority := pg_get_functiondef(
    'public.get_factory_production_relational_authority_v1(uuid,uuid,text)'::regprocedure
  );

  if position('P2_6_4_RELATIONAL_AUTHORITY_EMPTY' in v_authority)=0
     or position('jsonb_object_agg(r.room_number' in v_authority)=0
     or position('jsonb_object_agg(d.code' in v_authority)=0
     or position('jsonb_object_agg(rr.request_type' in v_authority)=0 then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_JSONB_SOURCE_MISMATCH';
  end if;

  v_old := $old$  if coalesce(jsonb_object_length(v_room_map),0)=0
     or coalesce(jsonb_object_length(v_department_map),0)=0
     or coalesce(jsonb_object_length(v_routing_map),0)=0 then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_EMPTY';
  end if;$old$;

  v_new := $new$  if coalesce(v_room_map,'{}'::jsonb)='{}'::jsonb
     or coalesce(v_department_map,'{}'::jsonb)='{}'::jsonb
     or coalesce(v_routing_map,'{}'::jsonb)='{}'::jsonb then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_EMPTY';
  end if;$new$;

  if position(v_old in v_authority)=0 then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_JSONB_BLOCK_MISMATCH';
  end if;

  v_authority := replace(v_authority,v_old,v_new);

  if position('jsonb_object_length' in v_authority)>0
     or position("coalesce(v_room_map,'{}'::jsonb)='{}'::jsonb" in v_authority)=0
     or position("coalesce(v_department_map,'{}'::jsonb)='{}'::jsonb" in v_authority)=0
     or position("coalesce(v_routing_map,'{}'::jsonb)='{}'::jsonb" in v_authority)=0
     or position('P2_6_4_RELATIONAL_AUTHORITY_EMPTY' in v_authority)=0 then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_JSONB_REWRITE_FAILED';
  end if;

  execute v_authority;
end;
$fix$;

do $guard$
declare
  v_authority text := pg_get_functiondef(
    'public.get_factory_production_relational_authority_v1(uuid,uuid,text)'::regprocedure
  );
begin
  if position('jsonb_object_length' in v_authority)>0
     or position("coalesce(v_room_map,'{}'::jsonb)='{}'::jsonb" in v_authority)=0
     or position("coalesce(v_department_map,'{}'::jsonb)='{}'::jsonb" in v_authority)=0
     or position("coalesce(v_routing_map,'{}'::jsonb)='{}'::jsonb" in v_authority)=0
     or position('P2_6_4_RELATIONAL_AUTHORITY_LIVE_STATE_INVALID' in v_authority)=0
     or position('P2_6_4_RELATIONAL_AUTHORITY_RESOURCE_DRIFT' in v_authority)=0
     or position('P2_6_4_RELATIONAL_AUTHORITY_ROUTING_DUPLICATE' in v_authority)=0 then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_JSONB_GUARD_FAILED';
  end if;
end;
$guard$;

commit;
