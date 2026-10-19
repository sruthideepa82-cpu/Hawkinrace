package com.hawkins.nitrorun.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.hawkins.nitrorun.dto.CreateRaceRequest;
import com.hawkins.nitrorun.dto.CreateRaceResponse;
import com.hawkins.nitrorun.dto.RaceRecordResponse;
import com.hawkins.nitrorun.security.CurrentPlayer;
import com.hawkins.nitrorun.service.RaceService;

import jakarta.validation.Valid;

/**
 * Completed race records.
 *
 * <p>The player is taken from the session. There is no way to post a race under
 * another player, because the request body has no field for it.
 *
 * <p><b>{@code GET /api/races} no longer returns every race in the game.</b> It
 * returns the caller's own. The old behaviour was an open feed of every player's
 * results.
 */
@RestController
@RequestMapping("/api/races")
public class RaceController {

    /**
     * Optional client-generated key. A repeat with the same key returns the row
     * already stored rather than adding a second one.
     */
    private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";

    private final RaceService races;

    public RaceController(RaceService races) {
        this.races = races;
    }

    /**
     * {@code POST /api/races} -- record a completed race.
     *
     * <p>201 for a new row, and <b>200 for a replay</b> that matched an existing
     * idempotency key. The distinction is honest: the second one did not create
     * anything, and a client retrying after a dropped response needs to be able
     * to tell.
     */
    @PostMapping
    public ResponseEntity<CreateRaceResponse> create(
            @Valid @RequestBody CreateRaceRequest request,
            @RequestHeader(value = IDEMPOTENCY_HEADER, required = false) String idempotencyKey) {

        String playerId = CurrentPlayer.id();
        String key = normaliseKey(idempotencyKey);

        boolean replay = key != null && races.replayExists(playerId, key);
        CreateRaceResponse response = races.save(playerId, request, key);

        return ResponseEntity.status(replay ? HttpStatus.OK : HttpStatus.CREATED).body(response);
    }

    /** The caller's own races, newest first. */
    @GetMapping
    public List<RaceRecordResponse> mine() {
        return races.findMine(CurrentPlayer.id());
    }

    /** One of the caller's own races. Someone else's is reported as absent. */
    @GetMapping("/{raceId}")
    public RaceRecordResponse one(@PathVariable String raceId) {
        return races.findMineById(CurrentPlayer.id(), raceId);
    }

    /**
     * Rejects a key that is not a plausible UUID.
     *
     * <p>Not a security control -- the column is bounded and unique either way --
     * but a silently truncated key would be a confusing bug to chase later.
     */
    private static String normaliseKey(String raw) {
        if (raw == null) {
            return null;
        }
        String key = raw.trim();
        if (key.isEmpty()) {
            return null;
        }
        if (key.length() > 36 || !key.matches("^[A-Za-z0-9-]+$")) {
            throw new com.hawkins.nitrorun.exception.InvalidRaceResultException(
                    "Idempotency-Key must be a UUID-shaped string of at most 36 characters");
        }
        return key;
    }
}