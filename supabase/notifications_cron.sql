-- ============================================================================
-- OREYACORESDELUXE - Notificações Automáticas de Validade (pg_cron + Webhook/Email)
-- ============================================================================

-- 1. Ativar a extensão pg_cron (caso permitida no plano Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Tabela de Registo de Notificações Enviadas (para evitar duplicados)
CREATE TABLE IF NOT EXISTS "NotificacaoLog" (
    id SERIAL PRIMARY KEY,
    tipoEntidade TEXT NOT NULL, -- 'Jangada', 'Colete', 'Extintor'
    entidadeId INT NOT NULL,
    serialOrReference TEXT NOT NULL,
    diasParaValidade INT NOT NULL,
    destinatario TEXT,
    estado TEXT NOT NULL DEFAULT 'PENDENTE', -- 'ENVIADO', 'ERRO'
    respostaApi TEXT,
    createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "NotificacaoLog_entidade_dias_idx" ON "NotificacaoLog" (tipoEntidade, entidadeId, diasParaValidade, createdAt);

-- 3. Função para detetar certificados a expirar (30, 15, 7 dias) e disparar notificações
CREATE OR REPLACE FUNCTION public.check_expiring_certificates()
returns void
language plpgsql
security definer
as $$
declare
    rec record;
    dias int;
    target_date date;
    days_array int[] := array[30, 15, 7, 1];
    d int;
    v_count int;
begin
    foreach d in array days_array
    loop
        target_date := current_date + d;

        -- A. Jangadas com certificado a expirar
        for rec in 
            SELECT id, serial, "dataProxInspecao", "clientEmail" 
            FROM "Jangada" 
            WHERE "dataProxInspecao" IS NOT NULL 
              AND date("dataProxInspecao") = target_date
        loop
            -- Verificar se ja foi notificado para este intervalo de dias nos ultimos 10 dias
            SELECT count(*) INTO v_count 
            FROM "NotificacaoLog" 
            WHERE tipoEntidade = 'Jangada' 
              AND entidadeId = rec.id 
              AND diasParaValidade = d 
              AND createdAt > (now() - interval '10 days');

            if v_count = 0 then
                INSERT INTO "NotificacaoLog" (tipoEntidade, entidadeId, serialOrReference, diasParaValidade, destinatario, estado)
                VALUES ('Jangada', rec.id, rec.serial, d, rec."clientEmail", 'PENDENTE');
                
                -- Opcional: Disparar webhook para endpoint Next.js que envia WhatsApp/Email
                -- PERF: net.http_post pode ser usado se a extensao http estiver ativa no Supabase
            end if;
        end loop;

        -- B. Coletes com validade próxima
        for rec in 
            SELECT id, serial, "dataProxInspecao" 
            FROM "Colete" 
            WHERE "dataProxInspecao" IS NOT NULL 
              AND date("dataProxInspecao") = target_date
        loop
            SELECT count(*) INTO v_count 
            FROM "NotificacaoLog" 
            WHERE tipoEntidade = 'Colete' 
              AND entidadeId = rec.id 
              AND diasParaValidade = d 
              AND createdAt > (now() - interval '10 days');

            if v_count = 0 then
                INSERT INTO "NotificacaoLog" (tipoEntidade, entidadeId, serialOrReference, diasParaValidade, destinatario, estado)
                VALUES ('Colete', rec.id, rec.serial, d, null, 'PENDENTE');
            end if;
        end loop;

    end loop;
end;
$$;

-- 4. Agendar execução diária às 08:00 AM via pg_cron
-- SELECT cron.schedule('check-expiring-certs-daily', '0 8 * * *', 'SELECT public.check_expiring_certificates();');
