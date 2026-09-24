-- `app_register_user` passa a devolver o identificador da conta criada.
--
-- A versão anterior retornava void, e um retorno void não atravessa a camada de
-- deserialização do cliente. Devolver o id também torna o contrato mais útil: quem
-- registra já sabe exatamente qual conta foi criada, sem segunda consulta.
--
-- Mudar tipo de retorno exige DROP antes (o Postgres recusa `create or replace` nesse
-- caso). O drop leva embora os privilégios da função, então rode
-- `psql "$MIGRATE_DATABASE_URL" -f scripts/setup-db.sql` depois desta migração.

drop function if exists app_register_user(uuid, text, text);

create function app_register_user(
  p_id uuid,
  p_email text,
  p_password_hash text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into users (id, email, password_hash) values (p_id, lower(p_email), p_password_hash);
  return p_id;
exception
  when unique_violation then
    raise exception 'email_already_registered' using errcode = '23505';
end;
$$;

revoke all on function app_register_user(uuid, text, text) from public;
