package com.hawkins.nitrorun.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import com.hawkins.nitrorun.service.AuthService;

/**
 * Removes expired sessions at startup.
 *
 * <p>Without this, a token table only ever grows: a session expires but its row
 * stays, so the table becomes a slow full scan of rows nobody will ever present
 * again. Sweeping once per boot is enough for a single-process deployment.
 *
 * <p>Runs as an {@link ApplicationRunner}, after Flyway has migrated -- deleting
 * from a table that does not exist yet would fail the whole boot for no reason.
 */
@Component
public class SessionJanitor implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SessionJanitor.class);

    private final AuthService auth;

    public SessionJanitor(AuthService auth) {
        this.auth = auth;
    }

    @Override
    public void run(ApplicationArguments args) {
        int purged = auth.purgeExpiredSessions();
        log.info("Session cleanup: {} expired session(s) removed", purged);
    }
}