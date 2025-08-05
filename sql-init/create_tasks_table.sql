CREATE TABLE google_tasks_integration(
    id SERIAL NOT NULL,
    user_email varchar(255) NOT NULL,
    access_token text NOT NULL,
    refresh_token text,
    token_type varchar(50) DEFAULT 'Bearer'::character varying,
    expires_at timestamp without time zone,
    scope text,
    task_info jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id)
);
CREATE UNIQUE INDEX google_tasks_integration_user_email_key ON public.google_tasks_integration USING btree (user_email);
CREATE INDEX idx_google_tasks_user_email ON public.google_tasks_integration USING btree (user_email);
CREATE INDEX idx_google_tasks_active ON public.google_tasks_integration USING btree (is_active);
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE google_tasks_integration ADD CONSTRAINT google_tasks_integration_user_email_unique UNIQUE (user_email);