package com.hawkins.nitrorun.repository.inmemory;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Repository;

import com.hawkins.nitrorun.model.Player;
import com.hawkins.nitrorun.repository.PlayerRepository;

/**
 * In-memory {@link PlayerRepository}.
 *
 * <p><b>Everything here is lost on restart.</b> That is the Phase 4 contract and
 * it is why {@code GET /api/health} reports the storage backend, so nobody
 * mistakes this for a database.
 */
@Repository
public class InMemoryPlayerRepository implements PlayerRepository {

    private final Map<String, Player> playersById = new ConcurrentHashMap<>();

    @Override
    public List<Player> findAll() {
        return List.copyOf(playersById.values());
    }

    @Override
    public Optional<Player> findById(String id) {
        return Optional.ofNullable(playersById.get(id));
    }

    @Override
    public Player save(Player player) {
        playersById.put(player.id(), player);
        return player;
    }

    @Override
    public boolean existsById(String id) {
        return playersById.containsKey(id);
    }

    /**
     * Drops every profile.
     *
     * <p>Exists so tests start from a known state without paying to rebuild the
     * Spring context. Not part of {@link PlayerRepository}: production code has
     * no business calling it.
     */
    public void clear() {
        playersById.clear();
    }
}
