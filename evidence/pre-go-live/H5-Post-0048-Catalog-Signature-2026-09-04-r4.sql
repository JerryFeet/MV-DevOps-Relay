-- Normalized semantic catalog signature used to compare frozen Development
-- with a fresh template0 database replayed from 0000_baseline.sql.
-- Physical pg_attribute.attnum values are intentionally excluded because a
-- schema-only replay cannot preserve dropped-column ordinal gaps.
WITH entries(category, object_key, definition) AS (
  SELECT 'relation', c.relname,
         concat_ws('|', c.relkind, c.relpersistence, c.relispartition,
                   coalesce(pg_get_expr(c.relpartbound, c.oid, true), ''))
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  UNION ALL
  SELECT 'column', c.relname || '.' || a.attname,
         concat_ws('|', format_type(a.atttypid, a.atttypmod), a.attnotnull,
                   coalesce(pg_get_expr(ad.adbin, ad.adrelid, true), ''),
                   a.attidentity, a.attgenerated, a.attisdropped)
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND a.attnum > 0
    AND NOT a.attisdropped
  UNION ALL
  SELECT 'constraint', c.relname || '.' || con.conname,
         concat_ws('|', con.contype, con.condeferrable, con.condeferred,
                   con.convalidated, pg_get_constraintdef(con.oid, true))
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'index', tbl.relname || '.' || idx.relname, pg_get_indexdef(idx.oid)
  FROM pg_index i
  JOIN pg_class idx ON idx.oid = i.indexrelid
  JOIN pg_class tbl ON tbl.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = tbl.relnamespace
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'trigger', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid, true)
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal
  UNION ALL
  SELECT 'function',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'enum', t.typname || '.' || e.enumsortorder, e.enumlabel
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'sequence', c.relname,
         concat_ws('|', format_type(s.seqtypid, NULL), s.seqstart,
                   s.seqincrement, s.seqmax, s.seqmin, s.seqcache, s.seqcycle)
  FROM pg_sequence s
  JOIN pg_class c ON c.oid = s.seqrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
)
SELECT category || E'\t' || object_key || E'\t'
       || encode(convert_to(definition, 'UTF8'), 'base64')
FROM entries
ORDER BY category, object_key, definition;