package com.hawkins.nitrorun.repository.inmemory;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.stereotype.Repository;

import com.hawkins.nitrorun.model.Track;
import com.hawkins.nitrorun.repository.TrackRepository;

/**
 * In-memory {@link TrackRepository}, seeded from a fixed catalogue.
 *
 * <p>Replaced in Phase 5 by a Spring Data JPA implementation; see
 * {@link InMemoryCarRepository} for why the split is safe.
 */
@Repository
public class InMemoryTrackRepository implements TrackRepository {

    private final Map<String, Track> tracksById;

    public InMemoryTrackRepository() {
        this.tracksById = SeedData.tracks().stream()
                .collect(Collectors.toUnmodifiableMap(Track::id, track -> track));
    }

    @Override
    public List<Track> findAll() {
        return List.copyOf(tracksById.values());
    }

    @Override
    public Optional<Track> findById(String id) {
        return Optional.ofNullable(tracksById.get(id));
    }

    @Override
    public boolean existsById(String id) {
        return tracksById.containsKey(id);
    }
}
