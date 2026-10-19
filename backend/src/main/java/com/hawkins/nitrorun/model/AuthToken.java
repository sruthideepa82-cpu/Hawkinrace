package com.hawkins.nitrorun.model;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * A signed-in session.
 *
 * <p>The token is stored <b>hashed</b>. The plaintext is generated once, handed
 * to the client in an {@code Authorization: Bearer} header, and never written
 * anywhere. Storing the hash means a database dump cannot be replayed as a set
 * of live sessions -- the attacker gets hashes that cannot be presented as
 * tokens -- and it makes logout a genuine revocation, because deleting the row
 * stops working immediately.
 *
 * <p>Not an account. It proves "this request is from the player who signed in",
 * and nothing more.
 */
@Entity
@Table(name = "auth_tokens")
public class AuthToken {

    /** SHA-256 of the bearer token, hex encoded. */
    @Id
    @Column(name = "token_hash", length = 64, nullable = false)
    private String tokenHash;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "player_id", nullable = false)
    private Player player;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    protected AuthToken() {
    }

    public AuthToken(String tokenHash, Player player, Instant createdAt, Instant expiresAt) {
        this.tokenHash = tokenHash;
        this.player = player;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public Player getPlayer() {
        return player;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    /** True once the session is past its lifetime. */
    public boolean isExpired(Instant now) {
        return now.isAfter(expiresAt);
    }
}