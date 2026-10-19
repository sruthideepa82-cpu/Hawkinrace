package com.hawkins.nitrorun.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

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
 * Stores and reads completed race records. Durable since Phase 5.
 *
 * <p>What this service is responsible for is making a submitted race
 * <em>possible</em>, not just well-shaped. The DTO catches a negative time or a
 * zero position on the way in; this catches the contradictions that survive
 * that, and the schema enforces the rest with CHECK and foreign keys.
 *
 * <p><b>None of this is authentication.</b> A caller can submit any race for
 * any player, and the times are taken at face value. That is inherent to the
 * game being single-player and offline.
 */
@Service
@Transactional(readOnly = true)
public class RaceService {

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

    public List<RaceRecordResponse> findAll() {
        return races.findAllByOrderByCompletedAtDescSeqDesc().stream()
                .map(RaceRecordResponse::from)
                .toList();
    }

    public RaceRecordResponse findById(String id) {
        return races.findById(id)
                .map(RaceRecordResponse::from)
                .orElseThrow(() -> new ResourceNotFoundException("No race record with id '" + id + "'"));
    }

    /**
     * Validates and stores one completed race.
     *
     * <p>Reads the referenced Player, Car and Track as managed entities inside
     * the write transaction, so Hibernate issues three cheap primary-key
     * lookups and then a single INSERT with the foreign keys filled in.
     *
     * @throws ResourceNotFoundException   if the player, car or track is unknown.
     * @throws InvalidRaceResultException if the numbers contradict each other or
     *         the track.
     */
    @Transactional
    public CreateRaceResponse save(CreateRaceRequest request) {
        // Referenced ids must exist. 404 rather than 400: the request was
        // well-formed, it just points at something that is not there.
        Player player = players.findById(request.playerId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No player with id '" + request.playerId() + "'"));

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

        Race record = new Race(
                newId(),
                player,
                car,
                track,
                request.position(),
                request.lapsCompleted(),
                lapsOnTrack,
                request.elapsedTimeMs(),
                request.bestLapTimeMs(),
                Instant.now());

        return CreateRaceResponse.saved(races.save(record));
    }

    private static String newId() {
        return "race_" + UUID.randomUUID().toString().substring(0, 8);
    }
}