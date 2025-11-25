// Utility functions to validate and normalize ID numbers

/**
 * Normalize an ID by trimming spaces and removing internal whitespace.
 * Leading zeros are preserved.
 * @param {string} id
 * @returns {string}
 */
function normalizeId(id) {
    if (typeof id !== 'string') {
        return '';
    }
    return id.replace(/\s+/g, '').trim();
}

/**
 * Check if the ID contains digits only.
 * @param {string} id
 */
function hasOnlyDigits(id) {
    return /^\d+$/.test(id);
}

/**
 * Check if the ID is exactly eight characters long.
 * @param {string} id
 */
function hasValidLength(id) {
    return id.length === 8;
}

/**
 * Weighted checksum where the leftmost digit is multiplied by the length,
 * down to the rightmost digit multiplied by 1. The sum must be divisible by 11.
 * @param {string} id
 */
function hasValidChecksum(id) {
    if (!hasOnlyDigits(id) || id.length === 0) {
        return false;
    }

    const digits = id.split('').map(Number);
    let sum = 0;

    for (let i = 0; i < digits.length; i++) {
        const position = digits.length - i;
        sum += digits[i] * position;
    }

    return sum % 11 === 0;
}

/**
 * Validate an ID number against all rules.
 * @param {string} rawId
 * @returns {{isValid: boolean, errors: string[], normalized: string}}
 */
function validateIdNumber(rawId) {
    const normalized = normalizeId(rawId);
    const errors = [];

    if (!normalized) {
        errors.push('ID number is required');
    } else {
        if (!hasOnlyDigits(normalized)) {
            errors.push('ID number must contain only digits');
        }

        if (!hasValidLength(normalized)) {
            errors.push('ID number must be exactly 8 digits long');
        }

        if (errors.length === 0 && !hasValidChecksum(normalized)) {
            errors.push('ID number failed the checksum validation');
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        normalized
    };
}

module.exports = {
    normalizeId,
    hasOnlyDigits,
    hasValidLength,
    hasValidChecksum,
    validateIdNumber
};

