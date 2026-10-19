package com.hawkins.nitrorun.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.hawkins.nitrorun.dto.CreateRaceRequest;
import com.hawkins.nitrorun.dto.CreateRaceResponse;
import com.hawkins.nitrorun.dto.RaceRecordResponse;
import com.hawkins.nitrorun.service.RaceService;

import jakarta.validation.Valid;

/**
 * Completed race records.
 *
 * <p><b>Unauthenticated.</b> The client asserts that it drove the race and the API
 * stores it. Nothing verifies the times. Treat these as self-reported until
 * authentication and server-side verification land in a later phase.
 */
@RestController
@RequestMapping("/api/races")
public class RaceController {

    private final RaceService races;

    public RaceController(RaceService races) {
        this.races = races;
    }

    /**
     * {@code POST /api/races} -- 201 on success.
     *
     * <p>400 when the numbers are malformed or contradict each other (a lap time
     * longer than the race, more laps than the track has), 404 when the player,
     * car or track is unknown.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CreateRaceResponse create(@Valid @RequestBody CreateRaceRequest request) {
        return races.save(request);
    }

    /** {@code GET /api/races} */
    @GetMapping
    public List<RaceRecordResponse> all() {
        return races.findAll();
    }

    /** {@code GET /api/races/{raceId}} -- 404 when unknown. */
    @GetMapping("/{raceId}")
    public RaceRecordResponse one(@PathVariable String raceId) {
        return races.findById(raceId);
    }
}
