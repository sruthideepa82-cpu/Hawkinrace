package com.hawkins.nitrorun.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.hawkins.nitrorun.model.Player;

/**
 * Player profiles.
 *
 * <p>Durable since Phase 5: profiles survive a restart.
 */
public interface PlayerRepository extends JpaRepository<Player, String> {

    /**
     * Case-insensitive lookup by display name.
     *
     * <p>Exists so the duplicate-name check is one indexed SELECT rather than
     * loading every player and filtering in Java.
     *
     * <p><b>Race condition:</b> two requests can both find nothing and both
     * insert. The database UNIQUE constraint is what actually prevents the
     * duplicate, and the resulting {@code DataIntegrityViolationException} is
     * translated to a 409 by the service layer. This method is the fast path,
     * not the guarantee.
     */
    @Query("select p from Player p where lower(p.displayName) = lower(:name)")
    Optional<Player> findByDisplayName(@Param("name") String name);
}