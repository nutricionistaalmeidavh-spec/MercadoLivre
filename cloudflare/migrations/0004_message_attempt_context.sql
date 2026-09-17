ALTER TABLE message_attempts
ADD COLUMN context_json TEXT;

ALTER TABLE message_attempts
ADD COLUMN moderation_status TEXT;
