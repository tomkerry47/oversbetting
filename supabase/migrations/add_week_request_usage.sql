ALTER TABLE weeks
ADD COLUMN IF NOT EXISTS rapidapi_request_budget INT,
ADD COLUMN IF NOT EXISTS rapidapi_requests_used INT NOT NULL DEFAULT 0;
