package com.hawkins.nitrorun.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.hawkins.nitrorun.dto.CarResponse;
import com.hawkins.nitrorun.exception.ResourceNotFoundException;
import com.hawkins.nitrorun.model.Car;
import com.hawkins.nitrorun.repository.CarRepository;

/** Reads the car catalogue. */
@Service
@Transactional(readOnly = true)
public class CarService {

    private final CarRepository cars;

    public CarService(CarRepository cars) {
        this.cars = cars;
    }

    public List<CarResponse> findAll() {
        return cars.findAll().stream().map(CarResponse::from).toList();
    }

    /**
     * @throws ResourceNotFoundException if no car has that id. 404 rather than
     *         400: a well-formed id that is not in the catalogue is a missing
     *         resource, not a malformed request.
     */
    public CarResponse findById(String id) {
        return CarResponse.from(require(id));
    }

    /** The entity, for callers that need to reference it rather than return it. */
    public Car require(String id) {
        return cars.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("No car with id '" + id + "'"));
    }

    public boolean exists(String id) {
        return id != null && cars.existsById(id);
    }
}