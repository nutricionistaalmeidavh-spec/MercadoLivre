# Worker

O worker consome `webhook_events` persistidos em SQLite. Falhas transitórias (`429` e `5xx`) usam retry exponencial; falhas definitivas terminam em `DEAD` e exigem inspeção administrativa.
