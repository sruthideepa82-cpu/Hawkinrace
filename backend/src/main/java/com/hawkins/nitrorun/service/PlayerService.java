package com.hawkins.nitrorun.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.hawkins.nitrorun.dto.CreatePlayerRequest;
import com.hawkins.nitrorun.dto.PlayerResponse;
import com.hawkins.nitrorun.dto.RaceRecordResponse;
import com.hawkins.nitrorun.dto.UpdatePlayerRequest;
import com.hawkins.nitrorun.exception.DuplicateResourceException;
import com.hawkins.nitrorun.exception.ResourceNotFoundException;
import com.hawkins.nitrorun.model.Car;
import com.hawkins.nitrorun.model.Player;
import com.hawkins.nitrorun.repository.PlayerRepository;
import com.hawkins.nitrorun.repository.RaceRepository;

/**
 * Player profiles. Durable since Phase 5.
 *
 * <p><b>Not authenticated.</b> Anyone may read, create and update any profile.
 * See {@link Player} for why that is acceptable here and what must change
 * before it is not.
 *
 * <p>Ids are generated server-side. A client cannot choose its own, because in
 * this phase the id is the only thing distinguishing one self-reported profile
 * from another, and letting a caller pick it would let them overwrite someone
 * else&apos;s profile by guessing.
 */
@Service
@Transactional(readOnly = true)
public class PlayerService {

    private final PlayerRepository players;
    private final RaceRepository races;
    private final CarService cars;

    public PlayerService(PlayerRepository players, RaceRepository races, CarService cars) {
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
     * A player's race history, newest first. One indexed query.
     *
     * <p>404 if the player does not exist, rather than an empty list: "no races
     * yet" and "no such player" are different answers and the client needs to be
     * able to tell them apart.
     */
    public List<RaceRecordResponse> raceHistory(String id) {
        require(id);
        return races.findByPlayer_IdOrderByCompletedAtDescSeqDesc(id)
                .stream()
                .map(RaceRecordResponse::from)
                .toList();
    }

    /**
     * Creates a profile.
     *
     * @throws DuplicateResourceException if the display name is taken.
     * @throws ResourceNotFoundException   if a car id was supplied but is unknown.
     */
    @Transactional
    public PlayerResponse create(CreatePlayerRequest request) {
        if (players.findByDisplayName(request.displayName()).isPresent()) {
            throw duplicate(request.displayName());
        }

        Player created = new Player(
                newId(),
                request.displayName(),
                resolveCar(request.selectedCarId()),
                Instant.now());

        return PlayerResponse.from(flush(created, request.displayName()));
    }

    /**
     * Replaces the editable fields of a profile.
     *
     * <p>The path id wins: {@code createdAt} is preserved and the identity is not
     * reassigned, so a PUT cannot be used to take over another id.
     */
    @Transactional
    public PlayerResponse update(String id, UpdatePlayerRequest request) {
        Player existing = require(id);

        // A player keeping their own name is not a collision; a different player
        // claiming it is.
        players.findByDisplayName(request.displayName())
                .filter(other -> !other.getId().equals(id))
                .ifPresent(other -> {
                    throw duplicate(request.displayName());
                });

        existing.setDisplayName(request.displayName());
        existing.setSelectedCar(resolveCar(request.selectedCarId()));
        existing.setUpdatedAt(Instant.now());

        return PlayerResponse.from(flush(existing, request.displayName()));
    }

    private Player require(String id) {
        return players.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("No player with id '" + id + "'"));
    }

    private Car resolveCar(String carId) {
        return carId == null ? null : cars.require(carId);
    }

    /**
     * Saves and flushes, translating the unique-constraint violation into a 409.
     *
     * <p>{@code save} alone may defer the INSERT until the transaction commits,
     * which would put the exception outside this method and surface as a 500.
     * Flushing here makes the check happen while the violation can still be
     * reported properly.
     *
     * <p>The service-level existence check above is the fast path; this is the
     * real guarantee, and the only one that holds when two requests race.
     */
    private Player flush(Player player, String displayName) {
        try {
            return players.saveAndFlush(player);
        } catch (DataIntegrityViolationException ex) {
            throw duplicate(displayName);
        }
    }

    private static DuplicateResourceException duplicate(String displayName) {
        return new DuplicateResourceException(
                "A player named '" + displayName + "' already exists");
    }

    /** Short random id. Uniqueness is finally enforced by the primary key. */
    private static String newId() {
        return "plr_" + UUID.randomUUID().toString().substring(0, 8);
    }
}