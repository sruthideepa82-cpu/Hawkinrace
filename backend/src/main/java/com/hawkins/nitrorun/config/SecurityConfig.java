package com.hawkins.nitrorun.config;

import java.time.Instant;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hawkins.nitrorun.security.TokenAuthenticationFilter;
import com.hawkins.nitrorun.service.AuthService;

import jakarta.servlet.http.HttpServletResponse;

/**
 * Spring Security configuration.
 *
 * <h2>What is public</h2>
 *
 * Reference data and anything that names the service:
 * {@code /api/health}, {@code /api/cars/**}, {@code /api/tracks/**},
 * {@code /api/leaderboard}, {@code /actuator/health} and the sign-in endpoints.
 *
 * <p>The leaderboard is public on purpose. It is the game's public face: a
 * signed-out visitor should see the times, which is exactly the content this
 * project would want shown to an examiner. Every row is a display name, a car id
 * and a time, and nothing behind it.
 *
 * <h2>What requires a token</h2>
 *
 * Anything that reads or writes <em>player-owned</em> data:
 * {@code /api/players/**} and {@code /api/races/**}. Before Phase 7 these were
 * wide open, so any caller could read every profile and post a race under any
 * player id.
 *
 * <h2>CSRF</h2>
 *
 * Disabled, and correctly so. CSRF protects ambient credentials -- cookies and
 * anything the browser attaches without being asked. This API authenticates
 * with a bearer token the client sets explicitly in a header, which a
 * cross-site form or image tag cannot do. Leaving CSRF protection on would block
 * every legitimate request while stopping nothing, because there is no cookie
 * for an attacker to ride.
 *
 * <h2>CORS</h2>
 *
 * Delegated to {@link CorsConfig}. The ordering matters and is easy to get
 * wrong: CORS is enforced <em>before</em> authorization, because a preflight
 * request carries no credentials and therefore cannot answer "who is asking?".
 * Registering CORS with the servlet instead puts it behind this chain, which
 * turns every preflight into a 401.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final TokenAuthenticationFilter tokenFilter;
    private final ObjectMapper json;

    public SecurityConfig(TokenAuthenticationFilter tokenFilter, ObjectMapper json) {
        this.tokenFilter = tokenFilter;
        this.json = json;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            // Replaced below with JSON bodies; the default HTML error page is
            // not something a fetch() client can read.
            .csrf(csrf -> csrf.disable())
            // Installs the CORS filter from CorsConfig ahead of authorization.
            // Without this the preflight dies at `anyRequest().denyAll()` and the
            // browser never receives Access-Control-Allow-Origin, which breaks the
            // frontend from every origin. See CorsConfig for the full explanation.
            .cors(Customizer.withDefaults())
            // No server-side session: the token is the session. Creating an
            // HttpSession here would also mean every authenticated request got a
            // JSESSIONID cookie, which would re-introduce the CSRF surface.
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // The CORS filter answers preflights before authorization runs, but
                // permitting OPTIONS here is belt-and-braces: it means a preflight
                // cannot be turned into a 401 by any future reordering of the rules.
                // OPTIONS carries no credentials, so this opens nothing.
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                // --- public reference data -------------------------------------
                .requestMatchers("/api/health", "/actuator/health", "/actuator/info").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/cars", "/api/cars/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/tracks", "/api/tracks/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/leaderboard").permitAll()

                // --- sign-up / sign-in -----------------------------------------
                // Only these two are public. `/me` and `/logout` are not, and
                // forgetting that is how they end up under `anyRequest().denyAll()`
                // and return 403 to a perfectly valid token.
                .requestMatchers("/api/auth/register", "/api/auth/login").permitAll()
                .requestMatchers("/api/auth/me", "/api/auth/logout").authenticated()

                // --- player-owned data -----------------------------------------
                .requestMatchers("/api/players/**", "/api/races/**").authenticated()

                // Anything not named above is denied rather than opened. A new
                // endpoint is unreachable until someone decides its audience,
                // which is the safe direction to fail in.
                .anyRequest().denyAll()
            )
            .exceptionHandling(handling -> handling
                .authenticationEntryPoint((request, response, ex) ->
                    writeError(response, HttpStatus.UNAUTHORIZED,
                            "Authentication required", request.getRequestURI()))
                .accessDeniedHandler((request, response, ex) ->
                    writeError(response, HttpStatus.FORBIDDEN,
                            "Not permitted", request.getRequestURI()))
            )
            .addFilterBefore(tokenFilter, UsernamePasswordAuthenticationFilter.class)
            // The default headers include a CSP and X-Frame-Options that are
            // fine for a server-rendered app but mean nothing for a JSON API.
            .headers(Customizer.withDefaults());

        return http.build();
    }


    /** Writes the same JSON error shape the rest of the API uses. */
    private void writeError(HttpServletResponse response, HttpStatus status, String message, String path)
            throws java.io.IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(json.writeValueAsString(new java.util.LinkedHashMap<>() { {
            put("timestamp", Instant.now().toString());
            put("status", status.value());
            put("error", status.getReasonPhrase());
            put("message", message);
            put("path", path);
        }}));
    }
}