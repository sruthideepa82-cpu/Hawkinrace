package com.hawkins.nitrorun.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.hawkins.nitrorun.dto.AuthDtos;
import com.hawkins.nitrorun.exception.DuplicateResourceException;
import com.hawkins.nitrorun.exception.InvalidCredentialsException;
import com.hawkins.nitrorun.model.AuthToken;
import com.hawkins.nitrorun.model.Car;
import com.hawkins.nitrorun.model.Player;
import com.hawkins.nitrorun.repository.AuthTokenRepository;
import com.hawkins.nitrorun.repository.PlayerRepository;

/**
 * Sign-up, sign-in and session lookup.
 *
 * <p>Deliberately small. This is a single-player game whose only real need for
 * identity is "do not let one person edit another person's profile or post races
 * under their name". It does not need roles, refresh tokens, password reset or
 * multi-factor anything, and adding those would be more surface to get wrong
 * than it is worth here.
 *
 * <p>Two deliberate choices:
 *
 * <ul>
 *   <li><b>Opaque hashed tokens, not JWT.</b> A JWT cannot be revoked before it
 *       expires without keeping a blocklist anyway, and this game needs logout
 *       to actually log out. The cost is one indexed SELECT per authenticated
 *       request, which is nothing next to the race work it guards.
 *   <li><b>BCrypt, not a bare digest.</b> A fast hash would let someone who
 *       obtained the database try billions of passwords per second.
 * </ul>
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    /** Long enough to outlast a sitting, short enough that a stolen token ages out. */
    static final Duration SESSION_LIFETIME = Duration.ofDays(14);

    /**
     * 32 random bytes, base64url encoded.
     *
     * <p>256 bits of entropy from {@link SecureRandom}. Nothing here is
     * guessable, so the token does not need to be short.
     */
    private static final SecureRandom RANDOM = new SecureRandom();

    private final PlayerRepository players;
    private final AuthTokenRepository tokens;
    private final CarService cars;
    private final PasswordEncoder passwordEncoder;

    public AuthService(PlayerRepository players,
                       AuthTokenRepository tokens,
                       CarService cars,
                       PasswordEncoder passwordEncoder) {
        this.players = players;
        this.tokens = tokens;
        this.cars = cars;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * Creates an account and signs it in.
     *
     * @throws DuplicateResourceException if the display name is taken.
     * @throws com.hawkins.nitrorun.exception.ResourceNotFoundException if a
     *         supplied car id is unknown.
     */
    @Transactional
    public AuthDtos.AuthResponse register(AuthDtos.RegisterRequest request) {
        if (players.findByDisplayName(request.displayName()).isPresent()) {
            throw new DuplicateResourceException(
                    "That display name is already taken");
        }

        Car car = request.selectedCarId() == null ? null : cars.require(request.selectedCarId());

        Player created = new Player(
                "plr_" + UUID.randomUUID().toString().substring(0, 8),
                request.displayName(),
                // Hashed immediately and never stored in plaintext, not even for
                // the length of this method.
                passwordEncoder.encode(request.password()),
                car,
                Instant.now());

        players.saveAndFlush(created);
        return issue(created);
    }

    /**
     * Verifies a password and issues a session.
     *
     * @throws InvalidCredentialsException for an unknown name, a wrong password,
     *         or a legacy account with no password. All three report the same
     *         message: distinguishing them would tell an attacker which display
     *         names exist.
     */
    @Transactional
    public AuthDtos.AuthResponse login(AuthDtos.LoginRequest request) {
        Player player = players.findByDisplayName(request.displayName())
                // Still runs the encoder against a dummy hash when the player is
                // missing, so "no such user" and "wrong password" take the same
                // time. Without it, response latency alone enumerates accounts.
                .orElseGet(() -> {
                    passwordEncoder.matches(request.password(),
                            "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
                    throw new InvalidCredentialsException("Incorrect display name or password");
                });

        if (!player.hasPassword() || !passwordEncoder.matches(request.password(), player.getPasswordHash())) {
            throw new InvalidCredentialsException("Incorrect display name or password");
        }

        return issue(player);
    }

    /** Signs out one session. */
    @Transactional
    public void logout(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        tokens.deleteById(hash(rawToken));
    }

    /** Signs out every session for a player. */
    @Transactional
    public void logoutEverywhere(String playerId) {
        tokens.deleteAll(tokens.findByPlayer_IdAndExpiresAtAfter(playerId, Instant.now()));
    }

    /**
     * Resolves a bearer token to the player it belongs to.
     *
     * <p>Returns empty for an unknown, malformed or expired token. An expired
     * row is deleted on the way past, so an abandoned session is cleaned up
     * whenever it is next presented rather than lingering until a sweep runs.
     */
    @Transactional
    public Optional<Player> authenticate(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return Optional.empty();
        }
        Optional<AuthToken> found = tokens.findById(hash(rawToken));
        if (found.isEmpty()) {
            return Optional.empty();
        }
        AuthToken token = found.get();
        if (token.isExpired(Instant.now())) {
            tokens.delete(token);
            return Optional.empty();
        }
        return Optional.of(token.getPlayer());
    }

    /** Removes expired sessions. Called on boot; harmless to run repeatedly. */
    @Transactional
    public int purgeExpiredSessions() {
        int removed = tokens.deleteExpired(Instant.now());
        if (removed > 0) {
            log.info("purged {} expired session(s)", removed);
        }
        return removed;
    }

    private AuthDtos.AuthResponse issue(Player player) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        Instant now = Instant.now();
        Instant expires = now.plus(SESSION_LIFETIME);
        tokens.save(new AuthToken(hash(raw), player, now, expires));

        return AuthDtos.AuthResponse.of(raw, expires.toString(), player);
    }

    /**
     * SHA-256 of the bearer token.
     *
     * <p>Hex so the column is a plain 64-character string and an index on it is
     * exact. A fast hash is the right choice here precisely because the input is
     * already 256 bits of entropy: there is nothing to brute-force, and this is
     * about not storing a usable credential.
     */
    static String hash(String raw) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            // SHA-256 is required of every JVM; if it is missing the platform is
            // broken and there is nothing sensible to fall back to.
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }
}