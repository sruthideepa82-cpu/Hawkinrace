package com.hawkins.nitrorun.repository;

import java.time.Instant;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.hawkins.nitrorun.model.AuthToken;

/** Live sessions. */
public interface AuthTokenRepository extends JpaRepository<AuthToken, String> {

    /**
     * Sessions belonging to a player that have not expired.
     *
     * Used by "sign out everywhere", so it is scoped to one player rather than
     * being a global sweep.
     */
    List<AuthToken> findByPlayer_IdAndExpiresAtAfter(String playerId, Instant now);

    /**
     * Deletes sessions that expired before {@code now}.
     *
     * <p>Kept because an abandoned session row is a permanent row: nothing else
     * removes it, and the table would otherwise grow without bound.
     */
    @Modifying
    @Query("delete from AuthToken t where t.expiresAt < :now")
    int deleteExpired(@Param("now") Instant now);
}