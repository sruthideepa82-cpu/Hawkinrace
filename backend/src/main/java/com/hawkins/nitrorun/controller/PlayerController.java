package com.hawkins.nitrorun.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.hawkins.nitrorun.dto.PlayerResponse;
import com.hawkins.nitrorun.dto.RaceRecordResponse;
import com.hawkins.nitrorun.dto.UpdatePlayerRequest;
import com.hawkins.nitrorun.exception.ResourceNotFoundException;
import com.hawkins.nitrorun.security.CurrentPlayer;
import com.hawkins.nitrorun.service.PlayerService;

import jakarta.validation.Valid;

/**
 * Player profiles.
 *
 * <p>Every path here is scoped to the signed-in player. A request for someone
 * else's profile is answered 404, not 403.
 *
 * <p>404 rather than 403 is a deliberate choice: 403 would confirm the id exists,
 * which turns the endpoint into an oracle for enumerating players. "No such
 * player" is the truthful answer to someone who is not that player.
 *
 * <p><b>{@code GET /api/players} and {@code POST /api/players} are gone.</b> The
 * list was an open directory of every profile in the game. Creation moved to
 * {@code POST /api/auth/register}, which requires a password.
 */
@RestController
@RequestMapping("/api/players")
public class PlayerController {

    private final PlayerService players;

    public PlayerController(PlayerService players) {
        this.players = players;
    }

    /** The signed-in player. */
    @GetMapping("/me")
    public PlayerResponse me() {
        return players.findById(CurrentPlayer.id());
    }

    /**
     * One profile, only if it is the caller's own.
     *
     * @throws ResourceNotFoundException for any other id, deliberately
     *         indistinguishable from a genuinely missing one.
     */
    @GetMapping("/{playerId}")
    public PlayerResponse one(@PathVariable String playerId) {
        return players.findById(requireSelf(playerId));
    }

    /** Updates the caller's own profile. */
    @PutMapping("/{playerId}")
    public PlayerResponse update(@PathVariable String playerId,
                                 @Valid @RequestBody UpdatePlayerRequest request) {
        return players.update(requireSelf(playerId), request);
    }

    /** The caller's own race history, newest first. */
    @GetMapping("/{playerId}/races")
    public List<RaceRecordResponse> races(@PathVariable String playerId) {
        return players.raceHistory(requireSelf(playerId));
    }

    /**
     * Fails unless the path id is the caller.
     *
     * <p>All the scoping in this controller goes through here, so there is one
     * place to check rather than a condition repeated on every handler.
     */
    private String requireSelf(String playerId) {
        if (!CurrentPlayer.is(playerId)) {
            throw new ResourceNotFoundException("No player with id '" + playerId + "'");
        }
        return playerId;
    }
}