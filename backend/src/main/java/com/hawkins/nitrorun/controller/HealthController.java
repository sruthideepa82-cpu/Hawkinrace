package com.hawkins.nitrorun.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.hawkins.nitrorun.dto.HealthResponse;
import com.hawkins.nitrorun.service.HealthService;

/**
 * {@code GET /api/health} -- backend status and version.
 *
 * <p>Separate from Actuator's {@code /actuator/health}, which reports JVM and
 * disk internals. This one is shaped for the frontend: it carries the phase and
 * the storage backend, which is the thing a client actually needs to know.
 */
@RestController
@RequestMapping("/api/health")
public class HealthController {

    private final HealthService health;

    public HealthController(HealthService health) {
        this.health = health;
    }

    @GetMapping
    public HealthResponse health() {
        return health.status();
    }
}
