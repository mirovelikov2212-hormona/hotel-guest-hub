begin;

update public.massage_runtime_services
set
  name_bg = null,
  name_en = null,
  name_de = null,
  name_ro = null,
  name_cs = null,
  name_ru = null,
  name_i18n = jsonb_build_object(
    'en', 'Relax massage',
    'es', 'Masaje relajante',
    'tr', 'Rahatlatıcı masaj',
    'ja', 'リラクゼーションマッサージ',
    'ar', 'تدليك للاسترخاء',
    'pt-BR', 'Massagem relaxante',
    'zh-Hans', '放松按摩'
  ),
  updated_at = now()
where hotel_id = '2a40d6fb-da53-461b-8432-2d9be0648721'::uuid
  and service_id = 'certification_relax';

commit;
