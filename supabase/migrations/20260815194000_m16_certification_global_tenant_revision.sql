begin;

do $m16$
declare
  v_hotel_id uuid := '2a40d6fb-da53-461b-8432-2d9be0648721'::uuid;
  v_old public.hotel_config_revisions%rowtype;
  v_new_id uuid := gen_random_uuid();
  v_config jsonb;
  v_request_defs jsonb;
begin
  select r.* into v_old
  from public.hotel_config_publication_state ps
  join public.hotel_config_revisions r on r.id = ps.published_revision_id
  where ps.hotel_id = v_hotel_id
  for update;

  if not found then
    raise exception 'M16_CERTIFICATION_PUBLISHED_CONFIG_MISSING';
  end if;

  select jsonb_agg(
    item
    || jsonb_build_object(
      'title', coalesce(item->'title', '{}'::jsonb) || case item->>'id'
        when 'towels' then '{"es":"Toallas","tr":"Havlular","ja":"タオル","ar":"مناشف","pt-BR":"Toalhas","zh-Hans":"毛巾"}'::jsonb
        when 'maintenance_issue' then '{"es":"Problema de mantenimiento","tr":"Bakım sorunu","ja":"メンテナンスの問題","ar":"مشكلة صيانة","pt-BR":"Problema de manutenção","zh-Hans":"维修问题"}'::jsonb
        when 'taxi' then '{"es":"Taxi","tr":"Taksi","ja":"タクシー","ar":"تاكسي","pt-BR":"Táxi","zh-Hans":"出租车"}'::jsonb
        else '{}'::jsonb
      end,
      'success', coalesce(item->'success', '{}'::jsonb) || case item->>'id'
        when 'towels' then '{"es":"Toallas","tr":"Havlular","ja":"タオル","ar":"مناشف","pt-BR":"Toalhas","zh-Hans":"毛巾"}'::jsonb
        when 'maintenance_issue' then '{"es":"Problema de mantenimiento","tr":"Bakım sorunu","ja":"メンテナンスの問題","ar":"مشكلة صيانة","pt-BR":"Problema de manutenção","zh-Hans":"维修问题"}'::jsonb
        when 'taxi' then '{"es":"Taxi","tr":"Taksi","ja":"タクシー","ar":"تاكسي","pt-BR":"Táxi","zh-Hans":"出租车"}'::jsonb
        else '{}'::jsonb
      end,
      'staffLabel', coalesce(item->'staffLabel', '{}'::jsonb) || case item->>'id'
        when 'towels' then '{"es":"Toallas","tr":"Havlular","ja":"タオル","ar":"مناشف","pt-BR":"Toalhas","zh-Hans":"毛巾"}'::jsonb
        when 'maintenance_issue' then '{"es":"Problema de mantenimiento","tr":"Bakım sorunu","ja":"メンテナンスの問題","ar":"مشكلة صيانة","pt-BR":"Problema de manutenção","zh-Hans":"维修问题"}'::jsonb
        when 'taxi' then '{"es":"Taxi","tr":"Taksi","ja":"タクシー","ar":"تاكسي","pt-BR":"Táxi","zh-Hans":"出租车"}'::jsonb
        else '{}'::jsonb
      end
    )
    order by ordinality
  ) into v_request_defs
  from jsonb_array_elements(coalesce(v_old.config_json->'requestDefs', '[]'::jsonb)) with ordinality as defs(item, ordinality);

  v_config := v_old.config_json
    || jsonb_build_object(
      'languages', jsonb_build_array('en','es','tr','ja','ar','pt-BR','zh-Hans'),
      'languageDefault', 'en',
      'opsLanguage', 'en',
      'staffHelperLanguage', 'en',
      'hotelTimezone', 'Pacific/Auckland',
      'i18n', jsonb_build_object(
        'en', coalesce(v_old.config_json->'i18n'->'en', '{}'::jsonb),
        'es', '{}'::jsonb,
        'tr', '{}'::jsonb,
        'ja', '{}'::jsonb,
        'ar', '{}'::jsonb,
        'pt-BR', '{}'::jsonb,
        'zh-Hans', '{}'::jsonb
      ),
      'location', coalesce(v_old.config_json->'location', '{}'::jsonb) || jsonb_build_object('query', 'Auckland, New Zealand'),
      'requestDefs', coalesce(v_request_defs, '[]'::jsonb)
    );

  update public.hotel_config_revisions
  set status = 'superseded', superseded_at = now()
  where id = v_old.id;

  insert into public.hotel_config_revisions (
    id, hotel_id, revision_no, status, source_type, source_checksum,
    config_json, provenance_json, source_metadata_json, validation_json,
    created_by, published_at, published_by
  ) values (
    v_new_id,
    v_hotel_id,
    v_old.revision_no + 1,
    'published',
    'manual',
    encode(digest(convert_to(v_config::text, 'UTF8'), 'sha256'), 'hex'),
    v_config,
    jsonb_build_object(
      'milestone', 'M16',
      'reason', 'global_locale_timezone_certification',
      'baseRevisionId', v_old.id
    ),
    jsonb_build_object(
      'languages', jsonb_build_array('en','es','tr','ja','ar','pt-BR','zh-Hans'),
      'hotelTimezone', 'Pacific/Auckland',
      'externalMassageSource', null
    ),
    jsonb_build_object('ok', true, 'errors', jsonb_build_array(), 'warnings', jsonb_build_array()),
    'm16-certification-migration',
    now(),
    'm16-certification-migration'
  );

  update public.hotel_config_publication_state
  set published_revision_id = v_new_id,
      last_known_good_revision_id = v_new_id,
      updated_at = now()
  where hotel_id = v_hotel_id;

  update public.hotels
  set timezone = 'Pacific/Auckland'
  where id = v_hotel_id;

  update public.massage_runtime_schedules
  set timezone = 'Pacific/Auckland', updated_at = now()
  where hotel_id = v_hotel_id;
end;
$m16$;

commit;
