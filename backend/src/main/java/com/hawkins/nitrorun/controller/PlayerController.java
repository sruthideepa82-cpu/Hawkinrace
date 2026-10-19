package com.hawkins.nitrorun.controller;

import java.net.URI;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.hawkins.nitrorun.dto.CreatePlayerRequest;
import com.hawkins.nitrorun.dto.PlayerResponse;
import com.hawkins.nitrorun.dto.RaceRecordResponse;
import com.hawkins.nitrorun.dto.UpdatePlayerRequest;
import com.hawkins.nitrorun.service.PlayerService;

import jakarta.validation.Valid;

/**
 * Player profiles.
 *
 * <p><b>No authentication.</b> Any caller may read, create and update any
 * profile by id. That is inherent to Phase 4: there are no accounts, so there is
 * nothing to check a caller against. It is fine for a single-player game whose
 * only writes are "I finished this race", and it must not be trusted -- see the
 * README before putting anything real behind this.
 */
@RestController
@RequestMapping("/api/players")
public class PlayerController {

    private final PlayerService players;

    public PlayerController(PlayerService players) {
        this.players = players;
    }

    /** {@code GET /api/players} */
    @GetMapping
    public List<PlayerResponse> all() {
        return players.findAll();
    }

    /** {@code GET /api/players/{playerId}} -- 404 when unknown. */
    @GetMapping("/{playerId}")
    public PlayerResponse one(@PathVariable String playerId) {
        return players.findById(playerId);
    }

    /**
     * {@code POST /api/players} -- 201 with a {@code Location} header.
     * 400 on an invalid name, 409 if the name is taken.
     */
    @PostMapping
    public ResponseEntity<PlayerResponse> create(@Valid @RequestBody CreatePlayerRequest request) {
        PlayerResponse created = players.create(request);
        return ResponseEntity.created(URI.create("/api/players/" + created.id())).body(created);
    }

    /** {@code PUT /api/players/{playerId}} -- 200, or 404 / 400 / 409. */
    @PutMapping("/{playerId}")
    public PlayerResponse update(@PathVariable String playerId,
                                 @Valid @RequestBody UpdatePlayerRequest request) {
        return players.update(playerId, request);
    }

    /**
     * {@code GET /api/players/{playerId}/races} -- that player's race history,
     * newest first. 404 when the player is unknown, which is deliberately
     * different from an empty list.
     */
    @GetMapping("/{playerId}/races")
    public List<RaceRecordResponse> races(@PathVariable String playerId) {
        return players.raceHistory(playerId);
    }
}
