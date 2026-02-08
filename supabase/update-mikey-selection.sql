-- ============================================================
-- Update Mikey's Selection - Change from Hull City to Zulte Waregem
-- ============================================================
-- Run this in Supabase SQL Editor

-- First, check if the new fixture exists and get the week_id
DO $$
DECLARE
    v_week_id INT;
    v_new_fixture_id INT;
    v_old_fixture_id INT;
BEGIN
    -- Get the week_id from the old fixture (Hull City)
    SELECT week_id, id INTO v_week_id, v_old_fixture_id
    FROM fixtures
    WHERE api_fixture_id = 14059822
    LIMIT 1;

    IF v_week_id IS NULL THEN
        RAISE EXCEPTION 'Could not find week for fixture 14059822';
    END IF;

    RAISE NOTICE 'Found week_id: %, old fixture_id: %', v_week_id, v_old_fixture_id;

    -- Check if new fixture already exists
    SELECT id INTO v_new_fixture_id
    FROM fixtures
    WHERE api_fixture_id = 14032401;

    -- If new fixture doesn't exist, insert it
    IF v_new_fixture_id IS NULL THEN
        RAISE NOTICE 'Inserting new fixture 14032401';
        INSERT INTO fixtures (
            api_fixture_id,
            week_id,
            home_team,
            away_team,
            home_team_logo,
            away_team_logo,
            league_name,
            league_id,
            kick_off,
            home_score,
            away_score,
            match_status
        ) VALUES (
            14032401,
            v_week_id,
            'SV Zulte Waregem',
            'FCV Dender',
            'https://api.sofascore.com/api/v1/team/0/image',
            'https://api.sofascore.com/api/v1/team/0/image',
            'Belgian First Division B',
            0,
            '2026-02-07 15:00:00',
            1,
            0,
            'FT'
        )
        RETURNING id INTO v_new_fixture_id;
    ELSE
        RAISE NOTICE 'Fixture 14032401 already exists with id: %', v_new_fixture_id;
    END IF;

    -- Update Mikey's selection
    UPDATE selections
    SET 
        fixture_id = v_new_fixture_id,
        total_goals = 1,
        result = 'lost'  -- 1 goal = lost (under 2.5)
    WHERE player_name = 'Mikey'
        AND fixture_id = v_old_fixture_id;

    RAISE NOTICE 'Updated Mikeys selection to new fixture';

    -- Recalculate fines if needed (1 goal = £2 fine)
    -- First delete any existing fine for the old fixture
    DELETE FROM fines
    WHERE week_id = v_week_id
        AND player_name = 'Mikey'
        AND fixture_id = v_old_fixture_id;

    -- Insert new fine for 1 goal game
    INSERT INTO fines (week_id, player_name, amount, reason, fixture_id)
    VALUES (
        v_week_id,
        'Mikey',
        2,
        '1 goal: SV Zulte Waregem 1-0 FCV Dender',
        v_new_fixture_id
    );

    RAISE NOTICE 'Updated fine for 1 goal game';
END $$;

-- Verify the changes
SELECT 
    s.player_name,
    f.home_team,
    f.away_team,
    f.home_score,
    f.away_score,
    s.total_goals,
    s.result
FROM selections s
JOIN fixtures f ON s.fixture_id = f.id
WHERE s.player_name = 'Mikey'
    AND f.api_fixture_id = 14032401;

-- Show Mikey's fines
SELECT * FROM fines
WHERE player_name = 'Mikey'
ORDER BY created_at DESC
LIMIT 5;
