package com.hawkins.nitrorun;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.hawkins.nitrorun.repository.inmemory.InMemoryCarRepository;
import com.hawkins.nitrorun.repository.inmemory.InMemoryPlayerRepository;
import com.hawkins.nitrorun.repository.inmemory.InMemoryRaceRecordRepository;
import com.hawkins.nitrorun.repository.inmemory.InMemoryTrackRepository;

/**
 * The context starts with no database.
 *
 * <p>This is the test that would have failed before Phase 4 was put right: with
 * the JPA starter and a {@code spring.datasource.url} present, the application
 * refused to boot without MySQL. Loading here proves the in-memory stores satisfy
 * every repository interface on their own, which is the condition for "does not
 * require MySQL to start".
 */
@SpringBootTest
class NitroRunApplicationTests {

    @Autowired
    private InMemoryCarRepository cars;

    @Autowired
    private InMemoryTrackRepository tracks;

    @Autowired
    private InMemoryPlayerRepository players;

    @Autowired
    private InMemoryRaceRecordRepository races;

    @Test
    void contextLoadsWithoutADatabase() {
        org.junit.jupiter.api.Assertions.assertNotNull(cars);
        org.junit.jupiter.api.Assertions.assertNotNull(tracks);
        org.junit.jupiter.api.Assertions.assertNotNull(players);
        org.junit.jupiter.api.Assertions.assertNotNull(races);
    }

    @Test
    void theCataloguesAreSeededOnBoot() {
        org.junit.jupiter.api.Assertions.assertEquals(4, cars.findAll().size());
        org.junit.jupiter.api.Assertions.assertEquals(5, tracks.findAll().size());
    }
}