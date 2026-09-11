# Core de automação

O core server-side usa SQLite local e criptografia AES-256-GCM. Nenhum serviço pago é necessário. O publisher legado continua compatível com o cookie `artisys_ml`; a automação usa tokens persistidos em `ml_tokens` quando `TOKEN_ENCRYPTION_KEY` está configurada.
