package com.hawkins.nitrorun.repository;

import java.util.List;
import java.util.Optional;

import com.hawkins.nitrorun.model.Player;

/**
 * Player profiles.
 *
 * <p>In-memory for Phase 4: everything is lost when the process restarts. See
 * {@link com.hawkins.nitrorun.service.PlayerService} for the behaviour that
 * Phase 5 will make durable.
 */
public interface PlayerRepository {

    List<Player> findAll();

    Optional<Player> findById(String id);

    /**
     * Insert or replace.
     *
     * @return the stored player
     */
    Player save(Player player);

    boolean existsById(String id);
}
