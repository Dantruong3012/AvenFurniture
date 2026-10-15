-- Read-only schema signature shared by local PGlite and remote audit.
select jsonb_build_object(
  'columns', (select jsonb_agg(jsonb_build_array(table_schema,table_name,column_name,data_type,is_nullable,column_default) order by table_schema,table_name,ordinal_position)
    from information_schema.columns where table_schema in ('public','private')),
  'tables', (select jsonb_agg(jsonb_build_array(schemaname,tablename,rowsecurity) order by schemaname,tablename) from pg_tables where schemaname in ('public','private')),
  'constraints', (select jsonb_agg(jsonb_build_array(n.nspname,c.conname,c.contype,pg_get_constraintdef(c.oid)) order by n.nspname,c.conname)
    from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in ('public','private') and c.contype <> 'n'),
  'policies', (select jsonb_agg(jsonb_build_array(schemaname,tablename,policyname,roles,cmd,qual,with_check) order by schemaname,tablename,policyname) from pg_policies where schemaname in ('public','private')),
  'functions', (select jsonb_agg(jsonb_build_array(n.nspname,p.proname,p.prosecdef,p.proconfig,regexp_replace(trim(p.prosrc),'\s+',' ','g')) order by n.nspname,p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')),
  'indexes', (select jsonb_agg(jsonb_build_array(schemaname,tablename,indexname,indexdef) order by schemaname,tablename,indexname) from pg_indexes where schemaname in ('public','private'))
) as signature;
