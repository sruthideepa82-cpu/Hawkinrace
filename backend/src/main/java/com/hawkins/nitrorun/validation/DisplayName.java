package com.hawkins.nitrorun.validation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * A player display name.
 *
 * <p>Deliberately more than {@code @NotBlank}: this value is rendered on the
 * leaderboard, so it is constrained to something that can be shown safely and
 * cannot be used to impersonate the layout. The rules live in
 * {@link DisplayNameValidator} so the same rule can be reused anywhere a name is
 * accepted, rather than being restated per DTO.
 */
@Documented
@Constraint(validatedBy = DisplayNameValidator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface DisplayName {

    String message() default "must be 3-24 characters: letters, digits, spaces, underscores or hyphens";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
