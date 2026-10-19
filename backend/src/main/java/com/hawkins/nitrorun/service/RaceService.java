package com.hawkins.nitrorun.service;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.hawkins.nitrorun.dto.CreateRaceRequest;
import com.hawkins.nitrorun.dto.CreateRaceResponse;
import com.hawkins.nitrorun.dto.RaceRecordResponse;
import com.hawkins.nitrorun.exception.InvalidRaceResultException;
import com.hawkins.nitrorun.exception.ResourceNotFoundException;
import com.hawkins.nitrorun.model.RaceRecord;
import com.hawkins.nitrorun.repository.PlayerRepository;
import com.hawkins.nitrorun.repository.RaceRecordRepository;
import com.hawkins.nitrorun.validation.GameId;

import java.time.Instant;

/**
 * Stores and reads completed race records.
 *
 * <p><b>Records are lost on restart.</b> Phase 5 makes this durable.
 *
 * <p>What this service is responsible for is making a submitted race
 * <em>possible</em>, not just well-shaped. The DTO catches a negative time or a
 * zero position on the way in; this catches the contradictions that survive that:
 * a lap time longer than the whole race, more laps than the track has, or an id
 * for a car or track that does not exist. Those are checked here because they
 * need the catalogue, which validation annotations cannot see.
 *
 * <p><b>None of this is authentication.</b> A caller can submit any race for any
 * player. That is inherent to Phase 4 and is called out in the README.
 */
@Service
public class RaceService {

    private final RaceRecordRepository races;
    private final PlayerRepository players;
    private final CarService cars;
    private final TrackService tracks;

    public RaceService(RaceRecordRepository races, PlayerRepository players, CarService cars, TrackService tracks) {
        this.races = races;
        this.players = players;
        this.cars = cars;
        this.tracks = tracks;
    }

    public List<RaceRecordResponse> findAll() {
        return races.findAll().stream().map(RaceRecordResponse::from).toList();
    }

    public RaceRecordResponse findById(String id) {
        return races.findAll().stream()
                .filter(r -> r.id().equals(id))
                .findFirst()
                .map(RaceRecordResponse::from)
                .orElseThrow(() -> new ResourceNotFoundException("No race record with id '" + id + "'"));
    }

    /**
     * Validates and stores one completed race.
     *
     * @throws ResourceNotFoundException   if the player, car or track is unknown.
     * @throws InvalidRaceResultException if the numbers contradict each other or
     *         the track.
     */
    public CreateRaceResponse save(CreateRaceRequest request) {
        // Referenced ids must exist. 404 rather than 400: the request was
        // well-formed, it just points at something that is not there.
        if (!players.existsById(request.playerId())) {
            throw new ResourceNotFoundException("No player with id '" + request.playerId() + "'");
        }
        if (!GameId.isWellFormed(request.carId()) || !cars.exists(request.carId())) {
            throw new ResourceNotFoundException("No car with id '" + request.carId() + "'");
        }
        if (!GameId.isWellFormed(request.trackId()) || !tracks.exists(request.trackId())) {
            throw new ResourceNotFoundException("No track with id '" + request.trackId() + "'");
        }

        // A lap cannot be slower than the whole race it sits inside.
        if (request.bestLapTimeMs() != null && request.bestLapTimeMs() > request.elapsedTimeMs()) {
            throw new InvalidRaceResultException(
                    "bestLapTimeMs (" + request.bestLapTimeMs()
                            + ") cannot be greater than elapsedTimeMs (" + request.elapsedTimeMs() + ")");
        }

        // Cannot have run more laps than the track has, even by a failed race that
        // was abandoned part-way through a lap.
        int lapsOnTrack = tracks.lapsOf(request.trackId());
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

        RaceRecord record = new RaceRecord(
                "race_" + UUID.randomUUID().toString().substring(0, 8),
                request.playerId(),
                request.carId(),
                request.trackId(),
                request.position(),
                request.lapsCompleted(),
                request.elapsedTimeMs(),
                request.bestLapTimeMs(),
                Instant.now());

        return CreateRaceResponse.saved(races.append(record));
    }
}
