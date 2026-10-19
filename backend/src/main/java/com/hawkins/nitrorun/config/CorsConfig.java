package com.hawkins.nitrorun.config;

import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

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
 * <p>{@code allowCredentials} is deliberately off. The API is unauthenticated and
 * sends no cookies, and turning it on would prevent the wildcard-free origin
 * list from being widened safely later.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    private final List<String> allowedOrigins;

    public CorsConfig(@Value("${nitrorun.cors.allowed-origins:}") String allowedOrigins) {
        this.allowedOrigins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList();
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (allowedOrigins.isEmpty()) {
            // Nothing configured: register no mapping at all, so the browser's
            // same-origin policy applies untouched.
            return;
        }
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins.toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "OPTIONS")
                .allowedHeaders("Content-Type", "Accept")
                .allowCredentials(false)
                .maxAge(3600);
    }
}
