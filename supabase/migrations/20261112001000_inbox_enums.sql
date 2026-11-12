-- =============================================================================
-- Inbox and chat intake (Build 9), part 1: enum types.
--
-- Kept in their own migration: a value added to an existing enum cannot be
-- used in the same transaction that adds it.
-- =============================================================================

-- Where an Inbox entry came from. WEB is live now; the others are reserved so
-- WhatsApp / SMS messages and phone-call summaries can land in the same Inbox
-- later without a schema change.
create type public.inbox_channel as enum ('WEB', 'PHONE', 'WHATSAPP', 'SMS', 'EMAIL');

-- The only three states the operator manages.
create type public.inbox_status as enum ('NEW', 'NEEDS_REPLY', 'DONE');

-- How the customer would like to be contacted.
create type public.contact_method as enum ('PHONE', 'WHATSAPP', 'SMS', 'EMAIL');

-- What kind of entry sits on an Inbox card.
--   INTAKE        chat intake on the website
--   FORM          the secondary request form
--   CONTACT_FORM  the contact page form
--   MESSAGE       an incoming message (future: WhatsApp / SMS / email)
--   CALL          a phone call or missed-call summary (future)
--   LEGACY        copied from the old enquiries table
create type public.inbox_entry_kind as enum ('INTAKE', 'FORM', 'CONTACT_FORM', 'MESSAGE', 'CALL', 'LEGACY');

create type public.notification_status as enum ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

alter type public.related_type add value if not exists 'INBOX_ITEM';
