package com.hawkins.nitrorun.validation;

import java.util.regex.Pattern;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * Checks {@link DisplayName}.
 *
 * <p>Rules: 3 to 24 characters, starting with a letter or digit, then letters,
 * digits, spaces, underscores or hyphens.
 *
 * <p>Leading/trailing whitespace is rejected rather than trimmed, because a name
 * that silently changes when stored is worse than one that is refused -- and a
 * trimmed "steve" and an untrimmed "steve" would otherwise render as two
 * different leaderboard rows.
 *
 * <p>The pattern is ASCII on purpose. Unicode letters would let a name render as
 * right-to-left or as a confusable lookalike of another player's name.
 */
public class DisplayNameValidator implements ConstraintValidator<DisplayName, String> {

    private static final Pattern PATTERN = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9 _-]{2,23}$");

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null) {
            // @NotNull / @NotBlank own nullability. Deferring keeps one error per
            // broken field instead of two.
            return true;
        }
        return PATTERN.matcher(value).matches();
    }
}
