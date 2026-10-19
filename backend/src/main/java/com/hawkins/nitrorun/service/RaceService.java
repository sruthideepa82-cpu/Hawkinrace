package com.hawkins.nitrorun.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.hawkins.nitrorun.dto.CreateRaceRequest;
import com.hawkins.nitrorun.dto.CreateRaceResponse;
import com.hawkins.nitrorun.dto.RaceRecordResponse;
import com.hawkins.nitrorun.exception.InvalidRaceResultException;
import com.hawkins.nitrorun.exception.ResourceNotFoundException;
import com.hawkins.nitrorun.model.Car;
import com.hawkins.nitrorun.model.Player;
import com.hawkins.nitrorun.model.Race;
import com.hawkins.nitrorun.model.Track;
import com.hawkins.nitrorun.repository.PlayerRepository;
import com.hawkins.nitrorun.repository.RaceRepository;
import com.hawkins.nitrorun.validation.GameId;

/**
 * Stores and reads completed race records.
 *
 * <p><b>What this can and cannot prove.</b> The player is authenticated, so the
 * record genuinely belongs to whoever signed in -- that part is now enforced and
 * was not before. But the <em>times are still whatever the browser reported</em>.
 * The game runs offline, so there is no server-side simulation to check them
 * against, and nothing here makes the leaderboard cheat-proof. What the checks
 * below do is reject results that are impossible on their face: a lap slower
 * than the race containing it, more laps than the track has, or a lap time no
 * car could physically drive.
 *
 * <p>Submitting twice with the same idempotency key is safe. The key is a client
 * choice, so this is a guard against a retry being stored twice rather than a
 * security control.
 */
@Service
@Transactional(readOnly = true)
public class RaceService {

    private static final Logger log = LoggerFactory.getLogger(RaceService.class);

    /**
     * Fastest plausible lap, in milliseconds.
     *
     * <p>The shortest track is about 6700px and the slowest car still averages
     * well over 400px/s, so a real lap is comfortably above 15 seconds. Ten
     * seconds leaves a wide margin for a future change to car speed while still
     * rejecting a submitted 0.4-second lap, which is what a client bug or a
     * hand-crafted request actually produces.
     *
     * <p>This is a sanity floor, not anti-cheat: a client that wants to lie by a
     * plausible amount is not stopped by any value chosen here.
     */
    static final long MIN_PLAUSIBLE_LAP_MS = 10_000L;

    private final RaceRepository races;
    private final PlayerRepository players;
    private final CarService cars;
    private final TrackService tracks;

    public RaceService(RaceRepository races, PlayerRepository players, CarService cars, TrackService tracks) {
        this.races = races;
        this.players = players;
        this.cars = cars;
        this.tracks = tracks;
    }

    /** Whether this key has already been used by this player. */
    public boolean replayExists(String playerId, String idempotencyKey) {
        return idempotencyKey != null
                && races.findByIdempotencyKeyAndPlayer_Id(idempotencyKey, playerId).isPresent();
    }

    /** The signed-in player's own races, newest first. */
    public List<RaceRecordResponse> findMine(String playerId) {
        return races.findByPlayer_IdOrderByCompletedAtDescSeqDesc(playerId).stream()
                .map(RaceRecordResponse::from)
                .toList();
    }

    /**
     * One race, but only if the caller owns it.
     *
     * @throws ResourceNotFoundException for a race that does not exist or is
     *         someone else's -- deliberately the same answer for both.
     */
    public RaceRecordResponse findMineById(String playerId, String raceId) {
        Race race = races.findById(raceId)
                .filter(r -> r.getPlayer().getId().equals(playerId))
                .orElseThrow(() -> new ResourceNotFoundException("No race record with id '" + raceId + "'"));
        return RaceRecordResponse.from(race);
    }

    /**
     * Validates and stores one completed race for the signed-in player.
     *
     * @param playerId      from the session, never from the request body.
     * @param idempotencyKey optional client key; a repeat returns the first row.
     */
    @Transactional
    public CreateRaceResponse save(String playerId, CreateRaceRequest request, String idempotencyKey) {
        // A replay is answered with the row that already exists, so a retry
        // after a dropped response cannot produce a second entry.
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            var existing = races.findByIdempotencyKeyAndPlayer_Id(idempotencyKey, playerId);
            if (existing.isPresent()) {
                log.debug("idempotent replay of race {} for player {}", idempotencyKey, playerId);
                return CreateRaceResponse.saved(existing.get());
            }
        }

        Player player = players.findById(playerId)
                .orElseThrow(() -> new ResourceNotFoundException("No player with id '" + playerId + "'"));

        if (!GameId.isWellFormed(request.carId())) {
            throw new ResourceNotFoundException("No car with id '" + request.carId() + "'");
        }
        Car car = cars.require(request.carId());

        if (!GameId.isWellFormed(request.trackId())) {
            throw new ResourceNotFoundException("No track with id '" + request.trackId() + "'");
        }
        Track track = tracks.require(request.trackId());

        // A lap cannot be slower than the whole race it sits inside.
        if (request.bestLapTimeMs() != null && request.bestLapTimeMs() > request.elapsedTimeMs()) {
            throw new InvalidRaceResultException(
                    "bestLapTimeMs (" + request.bestLapTimeMs()
                            + ") cannot be greater than elapsedTimeMs (" + request.elapsedTimeMs() + ")");
        }

        int lapsOnTrack = track.getLaps();
        if (request.lapsCompleted() > lapsOnTrack) {
            throw new InvalidRaceResultException(
                    "lapsCompleted (" + request.lapsCompleted() + ") exceeds the "
                            + lapsOnTrack + " laps on track '" + request.trackId() + "'");
        }

        // A completed lap implies at least one lap.
        if (request.lapsCompleted() == 0 && request.bestLapTimeMs() != null) {
            throw new InvalidRaceResultException(
                    "a bestLapTimeMs cannot be reported when no laps were completed");
        }

        rejectImplausibleTimes(request);

        Race record = new Race(
                newId(),
                idempotencyKey,
                player,
                car,
                track,
                request.position(),
                request.lapsCompleted(),
                lapsOnTrack,
                request.elapsedTimeMs(),
                request.bestLapTimeMs(),
                Instant.now());

        try {
            return CreateRaceResponse.saved(races.saveAndFlush(record));
        } catch (DataIntegrityViolationException ex) {
            // Two requests carrying the same key raced each other. The winner's
            // row is authoritative; return it rather than failing the loser.
            if (idempotencyKey != null && !idempotencyKey.isBlank()) {
                var winner = races.findByIdempotencyKeyAndPlayer_Id(idempotencyKey, playerId);
                if (winner.isPresent()) {
                    return CreateRaceResponse.saved(winner.get());
                }
            }
            throw ex;
        }
    }

    /**
     * Rejects times no car could physically produce.
     *
     * <p>Catches the realistic failure modes -- a division by 1000 that left
     * milliseconds where seconds were meant, a timer reset mid-race, a race
     * reported with a lap time from a different run. It is not, and cannot be, a
     * defence against a client that deliberately reports a fast but plausible
     * time.
     */
    private void rejectImplausibleTimes(CreateRaceRequest request) {
        long fastest = MIN_PLAUSIBLE_LAP_MS * Math.max(1, request.lapsCompleted());
        if (request.elapsedTimeMs() < fastest) {
            throw new InvalidRaceResultException(
                    "elapsedTimeMs (" + request.elapsedTimeMs() + ") is not plausible for "
                            + request.lapsCompleted() + " lap(s); at least " + fastest + "ms is required");
        }
        if (request.bestLapTimeMs() != null && request.bestLapTimeMs() < MIN_PLAUSIBLE_LAP_MS) {
            throw new InvalidRaceResultException(
                    "bestLapTimeMs (" + request.bestLapTimeMs()
                            + ") is faster than any car could complete a lap");
        }
    }

    private static String newId() {
        return "race_" + UUID.randomUUID().toString().substring(0, 8);
    }
}