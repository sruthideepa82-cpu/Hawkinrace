package com.hawkins.nitrorun.service;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.hawkins.nitrorun.dto.CreatePlayerRequest;
import com.hawkins.nitrorun.dto.PlayerResponse;
import com.hawkins.nitrorun.dto.RaceRecordResponse;
import com.hawkins.nitrorun.dto.UpdatePlayerRequest;
import com.hawkins.nitrorun.exception.DuplicateResourceException;
import com.hawkins.nitrorun.exception.ResourceNotFoundException;
import com.hawkins.nitrorun.model.Player;
import com.hawkins.nitrorun.repository.PlayerRepository;
import com.hawkins.nitrorun.repository.RaceRecordRepository;

import java.time.Instant;

/**
 * Player profiles.
 *
 * <p><b>Phase 4 stores nothing durably</b> -- every profile is lost on restart.
 * See {@link com.hawkins.nitrorun.model.Player} for why that is acceptable
 * here and what has to change before it is not.
 *
 * <p>Ids are generated server-side. A client cannot choose its own, because in
 * this phase the id is the only thing distinguishing one self-reported profile
 * from another, and letting a caller pick it would let them overwrite someone
 * else's profile by guessing.
 */
@Service
public class PlayerService {

    private final PlayerRepository players;
    private final RaceRecordRepository races;
    private final CarService cars;

    public PlayerService(PlayerRepository players, RaceRecordRepository races, CarService cars) {
        this.players = players;
        this.races = races;
        this.cars = cars;
    }

    public List<PlayerResponse> findAll() {
        return players.findAll().stream().map(PlayerResponse::from).toList();
    }

    public PlayerResponse findById(String id) {
        return PlayerResponse.from(require(id));
    }

    /**
     * Creates a profile.
     *
     * @throws DuplicateResourceException if the display name is already taken.
     *         Names are the identity a player actually recognises, so a second
     *         profile with the same one is a conflict rather than a new row.
     * @throws ResourceNotFoundException   if a car id was supplied but is unknown.
     */
    public PlayerResponse create(CreatePlayerRequest request) {
        if (findByDisplayName(request.displayName()).isPresent()) {
            throw new DuplicateResourceException(
                    "A player named '" + request.displayName() + "' already exists");
        }
        if (request.selectedCarId() != null && !cars.exists(request.selectedCarId())) {
            throw new ResourceNotFoundException("No car with id '" + request.selectedCarId() + "'");
        }

        Player created = new Player(
                newId(),
                request.displayName(),
                request.selectedCarId(),
                Instant.now());
        return PlayerResponse.from(players.save(created));
    }

    /**
     * Replaces the editable fields of a profile.
     *
     * <p>The path id wins: {@code createdAt} is preserved and the identity is not
     * reassigned, so a PUT cannot be used to take over another id.
     *
     * @throws DuplicateResourceException if the new name collides with a
     *         different player's.
     */
    public PlayerResponse update(String id, UpdatePlayerRequest request) {
        Player existing = require(id);

        findByDisplayName(request.displayName())
                .filter(other -> !other.id().equals(id))
                .ifPresent(other -> {
                    throw new DuplicateResourceException(
                            "A player named '" + request.displayName() + "' already exists");
                });

        if (request.selectedCarId() != null && !cars.exists(request.selectedCarId())) {
            throw new ResourceNotFoundException("No car with id '" + request.selectedCarId() + "'");
        }

        Player updated = new Player(
                existing.id(),
                request.displayName(),
                request.selectedCarId(),
                existing.createdAt());
        return PlayerResponse.from(players.save(updated));
    }

    /**
     * A player's race history, newest first.
     *
     * <p>404 if the player does not exist, rather than an empty list: "no races
     * yet" and "no such player" are different answers and the client needs to be
     * able to tell them apart.
     */
    public List<RaceRecordResponse> raceHistory(String id) {
        require(id);
        return races.findByPlayerId(id).stream().map(RaceRecordResponse::from).toList();
    }

    private Player require(String id) {
        return players.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("No player with id '" + id + "'"));
    }

    private java.util.Optional<Player> findByDisplayName(String displayName) {
        String needle = displayName.trim().toLowerCase(java.util.Locale.ROOT);
        return players.findAll().stream()
                .filter(p -> p.displayName().trim().toLowerCase(java.util.Locale.ROOT).equals(needle))
                .findFirst();
    }

    /** Short random id. Unique enough for a single-process, in-memory store. */
    private static String newId() {
        return "plr_" + UUID.randomUUID().toString().substring(0, 8);
    }

}
