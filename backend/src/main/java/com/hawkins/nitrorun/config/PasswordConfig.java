package com.hawkins.nitrorun.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Password hashing.
 *
 * <p>Lives apart from {@link SecurityConfig} on purpose.
 *
 * <p>{@code SecurityConfig} needs the token filter, the filter needs
 * {@code AuthService}, and {@code AuthService} needs a {@code PasswordEncoder}.
 * When the encoder was declared inside {@code SecurityConfig} that closed a loop
 * and the context refused to start with "a bean is currently in creation". Split
 * it out and each side depends only on what it actually uses.
 */
@Configuration
public class PasswordConfig {

    /**
     * BCrypt at strength 10.
     *
     * <p>10 is Spring's default and the usual balance: slow enough that cracking
     * a stolen hash offline is expensive, fast enough that signing in does not
     * feel sluggish. Salting is automatic and per-password, so two players
     * choosing the same password get different hashes.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(10);
    }
}