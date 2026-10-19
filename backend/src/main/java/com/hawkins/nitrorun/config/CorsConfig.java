package com.hawkins.nitrorun.config;

import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * CORS for the browser client.
 *
 * <p>Origins come from {@code nitrorun.cors.allowed-origins}, which each profile
 * sets: the dev profile lists the Vite dev server, production takes the value
 * from {@code CORS_ALLOWED_ORIGINS} with <b>no default</b>.
 *
 * <p>An empty list means no browser origin is granted access. That is the safe
 * failure mode: a missing env var in production should close the API to browsers,
 * not open it to every origin on the internet.
 *
 * <h2>Why this is a bean and not a WebMvcConfigurer</h2>
 *
 * <p>A {@code WebMvcConfigurer#addCorsMappings} registers CORS inside the
 * DispatcherServlet, which sits <em>behind</em> the Spring Security filter chain.
 * Once Phase 7 added security, that ordering broke the browser completely: the
 * security chain rejected the {@code OPTIONS} preflight with 401 before the
 * servlet ever saw it, so no {@code Access-Control-Allow-Origin} header was ever
 * produced and the frontend could not call the API from <em>any</em> page, for
 * any origin, including the public ones. Exposing a {@link CorsConfigurationSource}
 * instead lets Spring Security install a CORS filter <em>ahead</em> of
 * authorization, which is the order the protocol requires: a preflight carries no
 * credentials, so it must be answered before the question "who is asking?" is
 * asked. There is now exactly one place that knows the rules.
 *
 * <h2>allowCredentials stays false</h2>
 *
 * <p>The API authenticates with a bearer token the client sets explicitly in a
 * header, not with a cookie, so nothing ambient is sent and credentials mode is
 * correctly {@code omit}. Turning it on would not help, and it would prevent the
 * explicit origin list from later being relaxed safely.
 */
@Configuration
public class CorsConfig {

    private final List<String> allowedOrigins;

    public CorsConfig(@Value("${nitrorun.cors.allowed-origins:}") String allowedOrigins) {
        this.allowedOrigins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList();
    }

    /**
     * The single CORS rule set, consumed by the Spring Security filter chain.
     *
     * <p>{@code Authorization} must be listed explicitly. It is not one of the
     * CORS-safelisted headers, so a browser treats any authenticated request as
     * non-simple and preflights it -- and refuses the real request unless the
     * response says {@code Authorization} is permitted. Omitting it fails closed
     * and silently: the API would look healthy from curl and be unreachable from
     * the actual client.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        if (allowedOrigins.isEmpty()) {
            // Nothing configured: permit no browser origin at all, so the
            // same-origin policy applies untouched.
            config.setAllowedOrigins(List.of());
        } else {
            config.setAllowedOrigins(allowedOrigins);
        }
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type", "Accept", "Authorization"));
        config.setExposedHeaders(List.of("Idempotency-Key"));
        config.setAllowCredentials(false);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}