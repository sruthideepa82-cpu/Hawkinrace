package com.hawkins.nitrorun.controller;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.hawkins.nitrorun.dto.AuthDtos;
import com.hawkins.nitrorun.dto.PlayerResponse;
import com.hawkins.nitrorun.security.CurrentPlayer;
import com.hawkins.nitrorun.service.AuthService;
import com.hawkins.nitrorun.service.PlayerService;

import jakarta.validation.Valid;

/**
 * Sign-up, sign-in, sign-out and "who am I".
 *
 * <p>The whole authentication surface, deliberately kept in one controller so
 * its size is visible rather than scattered.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final String BEARER = "Bearer ";

    private final AuthService auth;
    private final PlayerService players;

    public AuthController(AuthService auth, PlayerService players) {
        this.auth = auth;
        this.players = players;
    }

    /**
     * {@code POST /api/auth/register} -- create an account and sign in.
     *
     * <p>201 rather than 200 because a player now exists. The old
     * {@code POST /api/players} was removed: it created an unowned profile with
     * no credentials, which is precisely the thing this endpoint replaces.
     */
    @PostMapping("/register")
    public ResponseEntity<AuthDtos.AuthResponse> register(@Valid @RequestBody AuthDtos.RegisterRequest request) {
        AuthDtos.AuthResponse response = auth.register(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .header("Location", "/api/auth/me")
                .header("Authorization", BEARER + response.token())
                .body(response);
    }

    /** {@code POST /api/auth/login} -- exchange a password for a session token. */
    @PostMapping("/login")
    public AuthDtos.AuthResponse login(@Valid @RequestBody AuthDtos.LoginRequest request) {
        return auth.login(request);
    }

    /**
     * {@code POST /api/auth/logout} -- revoke the token that made this request.
     *
     * <p>Always 204, even with no token. A caller asking to be signed out is
     * either already signed out or holding something invalid, and in both cases
     * it is signed out afterwards; reporting a failure would be noise.
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestHeader(value = "Authorization", required = false) String authorization) {
        auth.logout(tokenFrom(authorization));
        return ResponseEntity.noContent().build();
    }

    /** {@code GET /api/auth/me} -- the signed-in player. Proves a token works. */
    @GetMapping("/me")
    public PlayerResponse me() {
        return players.findById(CurrentPlayer.id());
    }


    private static String tokenFrom(String authorization) {
        if (authorization == null || !authorization.startsWith(BEARER)) {
            return null;
        }
        String token = authorization.substring(BEARER.length()).trim();
        return token.isEmpty() ? null : token;
    }
}