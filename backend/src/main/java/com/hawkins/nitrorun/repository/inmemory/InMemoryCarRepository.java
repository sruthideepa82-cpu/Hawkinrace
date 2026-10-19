package com.hawkins.nitrorun.repository.inmemory;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import org.springframework.stereotype.Repository;

import com.hawkins.nitrorun.model.Car;
import com.hawkins.nitrorun.repository.CarRepository;

/**
 * In-memory {@link CarRepository}, seeded from a fixed catalogue.
 *
 * <p>Read-only and immutable, so a plain unmodifiable map is enough. Concurrent
 * because Spring serves requests on multiple threads and a HashMap would be a
 * latent bug rather than a visible one.
 *
 * <p>Phase 5 deletes this class and adds a Spring Data JPA implementation of
 * {@link CarRepository}. Nothing else has to change, because services depend on
 * the interface.
 */
@Repository
public class InMemoryCarRepository implements CarRepository {

    private final Map<String, Car> carsById;

    public InMemoryCarRepository() {
        this.carsById = SeedData.cars().stream()
                .collect(Collectors.toUnmodifiableMap(Car::id, car -> car));
    }

    @Override
    public List<Car> findAll() {
        return List.copyOf(carsById.values());
    }

    @Override
    public Optional<Car> findById(String id) {
        return Optional.ofNullable(carsById.get(id));
    }

    @Override
    public boolean existsById(String id) {
        return carsById.containsKey(id);
    }
}
