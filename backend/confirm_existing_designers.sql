-- Run this in Supabase Dashboard → SQL Editor
-- Confirms all existing unconfirmed designer accounts so they can sign in immediately.

UPDATE auth.users
SET
  email_confirmed_at = now(),
  confirmation_token = '',
  confirmation_sent_at = NULL,
  updated_at = now()
WHERE
  email_confirmed_at IS NULL
  AND email IN (
    SELECT email FROM public.designers
  );
